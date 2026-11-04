// 시험용 DB 안전장치 시험. DB·네트워크에 접속하지 않는다.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { EMPTY_DB_CHECK, MARKER_CHECK, splitStatements, supabaseRefOf, testDbEnvProblems, toOneLine } from './support/testDbSql.ts'

const require = createRequire(import.meta.url)
const { assertPreviewSafe, forbiddenValues, previewEnvOverrides, previewGuardProblems } = require('../config/previewGuard.js')

let failed = 0
function check(name: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed++
}

// 한 줄 변환
const statements = splitStatements(`-- 주석; 문장 아님\nbegin;\ninsert into t values ('a--b;c', 'it''s');\ncreate function f() returns int as $$\n  -- 본문 주석\n  begin return 1; end;\n$$ language plpgsql;\ncommit;\n`)
check('주석을 지우고 문장을 나눈다', statements.length === 4)
check('따옴표 안의 -- 와 ; 는 그대로', statements[1] === "insert into t values ('a--b;c', 'it''s');")
check('$$ 본문은 한 문장으로 유지', statements[2].startsWith('create function') && statements[2].includes('begin return 1; end;') && !statements[2].includes('본문 주석'))
const line = toOneLine('GUARD;', ['begin; select 1; commit;'])
check('안쪽 begin/commit 을 빼고 전체를 묶는다', line === 'begin; GUARD; select 1; commit;\n')

// 만들어진 파일이 최신이고, 맨 앞에 검사가 있다
for (const [file, guard] of [['01-schema', EMPTY_DB_CHECK], ['02-class-management', MARKER_CHECK], ['03-class-management-rollback', MARKER_CHECK]]) {
  const sql = readFileSync(resolve(process.cwd(), `supabase/test-db/${file}.oneline.sql`), 'utf8')
  check(`${file}: 운영 차단 검사가 맨 앞`, sql.startsWith(`begin; ${guard}`))
  check(`${file}: 한 줄`, sql.trimEnd().split('\n').length === 1)
}

// 시험용 설정 비교
const PROD = 'https://prodprodprodprod.supabase.co'
const TEST = 'https://testtesttesttest.supabase.co'
const jwt = (ref: string) => `x.${Buffer.from(JSON.stringify({ ref })).toString('base64url')}.y`
const prodEnv = { NEXT_PUBLIC_SUPABASE_URL: PROD, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'prod-anon', SUPABASE_SERVICE_ROLE_KEY: 'prod-service' }
check('주소 형식 읽기', supabaseRefOf(`${TEST}/`) === 'testtesttesttest' && supabaseRefOf('http://x.com') === null)
check('정상 설정 통과', testDbEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: TEST, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('testtesttesttest'), SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' }, prodEnv).length === 0)
check('비밀키 없어도 통과 (쓰지 않음)', testDbEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: TEST, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('testtesttesttest') }, prodEnv).length === 0)
check('운영 비밀키를 넣으면 막음', testDbEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: TEST, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'prod-service' }, prodEnv).length > 0)
check('운영 주소면 막음', testDbEnvProblems({ ...prodEnv, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'b' }, prodEnv).length > 0)
check('운영 키를 쓰면 막음', testDbEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: TEST, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'prod-anon', SUPABASE_SERVICE_ROLE_KEY: 'b' }, prodEnv).length > 0)
check('다른 프로젝트 JWT 키면 막음', testDbEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: TEST, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('prodprodprodprod'), SUPABASE_SERVICE_ROLE_KEY: 'b' }, prodEnv).length > 0)
check('운영 주소를 못 읽으면 막음', testDbEnvProblems({ NEXT_PUBLIC_SUPABASE_URL: TEST, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'b' }, {}).length > 0)
check('빈 값이면 막음', testDbEnvProblems({}, prodEnv).length > 0)

// Preview 빌드 차단
const allowed = { allowedRef: 'testtesttesttest', anonKey: 'test-anon', previewAnthropicKey: 'disabled-on-preview' }
// Vercel 은 Preview 에 운영 값을 준다. 이 값을 그대로 둔 채 시험용으로 덮어써야 한다.
const vercelPreview = { VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: PROD, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'prod-anon', ANTHROPIC_API_KEY: 'sk-ant-real' }
check('Preview + 시험용 등록 통과', previewGuardProblems(vercelPreview, allowed).length === 0)
check('운영 주소를 시험용으로 등록하면 막음', previewGuardProblems(vercelPreview, { ...allowed, allowedRef: 'prodprodprodprod' }).length > 0)
check('운영 키를 시험용으로 등록하면 막음', previewGuardProblems(vercelPreview, { ...allowed, anonKey: 'prod-anon' }).length > 0)
check('시험용 키 없으면 막음', previewGuardProblems(vercelPreview, { ...allowed, anonKey: null }).length > 0)
check('비밀키 형식을 공개 키로 등록하면 막음', previewGuardProblems(vercelPreview, { ...allowed, anonKey: 'sb_secret_x' }).length > 0)
check('service_role JWT 를 공개 키로 등록하면 막음', previewGuardProblems(vercelPreview, { ...allowed, anonKey: `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.y` }).length > 0)
check('실제 AI 키를 Preview 값으로 등록하면 막음', previewGuardProblems(vercelPreview, { ...allowed, previewAnthropicKey: 'sk-ant-real' }).length > 0)
check('시험용 미등록이면 Preview 전부 막음', previewGuardProblems(vercelPreview, { ...allowed, allowedRef: null }).length > 0)
check('Production 은 검사 안 함', previewGuardProblems({ VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: PROD }, allowed).length === 0)
check('로컬은 검사 안 함', previewGuardProblems({ NEXT_PUBLIC_SUPABASE_URL: PROD }, allowed).length === 0)

// Preview 만 값이 바뀐다
const overrides = previewEnvOverrides(vercelPreview, allowed)
check('Preview: 시험용 주소로 고정', overrides.NEXT_PUBLIC_SUPABASE_URL === TEST)
check('Preview: 시험용 공개 키로 고정', overrides.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'test-anon')
check('Preview: AI 키 꺼짐', overrides.ANTHROPIC_API_KEY === 'disabled-on-preview')
check('Production: 아무 값도 안 바꿈', Object.keys(previewEnvOverrides({ ...vercelPreview, VERCEL_ENV: 'production' }, allowed)).length === 0)
check('로컬: 아무 값도 안 바꿈', Object.keys(previewEnvOverrides({ NEXT_PUBLIC_SUPABASE_URL: PROD }, allowed)).length === 0)

// 빌드 결과 검사 대상
const forbidden = forbiddenValues({ ...vercelPreview, SUPABASE_SERVICE_ROLE_KEY: 'prod-service' }, allowed)
check('운영 ref·키·AI 키·비밀키를 찾는다', ['prodprodprodprod', 'prod-anon', 'sk-ant-real', 'prod-service'].every((v) => forbidden.includes(v)))
check('시험용 값은 찾지 않는다', !forbidden.includes('testtesttesttest') && !forbidden.includes('test-anon'))
check('Production 은 검사 대상 없음', forbiddenValues({ ...vercelPreview, VERCEL_ENV: 'production' }, allowed).length === 0)
// 실제 등록값 (config/previewSupabase.json)
const registered = require('../config/previewSupabase.json')
const registeredUrl = `https://${registered.allowedRef}.supabase.co`
let registeredOk = true
try {
  assertPreviewSafe({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: PROD, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'secret-anon', ANTHROPIC_API_KEY: 'sk-ant-real' })
} catch {
  registeredOk = false
}
check('등록된 시험용 설정으로 Preview 통과', registeredOk)
check('등록된 공개 키가 시험용 프로젝트의 anon 키', (() => {
  const payload = JSON.parse(Buffer.from(registered.anonKey.split('.')[1], 'base64url').toString('utf8'))
  return payload.ref === registered.allowedRef && payload.role === 'anon'
})())
let leaked = false
try {
  // Vercel 이 준 운영 주소가 등록값과 같으면 멈춰야 한다
  assertPreviewSafe({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: registeredUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'secret-anon', ANTHROPIC_API_KEY: 'sk-ant-real' })
  check('등록값이 운영 주소와 같으면 Preview 는 멈춘다', false)
} catch (error) {
  const message = (error as Error).message
  check('등록값이 운영 주소와 같으면 Preview 는 멈춘다', message.includes('[preview-guard]'))
  leaked = message.includes(registeredUrl) || message.includes(registered.allowedRef) || message.includes('secret-anon') || message.includes('sk-ant-real')
}
check('오류 문구에 값이 없음', !leaked)

console.log(failed ? `실패 ${failed}건` : '전부 통과')
process.exit(failed ? 1 : 0)
