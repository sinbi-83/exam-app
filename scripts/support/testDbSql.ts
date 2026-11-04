// 시험용 DB SQL 조립 (npm run build-test-db-sql). DB 에 접속하지 않고 파일만 만든다.
// SQL Editor 에 안전하게 붙여넣도록 한 줄로 만들고, 운영 DB 에서 실행되면 스스로 멈추는 검사를 맨 앞에 붙인다.

export const TEST_DB_MARKER = 'exam-app-test-db'

// 표 구조 파일을 실제 적용 순서대로 (docs/class-management-review.md 2-5). 반 관리는 여기 넣지 않는다: 운영과 같은 순서로 따로 적용해 시험하기 위해서다.
export const SCHEMA_FILES = [
  'supabase/test-db/00-base-tables.sql',
  'supabase/schema.sql',
  'supabase-migration.sql',
  'wrong-answers-migration.sql',
  'academy-settings-migration.sql',
  'api-usage-logs-migration.sql',
  'exam-sheets-rls-fix-migration.sql',
  'passage-groups-migration.sql',
  'schedule-and-related-tables-migration.sql',
  'tuition-paid-amount-migration.sql',
  'step6-archive-migration.sql',
  'vocabulary-bank-migration.sql',
  'stage1-vocabulary-exam-type-migration.sql',
  'stage3-official-vocabulary-migration.sql',
  'passage-wordbooks-migration.sql',
  'level-test-results-migration.sql',
  'report-status-level-test-review-migration.sql',
  'exam-assignments-migration.sql',
  'school-profiles-migration.sql',
]

// 운영 DB 는 표와 계정이 이미 있으므로 여기서 멈춘다.
export const EMPTY_DB_CHECK = "do $$ begin if to_regclass('public.students') is not null or exists (select 1 from auth.users) then raise exception 'STOP: this database is not empty. This SQL is only for a brand-new test project.'; end if; end; $$;"

// 시험용 표시 표가 없는 DB (= 운영) 에서는 여기서 멈춘다.
export const MARKER_CHECK = "do $$ begin if to_regclass('public._test_db_marker') is null then raise exception 'STOP: test DB marker not found. This SQL is only for the test project.'; end if; end; $$;"

// 운영에 있고 파일에 없는 칸, 시험용 표시, 권한.
// 2026-10-30 부터 Supabase 새 프로젝트는 새 표를 API 에 자동으로 열지 않아 권한을 직접 준다. anon 권한은 운영과 같게 두고 RLS 로 막는다.
export const SCHEMA_TAIL = [
  'alter table exam_sheets add column if not exists academy_id uuid;',
  'create table public._test_db_marker (name text primary key);',
  `insert into public._test_db_marker (name) values ('${TEST_DB_MARKER}');`,
  'alter table public._test_db_marker enable row level security;',
  'create policy "marker_read" on public._test_db_marker for select to anon, authenticated using (true);',
  'grant usage on schema public to anon, authenticated, service_role;',
  'grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;',
  'grant usage, select on all sequences in schema public to anon, authenticated, service_role;',
  'grant execute on all functions in schema public to anon, authenticated, service_role;',
].join(' ')

// 주석을 지우고 최상위 문장으로 나눈다. 따옴표와 $$ 본문 안의 내용은 건드리지 않는다 ($$ 본문의 주석만 지운다).
export function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2)
      i = end < 0 ? sql.length : end + 2
      current += ' '
      continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue }
          break
        }
        j++
      }
      current += sql.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (c === '$') {
      const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/)?.[0]
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length)
        if (end < 0) throw new Error(`닫히지 않은 ${tag}`)
        const body = splitStatements(sql.slice(i + tag.length, end)).join(' ')
        current += `${tag} ${body} ${tag}`
        i = end + tag.length
        continue
      }
    }
    if (c === ';') {
      statements.push(`${current.replace(/\s+/g, ' ').trim()};`)
      current = ''
      i++
      continue
    }
    current += c
    i++
  }
  const rest = current.replace(/\s+/g, ' ').trim()
  if (rest) statements.push(rest)
  return statements.filter((s) => s !== ';')
}

// 파일 안의 begin/commit 을 빼고 전체를 한 트랜잭션으로 묶는다. 중간에 실패하면 아무것도 남지 않는다.
export function toOneLine(guard: string, sources: string[], tail = ''): string {
  const body = sources
    .flatMap(splitStatements)
    .filter((s) => !/^(begin|commit)\s*;$/i.test(s))
  return ['begin;', guard, ...body, tail, 'commit;'].filter(Boolean).join(' ') + '\n'
}

// 시험용 DB 설정이 운영을 가리키지 않는지 확인한다. 문제가 있으면 이유를 돌려준다.
export function supabaseRefOf(url: string | undefined): string | null {
  const m = (url ?? '').trim().match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)
  return m ? m[1].toLowerCase() : null
}

function jwtRef(key: string): string | null {
  const payload = key.split('.')[1]
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).ref ?? null
  } catch {
    return null
  }
}

export function testDbEnvProblems(testEnv: Record<string, string>, productionEnv: Record<string, string>): string[] {
  const problems: string[] = []
  const ref = supabaseRefOf(testEnv.NEXT_PUBLIC_SUPABASE_URL)
  if (!ref) problems.push('NEXT_PUBLIC_SUPABASE_URL 이 비었거나 https://<ref>.supabase.co 형식이 아닙니다.')
  const productionRef = supabaseRefOf(productionEnv.NEXT_PUBLIC_SUPABASE_URL)
  if (!productionRef) problems.push('.env.local 에서 운영 주소를 읽지 못해 같은 곳인지 비교할 수 없습니다.')
  if (ref && ref === productionRef) problems.push('시험용 주소가 운영 주소와 같습니다.')
  // 비밀키는 쓰지 않으므로 없어도 된다. 다만 들어 있으면 운영 값이 아닌지 검사한다.
  for (const name of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const value = testEnv[name]
    if (!value) {
      if (name !== 'SUPABASE_SERVICE_ROLE_KEY') problems.push(`${name} 값이 비었습니다.`)
      continue
    }
    if (value === productionEnv[name]) problems.push(`${name} 값이 운영 값과 같습니다.`)
    // 예전 형식(JWT) 키에는 프로젝트 ref 가 들어 있다
    const keyRef = jwtRef(value)
    if (keyRef && ref && keyRef !== ref) problems.push(`${name} 은 다른 프로젝트의 키입니다.`)
  }
  return problems
}
