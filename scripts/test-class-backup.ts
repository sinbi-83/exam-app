// 백업 스크립트 시험. 가짜 자료만 쓰고 운영 DB 에 접속하지 않는다.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { collectSnapshot, countsOf, decryptSnapshot, encryptSnapshot, OPTIONAL_TABLES, REQUIRED_TABLES } from './support/classBackup.ts'

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  await fn()
  passed++
  console.log(`✅ ${name}`)
}

type Row = Record<string, unknown>
type FakeOptions = { rows?: Record<string, Row[]>; missing?: string[]; failing?: string[]; wrongCount?: string[] }

function fakeClient({ rows = {}, missing = [...OPTIONAL_TABLES], failing = [], wrongCount = [] }: FakeOptions) {
  return {
    from(table: string) {
      const list = rows[table] ?? []
      const fail = missing.includes(table)
        ? { message: `relation "public.${table}" does not exist`, code: '42P01' }
        : failing.includes(table) ? { message: 'permission denied', code: '42501' } : null
      return {
        select(_columns: string, options?: { head?: boolean }) {
          if (options?.head) return Promise.resolve({ count: list.length + (wrongCount.includes(table) ? 1 : 0), error: fail })
          return { order: () => ({ range: (from: number, to: number) => Promise.resolve({ data: fail ? null : list.slice(from, to + 1), error: fail }) }) }
        },
      }
    },
  }
}

const SECRET = '시험학생이름-010-0000-0000'
const PASS = 'correct horse battery'

await test('필수 표에 학생 연결 표 11개가 모두 있다', () => {
  assert.equal(REQUIRED_TABLES.length, 11)
  assert.equal(REQUIRED_TABLES[0], 'students')
})

await test('1,000행이 넘어도 전부 읽고, 적용 전의 새 표는 없음으로 기록한다', async () => {
  const students = Array.from({ length: 2345 }, (_, i) => ({ id: String(i).padStart(5, '0') }))
  const snap = await collectSnapshot(fakeClient({ rows: { students } }))
  assert.equal(snap.tables.students.length, 2345)
  assert.deepEqual(snap.absent, [...OPTIONAL_TABLES])
})

await test('적용 뒤에는 새 표도 백업한다', async () => {
  const snap = await collectSnapshot(fakeClient({ rows: { classes: [{ id: 'c1' }] }, missing: [] }))
  assert.equal(countsOf(snap).classes, 1)
  assert.deepEqual(snap.absent, [])
})

await test('필수 표를 못 읽으면 백업 전체를 중단한다', async () => {
  await assert.rejects(collectSnapshot(fakeClient({ failing: ['exam_results'] })), /exam_results 읽기 실패/)
  await assert.rejects(collectSnapshot(fakeClient({ missing: ['reports'] })), /reports 읽기 실패/)
})

await test('건수가 다르면 백업 전체를 중단한다', async () => {
  await assert.rejects(collectSnapshot(fakeClient({ wrongCount: ['attendance'] })), /attendance 건수 불일치/)
})

const sample = await collectSnapshot(fakeClient({ rows: { students: [{ id: 's1', name: SECRET, pin: '1234' }] } }))

await test('암호화: 파일에 평문이 없고, 맞는 비밀번호로 그대로 복원된다', () => {
  const file = encryptSnapshot(sample, PASS)
  assert.ok(!file.includes(SECRET) && !file.includes('1234') && !file.includes('students'))
  assert.deepEqual(decryptSnapshot(file, PASS), sample)
})

await test('암호화: 틀린 비밀번호, 손상된 파일, 짧은 비밀번호는 실패한다', () => {
  const file = encryptSnapshot(sample, PASS)
  assert.throws(() => decryptSnapshot(file, 'wrong passphrase!!'))
  const parsed = JSON.parse(file)
  parsed.body = Buffer.from('tampered').toString('base64')
  assert.throws(() => decryptSnapshot(JSON.stringify(parsed), PASS))
  assert.throws(() => encryptSnapshot(sample, 'short'), /12자 이상/)
})

// 실제 스크립트를 터미널 없이 실행한다 → DB 접속 전에 멈춰야 한다. env 를 비워 접속 자체가 불가능하게 한다.
const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/backup-class-management.ts', ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })

await test('옵션 없이 실행하면 계획만 보여 주고 접속하지 않는다', () => {
  const r = run()
  assert.equal(r.status, 0)
  assert.match(r.stdout, /DB 에 접속하지 않았습니다/)
})

await test('터미널 없이 --confirm-extract 는 추출하지 않고 멈춘다', () => {
  const r = run('--confirm-extract')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /직접 터미널에서/)
  assert.doesNotMatch(r.stdout, /저장:/)
})

console.log(`\n${passed}개 통과`)
