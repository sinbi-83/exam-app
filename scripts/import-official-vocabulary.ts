// 공식 기본어휘 기준표 가져오기: data/official/kr-curriculum-2022-basic-vocabulary-3000.csv → official_vocabulary 표
// (원본: 향미 선생님이 준 영어과기본어휘3000.csv 를 그대로 복사한 파일. 내용을 보태거나 고치지 않는다.)
// 단어은행(vocabulary_entries)에는 아무것도 넣지 않는다. AI API 호출 없음.
//
// 실행: node scripts/import-official-vocabulary.ts            → 미리보기 (CSV 검사만)
//       node scripts/import-official-vocabulary.ts --apply    → 저장 (이미 저장된 버전이면 건너뜀)

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  OFFICIAL_LIST_VERSION,
  OFFICIAL_TIER_EXPECTED,
  OFFICIAL_TIERS,
  parseOfficialCsv,
  tierCounts,
  type OfficialTier,
} from '../lib/officialVocabulary.ts'

const APPLY = process.argv.includes('--apply')
const CSV = resolve(process.cwd(), 'data/official/kr-curriculum-2022-basic-vocabulary-3000.csv')

function sameCounts(a: Record<OfficialTier, number>): boolean {
  return OFFICIAL_TIERS.every((t) => a[t] === OFFICIAL_TIER_EXPECTED[t])
}

async function main() {
  const { rows, errors } = parseOfficialCsv(readFileSync(CSV, 'utf-8'))
  if (errors.length) {
    for (const e of errors.slice(0, 20)) console.error(`❌ ${e}`)
    process.exit(1)
  }
  const counts = tierCounts(rows)
  console.log(`CSV ${rows.length}개`, counts)
  if (rows.length !== 3000 || !sameCounts(counts)) {
    console.error('❌ 개수가 원본(800 / 1,200 / 1,000)과 다릅니다. 저장하지 않습니다.')
    process.exit(1)
  }
  if (!APPLY) {
    console.log('(미리보기) 저장하려면 --apply 를 붙여 다시 실행하세요.')
    return
  }

  const env: Record<string, string> = {}
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: login, error: loginError } = await supabase.auth.signInWithPassword({
    email: env.SUPABASE_LOGIN_EMAIL,
    password: env.SUPABASE_LOGIN_PASSWORD,
  })
  if (loginError || !login.user) throw new Error(`로그인 실패: ${loginError?.message}`)

  const existing = await supabase
    .from('official_vocabulary')
    .select('id', { count: 'exact', head: true })
    .eq('list_version', OFFICIAL_LIST_VERSION)
  if (existing.error) throw new Error(`기준표 조회 실패 (migration 실행 전이면 표가 없습니다): ${existing.error.message}`)
  if ((existing.count ?? 0) > 0) {
    console.log(`이미 ${existing.count}개가 저장돼 있어 건너뜁니다 (중복 저장 안 함).`)
  } else {
    const payload = rows.map((r) => ({ ...r, user_id: login.user.id }))
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from('official_vocabulary').insert(payload.slice(i, i + 500))
      if (error) throw new Error(`저장 실패 (${i + 1}번째부터): ${error.message}`)
    }
    console.log(`저장 ${payload.length}개`)
  }

  // 저장 후 DB 기준 개수 확인
  const saved: Record<OfficialTier, number> = { elementary: 0, common: 0, elective: 0 }
  for (const t of OFFICIAL_TIERS) {
    const { count, error } = await supabase
      .from('official_vocabulary')
      .select('id', { count: 'exact', head: true })
      .eq('list_version', OFFICIAL_LIST_VERSION)
      .eq('tier_code', t)
    if (error) throw new Error(error.message)
    saved[t] = count ?? 0
  }
  const total = OFFICIAL_TIERS.reduce((s, t) => s + saved[t], 0)
  console.log(`DB: 초등 권장 ${saved.elementary} / 중·고 공통 ${saved.common} / 그 외 ${saved.elective} / 합계 ${total}`)
  console.log(sameCounts(saved) && total === 3000 ? '✅ 원본 개수와 일치' : '❌ 원본 개수와 다름')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
