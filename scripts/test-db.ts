// 시험용 Supabase 전용 도구. .env.test-db.local 만 써서 접속하고, 운영 DB 에는 접속하지 않는다.
// .env.local 은 "같은 곳이 아닌지" 비교하려고 읽기만 한다.
//   npm run test-db -- check   접속 대상이 시험용인지 확인 (쓰기 없음)
//   npm run test-db -- account-sql   시험 계정 2개를 만드는 SQL 출력 (비밀번호는 .env.test-db.local)
//   npm run test-db -- seed    시험 계정으로 로그인해 가짜 학생을 만든다
//   npm run test-db -- smoke   반 관리 SQL 적용 뒤 반 만들기·다른 계정 차단·퇴원을 확인한다
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { MARKER_CHECK, TEST_DB_MARKER, testDbEnvProblems } from './support/testDbSql.ts'

const TEST_ENV_FILE = resolve(process.cwd(), '.env.test-db.local')
const ACCOUNTS = [
  { email: 'teacher-a@example.com', passwordKey: 'TEST_TEACHER_A_PASSWORD' },
  { email: 'teacher-b@example.com', passwordKey: 'TEST_TEACHER_B_PASSWORD' },
]

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

function stop(message: string): never {
  console.error(`중단: ${message}`)
  process.exit(1)
}

const testEnv = readEnvFile(TEST_ENV_FILE)
const clientOf = (key: string) => createClient(testEnv.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })

// 설정 비교 + 시험용 표시 표까지 확인한 뒤에야 다음으로 넘어간다
async function assertTestDb(): Promise<void> {
  const problems = testDbEnvProblems(testEnv, readEnvFile(resolve(process.cwd(), '.env.local')))
  if (problems.length) stop(`\n- ${problems.join('\n- ')}`)
  const { data, error } = await clientOf(testEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).from('_test_db_marker').select('name')
  if (error || data?.[0]?.name !== TEST_DB_MARKER) stop('시험용 표시를 찾지 못했습니다. 01-schema.oneline.sql 적용 여부를 확인하세요. 아무것도 쓰지 않았습니다.')
  console.log('확인: 운영과 다른 프로젝트이고 시험용 표시가 있습니다.')
}

async function login(account: (typeof ACCOUNTS)[number]): Promise<{ client: SupabaseClient; userId: string }> {
  const client = clientOf(testEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const password = testEnv[account.passwordKey]
  if (!password) stop('시험 계정이 없습니다. 먼저 npm run test-db -- account-sql 의 SQL 을 실행하세요.')
  const { data, error } = await client.auth.signInWithPassword({ email: account.email, password })
  if (error || !data.user) stop(`${account.email} 로그인 실패: ${error?.message}`)
  return { client, userId: data.user.id }
}

// 시험용 전용 연결로 실행할 계정 생성 SQL 을 출력한다. 비밀키를 쓰지 않으려고 관리자 API 대신 SQL 로 만든다.
function accountSql(): void {
  const statements = ACCOUNTS.flatMap((account) => {
    let password = testEnv[account.passwordKey]
    if (!password) {
      password = randomBytes(18).toString('base64url')
      appendFileSync(TEST_ENV_FILE, `\n${account.passwordKey}=${password}\n`)
    }
    const email = account.email
    return [
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${email}', extensions.crypt('${password}', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '' where not exists (select 1 from auth.users where email = '${email}');`,
      `insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at) select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now() from auth.users u where u.email = '${email}' and not exists (select 1 from auth.identities i where i.user_id = u.id);`,
    ]
  })
  console.log(['begin;', MARKER_CHECK, ...statements, 'commit;'].join(' '))
}

async function seed(): Promise<void> {
  const { client, userId } = await login(ACCOUNTS[0])
  const { count, error: countError } = await client.from('students').select('id', { count: 'exact' }).eq('user_id', userId)
  if (countError) stop(countError.message)
  if (count) return console.log(`가짜 학생 ${count}명이 이미 있어 추가하지 않았습니다.`)
  const students = [['시험학생 01', '중1'], ['시험학생 02', '중2'], ['시험학생 03', '중2'], ['시험학생 04', '고1']].map(([name, grade], i) => ({
    user_id: userId, name, grade, pin: String(1000 + i), school_name: '시험중학교', student_phone: `010-0000-000${i + 1}`, parent_phone: `010-0000-100${i + 1}`, notes: '시험용 가짜 자료',
  }))
  const { error } = await client.from('students').insert(students)
  if (error) stop(error.message)
  console.log(`가짜 학생 ${students.length}명을 만들었습니다.`)
}

async function smoke(): Promise<void> {
  const a = await login(ACCOUNTS[0])
  const b = await login(ACCOUNTS[1])
  let failed = 0
  const check = (name: string, ok: boolean) => { console.log(`${ok ? '통과' : '실패'}: ${name}`); if (!ok) failed++ }
  const label = `확인 ${new Date().toISOString()}`

  const student = await a.client.from('students').insert({ user_id: a.userId, name: `시험학생 ${label}`, grade: '중2', pin: '9999', notes: '시험용 가짜 자료' }).select('id').single()
  check('학생 만들기', !student.error)
  const klass = await a.client.from('classes').insert({ user_id: a.userId, name: `시험반 ${label}`, target_grades: ['중2'] }).select('id').single()
  check('반 만들기', !klass.error)
  if (student.error || klass.error) stop(`이후 확인을 할 수 없습니다: ${student.error?.message ?? klass.error?.message}`)
  const member = await a.client.from('class_students').insert({ user_id: a.userId, class_id: klass.data.id, student_id: student.data.id })
  check('반에 학생 넣기', !member.error)

  check('다른 계정에 학생이 안 보임', ((await b.client.from('students').select('id').eq('id', student.data.id)).data ?? []).length === 0)
  check('다른 계정에 반이 안 보임', ((await b.client.from('classes').select('id').eq('id', klass.data.id)).data ?? []).length === 0)
  check('다른 계정은 그 반에 못 넣음', !!(await b.client.from('class_students').insert({ user_id: b.userId, class_id: klass.data.id, student_id: student.data.id })).error)
  check('다른 계정은 퇴원 못 시킴', !!(await b.client.rpc('withdraw_student', { p_student_id: student.data.id, p_withdrawn_on: new Date().toISOString().slice(0, 10) })).error)
  check('비로그인은 학생이 안 보임', ((await clientOf(testEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).from('students').select('id')).data ?? []).length === 0)

  const withdrawn = await a.client.rpc('withdraw_student', { p_student_id: student.data.id, p_withdrawn_on: new Date().toISOString().slice(0, 10), p_note: '시험' })
  check('퇴원 처리, 소속 1건 닫힘', !withdrawn.error && withdrawn.data === 1)
  const after = await a.client.from('students').select('status').eq('id', student.data.id).single()
  check('학생 상태가 퇴원', after.data?.status === 'withdrawn')

  console.log(failed ? `실패 ${failed}건` : '전부 통과')
  if (failed) process.exit(1)
}

const command = process.argv[2]
if (!['check', 'account-sql', 'seed', 'smoke'].includes(command)) stop('check, account-sql, seed, smoke 중 하나를 적어 주세요.')
await assertTestDb()
if (command === 'account-sql') accountSql()
if (command === 'seed') await seed()
if (command === 'smoke') await smoke()
