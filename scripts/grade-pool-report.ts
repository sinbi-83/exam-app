// 학년(초3~고3) × 레벨별 단어시험 출제 가능 문항 수 보고서 (읽기만 한다. DB 값을 바꾸지 않는다. AI 호출 없음)
//   docs/grade-pool-capacity.md — 지금(사용 중만) / 확인 필요를 모두 사용하기 했을 때, 영→한 / 한→영 / 혼합
//
// 실행: node scripts/grade-pool-report.ts

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { generalTestCandidates } from '../lib/vocabularyCalibration.ts'
import { generateWordTest, type WordTestEntry, type WordTestMode } from '../lib/wordTest.ts'
import { findDifficultyBand, isDraftBandGrade, VOCABULARY_GRADES } from '../config/vocabularyLevels.ts'
import { selectAllPages } from '../lib/supabasePaging.ts'

const LEVELS = ['school', 'academy', 'advanced', 'prestudy'] as const
const LEVEL_NAMES: Record<(typeof LEVELS)[number], string> = { school: '학교형', academy: '일반학원형', advanced: '상위학원형', prestudy: '선행형' }
const MODES: WordTestMode[] = ['en_ko', 'ko_en', 'mixed']
// 단어시험 기본 문항 수 (/create/word 기본값 40). 이보다 적으면 "부족"
const ENOUGH = 40
const COMFORT = 80

// 고정 씨앗 난수 (mulberry32) — 다시 실행해도 같은 결과
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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
const { error: loginError } = await supabase.auth.signInWithPassword({ email: env.SUPABASE_LOGIN_EMAIL, password: env.SUPABASE_LOGIN_PASSWORD })
if (loginError) throw new Error(`로그인 실패: ${loginError.message}`)
// 1,000행 제한 → 나눠 읽기 (lib/supabasePaging.ts)
const { data, error } = await selectAllPages((from, to) =>
  supabase.from('vocabulary_entries').select('*, vocabulary_sources(source_type, source_ref)').is('deleted_at', null).order('id').range(from, to),
)
if (error) throw new Error(error.message)
type Row = WordTestEntry & { vocabulary_sources: { source_type: string; source_ref: string }[] }
const rows = data as Row[]
const approvedPool = generalTestCandidates(rows.filter((e) => e.status === 'approved'))
const ifApproved = generalTestCandidates(rows.filter((e) => e.status === 'approved' || e.status === 'pending')).map((e) => ({ ...e, status: 'approved' as const }))

const capacity = (pool: WordTestEntry[], band: { min: number; max: number }, mode: WordTestMode) =>
  generateWordTest(pool, band, mode, 5000, seeded(1)).items.length
const mark = (n: number) => (n < ENOUGH ? `❌ ${n}` : n < COMFORT ? `⚠️ ${n}` : `${n}`)

const count = (s: string) => rows.filter((e) => e.status === s).length
const out: string[] = [
  '# 학년 × 레벨 단어시험 출제 가능 문항 수',
  '',
  `- 만든 날: ${new Date().toISOString().slice(0, 10)} · \`node scripts/grade-pool-report.ts\` (읽기 전용)`,
  `- 단어은행 지금: 사용 중 ${count('approved')} / 확인 필요 ${count('pending')} (삭제 제외, 검수용 Calibration 전용 단어는 시험 후보에서 뺌)`,
  '- 문항 수 = 그 레벨 범위에서 한 시험에 겹치지 않게 뽑을 수 있는 최대 개수 (같은 철자 다른 뜻 1번만, 한→영은 같은 뜻 1번만, 한→영 불가 단어 제외).',
  `- 표시: ❌ ${ENOUGH}문항 미만(기본 ${ENOUGH}문항 시험을 못 만듦) · ⚠️ ${ENOUGH}~${COMFORT - 1}문항(한 번은 되지만 반복 출제 여유 적음)`,
  '- 범위표: 초3~고3 10개 학년 모두 향미 선생님 승인 (docs/grade-ranges-proposal.md).',
  '',
  '## 1. 확인 필요를 모두 사용하기 했을 때 (영→한 / 한→영 / 혼합)',
  '',
  '| 학년 | 학교형 | 일반학원형 | 상위학원형 | 선행형 |',
  '|---|---|---|---|---|',
]
const shortages: string[] = []
for (const g of VOCABULARY_GRADES) {
  const cells = LEVELS.map((l) => {
    const b = findDifficultyBand(g, l, 'en_ko')!
    const [en, ko, mixed] = MODES.map((m) => capacity(ifApproved, b, m))
    if (en < ENOUGH) shortages.push(`${g} ${LEVEL_NAMES[l]}(${b.min}~${b.max}) 영→한 ${en}문항`)
    else if (ko < ENOUGH) shortages.push(`${g} ${LEVEL_NAMES[l]}(${b.min}~${b.max}) 한→영만 ${ko}문항`)
    return `${b.min}~${b.max}: **${mark(en)}** / ${mark(ko)} / ${mixed}`
  })
  out.push(`| ${g}${isDraftBandGrade(g) ? ' (초안)' : ''} | ${cells.join(' | ')} |`)
}
out.push('', '## 2. 지금(사용 중만) (영→한 / 한→영 / 혼합)', '', '| 학년 | 학교형 | 일반학원형 | 상위학원형 | 선행형 |', '|---|---|---|---|---|')
for (const g of VOCABULARY_GRADES) {
  const cells = LEVELS.map((l) => {
    const b = findDifficultyBand(g, l, 'en_ko')!
    return MODES.map((m) => capacity(approvedPool, b, m)).join(' / ')
  })
  out.push(`| ${g}${isDraftBandGrade(g) ? ' (초안)' : ''} | ${cells.join(' | ')} |`)
}
// 난이도 분포 (10 단위) — 어느 구간이 비어 있는지
out.push('', '## 3. 난이도 분포 (사용 중 + 확인 필요, 시험 후보만)', '', '| 난이도 | 단어 수 | 한→영 가능 |', '|---|---|---|')
for (let lo = 1; lo <= 100; lo += 10) {
  const hi = lo === 91 ? 100 : lo + 9
  const inRange = ifApproved.filter((e) => e.base_difficulty !== null && e.base_difficulty >= lo && e.base_difficulty <= hi)
  out.push(`| ${lo}~${hi} | ${inRange.length} | ${inRange.filter((e) => e.ko_en_allowed).length} |`)
}
out.push('', '## 4. 부족한 곳 (확인 필요 모두 사용하기 후에도 40문항 미만)', '')
out.push(...(shortages.length ? shortages.map((s) => `- ${s}`) : ['- 없음']))
out.push('')

writeFileSync(resolve(process.cwd(), 'docs/grade-pool-capacity.md'), out.join('\n'))
console.log(out.join('\n'))
