// 향미 선생님용 검수 샘플표 만들기 (읽기만 한다. DB 값을 바꾸지 않는다. AI 호출 없음)
//   A: 초등 권장 + 중·고 공통 / B: 그 외(고등 선택과목) — 공식 출처, '확인 필요' 인 단어에서 40개씩
//   난이도 구간(1~10 / 11~40 / 41~79 / 80+)별로 고르게, 고정 씨앗 무작위 → 다시 실행해도 같은 표
//   제외: 교사가 이미 검수·수정한 단어, 제작 때 '애매' 표시한 29개, 색 이름 단어 9개
//   → docs/review-sample-A.csv, docs/review-sample-B.csv (UTF-8 BOM)
//
// 실행: node scripts/review-sample-build.ts

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { selectAllPages } from '../lib/supabasePaging.ts'
import { vocabularyViewState } from '../lib/vocabulary.ts'
import { isCalibrationReviewed } from '../lib/vocabularyCalibration.ts'
import { POS_LABELS_KO } from '../lib/wordTest.ts'
import { OFFICIAL_LIST_VERSION } from '../lib/officialVocabulary.ts'
import { bucketIndex, buildReviewCsv, REVIEW_BUCKETS, stratifiedSample } from '../lib/reviewSample.ts'

const SAMPLE_SIZE = 40
const SEEDS = { A: 20260929, B: 20260930 }
const GROUP_GRADES = {
  A: ['초등학교 권장(*)', '중학교·고등 공통과목 권장(**)'],
  B: ['그 외 과목'],
}
// 색 이름 인정 뜻 되돌리기를 결정하기 전인 9개 (scripts/restore-color-meanings.ts 와 같은 목록)
const COLOR_WORDS = ['black', 'blue', 'brown', 'gray', 'green', 'pink', 'red', 'white', 'yellow']

// 제작 때 '애매한 점'을 적어 둔 단어 (seed JSON 의 ambiguity) — 표현|품사
const ambiguous = new Set<string>()
for (const f of readdirSync(resolve(process.cwd(), 'data/vocabulary')).filter((x) => /^kr-curriculum-2022-.+-\d\d\.json$/.test(x))) {
  for (const e of JSON.parse(readFileSync(resolve(process.cwd(), 'data/vocabulary', f), 'utf-8')).entries) {
    if (e.ambiguity) ambiguous.add(`${e.expression}|${e.pos}`)
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

type Row = {
  id: string; expression: string; pos: string | null; meaning_ko: string; accepted_meanings: string[]; base_difficulty: number | null
  ko_en_allowed: boolean; status: 'pending' | 'approved' | 'rejected' | 'archived'; deferred_at: string | null; teacher_reviewed_at: string | null
  vocabulary_sources: { source_type: string; source_ref: string; official_grade: string | null }[]
}
// 1,000행 제한 → 나눠 읽기
const { data, error } = await selectAllPages<Row>((from, to) =>
  supabase
    .from('vocabulary_entries')
    .select('id, expression, pos, meaning_ko, accepted_meanings, base_difficulty, ko_en_allowed, status, deferred_at, teacher_reviewed_at, vocabulary_sources(source_type, source_ref, official_grade)')
    .is('deleted_at', null)
    .order('id')
    .range(from, to),
)
if (error) throw new Error(error.message)

const summary: string[] = []
for (const group of ['A', 'B'] as const) {
  const official = data.filter(
    (e) =>
      vocabularyViewState(e) === 'pending' &&
      e.vocabulary_sources.some((s) => s.source_type === 'official' && s.source_ref === OFFICIAL_LIST_VERSION && GROUP_GRADES[group].includes(s.official_grade ?? '')),
  )
  const reviewed = official.filter((e) => isCalibrationReviewed(e) || e.teacher_reviewed_at !== null)
  const amb = official.filter((e) => !reviewed.includes(e) && ambiguous.has(`${e.expression}|${e.pos}`))
  const color = official.filter((e) => !reviewed.includes(e) && !amb.includes(e) && COLOR_WORDS.includes(e.expression))
  const pool = official.filter((e) => !reviewed.includes(e) && !amb.includes(e) && !color.includes(e))
  const sample = stratifiedSample(pool, SAMPLE_SIZE, SEEDS[group])
  const csv = buildReviewCsv(
    sample.map((e) => ({
      expression: e.expression,
      pos: e.pos ? POS_LABELS_KO[e.pos] ?? e.pos : '-',
      meaning_ko: e.meaning_ko,
      accepted_meanings: e.accepted_meanings,
      base_difficulty: e.base_difficulty,
      ko_en_allowed: e.ko_en_allowed,
    })),
  )
  writeFileSync(resolve(process.cwd(), `docs/review-sample-${group}.csv`), csv)
  const perBucket = REVIEW_BUCKETS.map((b, i) => `${b.label} ${sample.filter((e) => bucketIndex(e.base_difficulty) === i).length}/${pool.filter((e) => bucketIndex(e.base_difficulty) === i).length}`).join(' · ')
  summary.push(
    `${group}: 확인 필요 공식 어휘 ${official.length}개 → 제외 ${reviewed.length + amb.length + color.length}개 (교사 검수·수정 ${reviewed.length}, 애매 표시 ${amb.length}, 색 이름 ${color.length}) → 후보 ${pool.length}개 → 샘플 ${sample.length}개 [구간별 샘플/후보: ${perBucket}]`,
  )
}
console.log(summary.join('\n'))
