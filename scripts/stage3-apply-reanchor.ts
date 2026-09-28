// 3단계 난이도 재조정 일괄 적용 (소유자 명시 승인 2026-09-28)
// 기준: 승인받은 제안표 docs/stage3-reanchor-proposal.csv 그대로 (여기서 다시 계산하지 않는다)
//   - 제안표 한 줄 = (표현, 품사, 뜻, 현재 값) 이 DB 와 모두 같을 때만 적용 → 그 사이 교사가 바꾼 값은 건드리지 않는다
//   - base_difficulty 만 바꾼다. 상태·승인 경로·교사 확인 시각은 그대로
//   - 바뀐 단어마다 이력 행(teacher-note:owner-approval:<실행 시각>) "절대 난이도 자 도입에 따른 재조정 (현재 → 제안)"
//
// 실행: node scripts/stage3-apply-reanchor.ts            → 미리보기
//       node scripts/stage3-apply-reanchor.ts --apply    → 백업 파일을 먼저 쓰고 적용
// 되돌리기: node scripts/stage3-rollback-reanchor.ts backups/<이 스크립트가 쓴 백업 파일> [--apply]

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parseCsv } from '../lib/officialVocabulary.ts'
import { OWNER_APPROVAL_REF_PREFIX } from '../lib/vocabularyCalibration.ts'

const APPLY = process.argv.includes('--apply')
const REASON = '소유자 명시 승인 · 절대 난이도 자 도입에 따른 재조정'

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

type Entry = { id: string; expression: string; pos: string | null; meaning_ko: string; base_difficulty: number | null; status: string; deleted_at: string | null }

async function main() {
  const table = parseCsv(readFileSync(resolve(process.cwd(), 'docs/stage3-reanchor-proposal.csv'), 'utf-8'))
  const header = table[0]
  const col = (name: string) => header.indexOf(name)
  const proposal = table.slice(1).map((r) => ({
    expression: r[col('expression')],
    pos: r[col('pos')] || null,
    meaning_ko: r[col('meaning_ko')],
    current: Number(r[col('current')]),
    proposed: Number(r[col('proposed')]),
  }))
  if (proposal.length !== 101 || proposal.some((p) => !Number.isInteger(p.proposed) || p.proposed < 1 || p.proposed > 100)) {
    console.error('❌ 제안표 형식이 이상합니다 (101줄, 제안값 1~100).')
    process.exit(1)
  }

  const env = loadEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: login, error: loginError } = await supabase.auth.signInWithPassword({
    email: env.SUPABASE_LOGIN_EMAIL,
    password: env.SUPABASE_LOGIN_PASSWORD,
  })
  if (loginError || !login.user) throw new Error(`로그인 실패: ${loginError?.message}`)

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('id, expression, pos, meaning_ko, base_difficulty, status, deleted_at')
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  const entries = data as Entry[]

  const plan: { entry: Entry; proposed: number }[] = []
  const unmatched: string[] = []
  for (const p of proposal) {
    const matches = entries.filter((e) => e.expression === p.expression && (e.pos ?? null) === p.pos && e.meaning_ko === p.meaning_ko)
    if (matches.length !== 1) { unmatched.push(`${p.expression}(${p.meaning_ko}): DB에서 ${matches.length}개 찾음`); continue }
    const e = matches[0]
    if (e.base_difficulty !== p.current) { unmatched.push(`${p.expression}(${p.meaning_ko}): 현재 값이 제안표(${p.current})와 다름(${e.base_difficulty}) → 건너뜀`); continue }
    if (p.proposed !== p.current) plan.push({ entry: e, proposed: p.proposed })
  }
  console.log(`제안표 ${proposal.length}줄 / 값이 바뀌는 단어 ${plan.length}개 / 그대로 ${proposal.length - plan.length - unmatched.length}개 / 건너뜀 ${unmatched.length}개`)
  for (const u of unmatched) console.log(`  - ${u}`)
  if (unmatched.length > 0) {
    console.error('❌ 제안표와 DB 가 맞지 않는 줄이 있어 멈춥니다. 아무것도 바꾸지 않았습니다.')
    process.exit(1)
  }
  if (!APPLY) {
    console.log('(미리보기) 실제로 바꾸려면 --apply 를 붙여 다시 실행하세요.')
    return
  }

  const runAt = new Date().toISOString()
  const sourceRef = `${OWNER_APPROVAL_REF_PREFIX}${runAt}`
  const backupFile = resolve(process.cwd(), 'backups', `stage3-reanchor-backup-${runAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(
    backupFile,
    JSON.stringify({ taken_at: runAt, owner_approval_source_ref: sourceRef, entries: entries.map(({ id, expression, base_difficulty }) => ({ id, expression, base_difficulty })) }, null, 2),
  )
  console.log(`백업 저장: ${backupFile}`)

  let failed = 0
  for (const { entry, proposed } of plan) {
    const { error: upError } = await supabase
      .from('vocabulary_entries')
      .update({ base_difficulty: proposed })
      .eq('id', entry.id)
      .eq('base_difficulty', entry.base_difficulty)
    const rec = upError
      ? null
      : await supabase.from('vocabulary_sources').insert({
          user_id: login.user.id,
          entry_id: entry.id,
          source_type: 'teacher',
          source_ref: sourceRef,
          suggested_difficulty: proposed,
          rationale: `${REASON} (${entry.base_difficulty} → ${proposed}, 2026-09-28)`,
          created_by: 'teacher',
        })
    if (upError || rec?.error) { failed++; console.error(`❌ ${entry.expression}: ${upError?.message ?? rec?.error?.message}`) }
  }
  console.log(failed === 0 ? `✅ ${plan.length}개 적용, 실패 0건` : `❌ 실패 ${failed}건`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
