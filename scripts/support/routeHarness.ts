// API 함수(route.ts)를 진짜 서버·DB 없이 실행해 보는 테스트 도구.
//   installRouteHooks(): "@/..." 경로, 확장자 없는 import, JSON import 를 node 에서 풀고, next/server·lib/supabaseServer 를 가짜로 바꾼다.
//   FakeDb: 메모리에서 흉내 내는 Supabase. 저장 시도는 writes 에 모두 남는다 (403 뒤 저장이 없었는지 확인용).
// head 조회의 실제 동작도 흉내 낸다 (2026-11-01 실제 DB 로 확인):
//   없는 표 + head → 오류 없음(204, count null), 없는 칸 + head → 코드 없는 오류. 일반 조회는 PGRST205 / 42703.

import { existsSync, readFileSync, statSync } from 'node:fs'
import nodeModule from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..', '..')

const STUB_NEXT_SERVER = `
export const NextResponse = { json: (body, init) => Response.json(body, init) }
export class NextRequest extends Request {
  get nextUrl() { return new URL(this.url) }
}
`
const STUB_SUPABASE_SERVER = `export async function createClient() { return globalThis.__fakeSupabase }`

function findFile(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, `${base}/index.ts`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

// registerHooks 는 node 22.15 부터 있고, 프로젝트의 @types/node(20) 에는 아직 형식이 없다
type Resolved = { url: string; shortCircuit?: boolean }
type Loaded = { format: string; source: string; shortCircuit?: boolean }
type Hooks = {
  resolve(specifier: string, context: { parentURL?: string }, next: (s: string, c: { parentURL?: string }) => Resolved): Resolved
  load(url: string, context: unknown, next: (u: string, c: unknown) => Loaded): Loaded
}
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: Hooks): void }

let installed = false
export function installRouteHooks() {
  if (installed) return
  installed = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'next/server') return { url: 'stub:next-server', shortCircuit: true }
      if (specifier === '@/lib/supabaseServer') return { url: 'stub:supabase-server', shortCircuit: true }
      if (specifier.startsWith('@/')) {
        const file = findFile(resolve(ROOT, specifier.slice(2)))
        if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
      }
      if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
        const file = findFile(resolve(fileURLToPath(new URL('.', context.parentURL)), specifier))
        if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      if (url === 'stub:next-server') return { format: 'module', source: STUB_NEXT_SERVER, shortCircuit: true }
      if (url === 'stub:supabase-server') return { format: 'module', source: STUB_SUPABASE_SERVER, shortCircuit: true }
      if (url.startsWith('file:') && url.endsWith('.json')) {
        return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf-8')}`, shortCircuit: true }
      }
      return nextLoad(url, context)
    },
  })
}

type Row = Record<string, unknown>
type DbError = { code?: string; message: string }
export type Write = { table: string; op: 'insert' | 'upsert' | 'update' | 'delete'; rows: Row[] }

export class FakeDb {
  tables: Record<string, Row[]>
  writes: Write[] = []
  reads: string[] = []
  missingTables = new Set<string>()
  missingColumns = new Set<string>() // 'students.status'
  failing = new Map<string, DbError>() // 표 이름 → 강제 오류
  rpcHandlers: Record<string, (args: Row) => { data?: unknown; error?: DbError | null }> = {}
  rpcCalls: { name: string; args: Row }[] = []
  loggedIn = true
  // 표의 기본값 (DB 의 default 흉내)
  defaults: Record<string, Row> = {
    classes: { status: 'active', target_grades: [], closed_on: null },
    class_students: { left_on: null },
  }
  private seq = 0

  constructor(tables: Record<string, Row[]> = {}) {
    this.tables = tables
  }

  // createClient() 가 돌려줄 객체로 등록한다
  use() {
    ;(globalThis as unknown as { __fakeSupabase: unknown }).__fakeSupabase = this.client()
    return this
  }

  client() {
    return {
      auth: {
        getUser: async () => ({
          data: { user: this.loggedIn ? { id: 'me' } : null },
          error: this.loggedIn ? null : { message: 'no session' },
        }),
      },
      from: (table: string) => new FakeQuery(this, table),
      rpc: async (name: string, args: Row) => {
        this.rpcCalls.push({ name, args })
        const handler = this.rpcHandlers[name]
        if (!handler) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } }
        const r = handler(args)
        return { data: r.data ?? null, error: r.error ?? null }
      },
    } as never
  }

  nextId() {
    return `new-${++this.seq}`
  }

  writesTo(table: string) {
    return this.writes.filter((w) => w.table === table)
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null; status: number }> {
  private filters: ((row: Row) => boolean)[] = []
  private op: 'select' | Write['op'] = 'select'
  private payload: Row[] = []
  private patch: Row = {}
  private columns = '*'
  private head = false
  private wantCount = false
  private single_: 'single' | 'maybe' | null = null
  private limitTo: number | null = null
  private rangeOf: [number, number] | null = null
  private orderBy: { column: string; ascending: boolean } | null = null
  private db: FakeDb
  private table: string

  constructor(db: FakeDb, table: string) {
    this.db = db
    this.table = table
  }

  select(columns = '*', opts?: { head?: boolean; count?: string }) {
    this.columns = columns
    this.head = !!opts?.head
    this.wantCount = !!opts?.count
    return this
  }
  insert(values: Row | Row[]) {
    this.op = 'insert'
    this.payload = Array.isArray(values) ? values : [values]
    return this
  }
  upsert(values: Row | Row[]) {
    this.op = 'upsert'
    this.payload = Array.isArray(values) ? values : [values]
    return this
  }
  update(values: Row) {
    this.op = 'update'
    this.patch = values
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this }
  not(c: string, _op: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) !== v); return this }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this }
  lte(c: string, v: string) { this.filters.push((r) => String(r[c]) <= v); return this }
  lt(c: string, v: string) { this.filters.push((r) => r[c] != null && String(r[c]) < v); return this }
  order(column: string, opts?: { ascending?: boolean }) { this.orderBy ??= { column, ascending: opts?.ascending ?? true }; return this }
  limit(n: number) { this.limitTo = n; return this }
  range(from: number, to: number) { this.rangeOf = [from, to]; return this }
  single() { this.single_ = 'single'; return this }
  maybeSingle() { this.single_ = 'maybe'; return this }

  then<A, B>(ok?: ((v: { data: unknown; error: unknown; count?: number | null; status: number }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad)
  }

  private fail(error: DbError, status: number) {
    return { data: null, error, count: null, status }
  }

  private missingColumnIn(names: string[]) {
    return names.find((c) => this.db.missingColumns.has(`${this.table}.${c}`))
  }

  private run() {
    const { db, table } = this
    if (db.missingTables.has(table)) {
      // head 조회는 실제 Supabase 처럼 오류가 보이지 않는다
      if (this.op === 'select' && this.head) return { data: null, error: null, count: null, status: 204 }
      return this.fail({ code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }, 404)
    }
    const forced = db.failing.get(table)
    if (forced) return this.fail(forced, 500)

    const selected = this.columns === '*' ? [] : this.columns.replace(/\w+\([^)]*\)/g, '').split(',').map((s) => s.trim()).filter(Boolean)
    const writtenColumns = this.op === 'update' ? Object.keys(this.patch) : this.payload.flatMap((p) => Object.keys(p))
    const missing = this.missingColumnIn([...selected, ...writtenColumns])
    if (missing) {
      if (this.op === 'select' && this.head) return { data: null, error: { message: '' }, count: null, status: 400 }
      return this.fail({ code: '42703', message: `column ${table}.${missing} does not exist` }, 400)
    }

    const rows = (db.tables[table] ??= [])
    const matches = (row: Row) => this.filters.every((f) => f(row))
    let result: Row[]

    if (this.op === 'insert' || this.op === 'upsert') {
      const added = this.payload.map((p) => ({ id: p.id ?? db.nextId(), ...db.defaults[table], ...p }))
      rows.push(...added)
      db.writes.push({ table, op: this.op, rows: added })
      result = added
    } else if (this.op === 'update') {
      result = rows.filter(matches)
      for (const row of result) Object.assign(row, this.patch)
      db.writes.push({ table, op: 'update', rows: result.map((r) => ({ ...r })) })
    } else if (this.op === 'delete') {
      result = rows.filter(matches)
      db.tables[table] = rows.filter((r) => !matches(r))
      db.writes.push({ table, op: 'delete', rows: result })
    } else {
      db.reads.push(table)
      result = rows.filter(matches)
      if (this.orderBy) {
        const { column, ascending } = this.orderBy
        result = [...result].sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (ascending ? 1 : -1))
      }
    }

    const total = result.length
    if (this.rangeOf) result = result.slice(this.rangeOf[0], this.rangeOf[1] + 1)
    if (this.limitTo !== null) result = result.slice(0, this.limitTo)
    const count = this.wantCount ? total : null

    if (this.head) return { data: null, error: null, count, status: 200 }
    if (this.single_) {
      if (result.length === 0) {
        return this.single_ === 'maybe'
          ? { data: null, error: null, count, status: 200 }
          : this.fail({ code: 'PGRST116', message: 'no rows' }, 406)
      }
      return { data: result[0], error: null, count, status: 200 }
    }
    return { data: result, error: null, count, status: 200 }
  }
}

export function request(method: string, url: string, body?: unknown): Request & { nextUrl: URL } {
  const req = new Request(`http://test.local${url}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  })
  return Object.assign(req, { nextUrl: new URL(req.url) })
}
