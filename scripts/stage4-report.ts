// 4단계 보고서 재료 만들기 (읽기만 한다. DB 값을 바꾸지 않는다. AI 호출 없음)
//   docs/stage4-review-pack.md — 검수용 무작위 샘플 40개, 애매한 단어, 제외한 기능어, 초5 단어시험 출제 가능 문항 수 + 시험지 예시
// 무작위는 고정 씨앗(seed)으로 뽑아 다시 실행해도 같은 샘플이 나온다.
//
// 실행: node scripts/stage4-report.ts

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { generalTestCandidates } from '../lib/vocabularyCalibration.ts'
import { generateWordTest, POS_LABELS_KO, WORD_TEST_MODE_LABELS, type WordTestEntry, type WordTestMode } from '../lib/wordTest.ts'
import { findDifficultyBand } from '../config/vocabularyLevels.ts'

const SAMPLE_SIZE = 40
const LEVELS = ['school', 'academy', 'advanced', 'prestudy'] as const
const LEVEL_NAMES: Record<(typeof LEVELS)[number], string> = { school: '학교형', academy: '일반학원형', advanced: '상위학원형', prestudy: '선행형' }
const MODES: WordTestMode[] = ['en_ko', 'ko_en', 'mixed']

// 고정 씨앗 난수 (mulberry32)
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type SeedEntry = {
  expression: string; pos: string; meaning_ko: string; accepted_meanings: string[]; base_difficulty: number
  ko_en_allowed: boolean; sense_note?: string; teacher_note?: string; ambiguity?: string; official_no: number
}

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

const esc = (s: string) => s.replace(/\|/g, '\\|')

async function main() {
  const seeds = ['01', '02', '03', '04'].map((n) => JSON.parse(readFileSync(resolve(process.cwd(), `data/vocabulary/kr-curriculum-2022-elementary-${n}.json`), 'utf-8')))
  const made: SeedEntry[] = seeds.flatMap((s) => s.entries)
  const commonFiles = readdirSync(resolve(process.cwd(), 'data/vocabulary')).filter((f) => /^kr-curriculum-2022-common-\d\d\.json$/.test(f)).sort()
  const madeCommon: SeedEntry[] = commonFiles.flatMap((f) => JSON.parse(readFileSync(resolve(process.cwd(), 'data/vocabulary', f), 'utf-8')).entries)

  // 제외한 기능어: 제작 원본의 '-단어|이유' 줄
  const excluded: { word: string; reason: string }[] = []
  for (const f of ['a', 'b', 'c', 'd']) {
    for (const line of readFileSync(resolve(process.cwd(), `data/vocabulary/source/elementary-${f}.txt`), 'utf-8').split('\n')) {
      if (line.startsWith('-')) {
        const [word, reason] = line.slice(1).split('|')
        excluded.push({ word, reason: (reason ?? '').trim() })
      }
    }
  }

  const env = loadEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: loginError } = await supabase.auth.signInWithPassword({ email: env.SUPABASE_LOGIN_EMAIL, password: env.SUPABASE_LOGIN_PASSWORD })
  if (loginError) throw new Error(`로그인 실패: ${loginError.message}`)
  const { data, error } = await supabase.from('vocabulary_entries').select('*, vocabulary_sources(source_type, source_ref)').is('deleted_at', null)
  if (error) throw new Error(error.message)
  type Row = WordTestEntry & { vocabulary_sources: { source_type: string; source_ref: string }[] }
  const rows = data as Row[]
  const approvedPool = generalTestCandidates(rows.filter((e) => e.status === 'approved'))
  const ifApproved = generalTestCandidates(rows.filter((e) => e.status === 'approved' || e.status === 'pending')).map((e) => ({ ...e, status: 'approved' as const }))

  const out: string[] = [
    '# 4단계 검수 자료: 초등 권장 어휘',
    '',
    `- 만든 날: ${new Date().toISOString().slice(0, 10)} · \`node scripts/stage4-report.ts\` (읽기 전용)`,
    `- 새로 만든 항목 **${made.length}개** (공식 초등 권장 800개 중 단어은행에 없던 779개 표제어 − 제외 기능어 ${excluded.length}개 + 두 항목으로 나눈 단어 7개). 전부 **확인 필요**.`,
    `- 단어은행 지금: 사용 중 ${rows.filter((e) => e.status === 'approved').length} / 확인 필요 ${rows.filter((e) => e.status === 'pending').length}`,
    '',
    '## 1. 단어시험: 몇 문제까지 낼 수 있나 (초5 / 중1 / 중3)',
    '',
    '### 초5',
    '',
    '문항 수 = 그 레벨 범위에서 한 시험에 겹치지 않게 뽑을 수 있는 최대 개수 (같은 철자 다른 뜻 1번만, 한→영은 같은 뜻 1번만).',
    '',
    '| 레벨 | 범위 | 지금(사용 중만) 영→한 / 한→영 / 혼합 | 확인 필요 모두 사용하기 후 영→한 / 한→영 / 혼합 |',
    '|---|---|---|---|',
  ]
  const capacity = (pool: WordTestEntry[], band: { min: number; max: number }, mode: WordTestMode) =>
    generateWordTest(pool, band, mode, 2000, seeded(1)).items.length
  for (const l of LEVELS) {
    const band = findDifficultyBand('초5', l, 'en_ko')!
    const now = MODES.map((m) => capacity(approvedPool, band, m)).join(' / ')
    const after = MODES.map((m) => capacity(ifApproved, band, m)).join(' / ')
    out.push(`| ${LEVEL_NAMES[l]} | ${band.min}~${band.max} | ${now} | **${after}** |`)
  }

  // 중1 · 중3 도 같은 표 (중·고 공통 보강 결과 확인용)
  for (const g of ['중1', '중3'] as const) {
    out.push('', `### ${g}`, '', '| 레벨 | 범위 | 지금(사용 중만) 영→한 / 한→영 / 혼합 | 확인 필요 모두 사용하기 후 영→한 / 한→영 / 혼합 |', '|---|---|---|---|')
    for (const l of LEVELS) {
      const b = findDifficultyBand(g, l, 'en_ko')!
      out.push(`| ${LEVEL_NAMES[l]} | ${b.min}~${b.max} | ${MODES.map((m) => capacity(approvedPool, b, m)).join(' / ')} | **${MODES.map((m) => capacity(ifApproved, b, m)).join(' / ')}** |`)
    }
  }

  // 시험지 예시: 초5 일반학원형 영→한 40문항 (확인 필요를 모두 사용하기 했다고 가정)
  const band = findDifficultyBand('초5', 'academy', 'en_ko')!
  const test = generateWordTest(ifApproved, band, 'en_ko', 40, seeded(5))
  out.push(
    '',
    `### 시험지 예시: 초5 일반학원형 ${WORD_TEST_MODE_LABELS.en_ko} ${test.items.length}문항 (확인 필요를 모두 사용하기 했다고 가정한 모의 생성, DB 에 저장하지 않음)`,
    '',
    '| # | 문제 | 정답(인정 뜻) | 난이도 |',
    '|---|---|---|---|',
  )
  test.items.forEach((it, i) => {
    const e = it.entry
    out.push(`| ${i + 1} | ${esc(e.expression)} | ${esc([e.meaning_ko, ...e.accepted_meanings].join(' / '))} | ${e.base_difficulty} |`)
  })

  // 검수용 무작위 샘플 40개
  const rnd = seeded(20260928)
  const sample = [...made].map((e) => ({ e, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, SAMPLE_SIZE).map((x) => x.e)
    .sort((a, b) => a.official_no - b.official_no)
  out.push(
    '',
    `## 2. 검수용 무작위 샘플 ${SAMPLE_SIZE}개`,
    '',
    '이 40개를 보고 괜찮으면 나머지를 **확인 필요 → 전체 선택 → 선택한 N개 사용하기**로 한 번에 승인하는 흐름입니다.',
    '',
    '| # | 단어 | 품사 | 대표 뜻 | 인정 뜻 | 난이도 | 한→영 | 메모 |',
    '|---|---|---|---|---|---|---|---|',
  )
  sample.forEach((e, i) => {
    const note = [e.sense_note, e.teacher_note].filter(Boolean).join(' · ')
    out.push(`| ${i + 1} | ${esc(e.expression)} | ${POS_LABELS_KO[e.pos] ?? e.pos} | ${esc(e.meaning_ko)} | ${esc(e.accepted_meanings.join(', ') || '-')} | ${e.base_difficulty} | ${e.ko_en_allowed ? '○' : '–'} | ${esc(note || '-')} |`)
  })

  // 애매한 단어 (초등 권장 + 중·고 공통)
  const ambiguous = [...made, ...madeCommon].filter((e) => e.ambiguity)
  out.push('', `## 3. 제작하면서 애매했던 단어 (${ambiguous.length}개: 초등 권장 ${made.filter((e) => e.ambiguity).length} + 중·고 공통 ${madeCommon.filter((e) => e.ambiguity).length})`, '', '| 단어 | 품사 | 지금 대표 뜻 | 인정 뜻 | 애매한 점 |', '|---|---|---|---|---|')
  for (const e of ambiguous) out.push(`| ${esc(e.expression)} | ${POS_LABELS_KO[e.pos] ?? e.pos} | ${esc(e.meaning_ko)} | ${esc(e.accepted_meanings.join(', ') || '-')} | ${esc(e.ambiguity!)} |`)

  // 제외 기능어
  out.push('', `## 4. 넣지 않은 기능어 (${excluded.length}개)`, '', '단어시험 가치가 낮다고 판단해 단어은행에 넣지 않았다. 필요하면 원본(`data/vocabulary/source/`)에서 `-` 를 지우고 다시 만들면 된다.', '')
  const byReason = new Map<string, string[]>()
  for (const x of excluded) byReason.set(x.reason, [...(byReason.get(x.reason) ?? []), x.word])
  for (const [reason, words] of byReason) out.push(`- ${reason}: ${words.join(', ')}`)

  // 분포
  const hist = (lo: number, hi: number) => made.filter((e) => e.base_difficulty >= lo && e.base_difficulty <= hi).length
  out.push(
    '',
    '## 5. 난이도·한→영 분포 (새로 만든 항목)',
    '',
    `- 난이도: 1~8 (아주 쉬운 구체어) ${hist(1, 8)} / 9~15 (초3~4) ${hist(9, 15)} / 16~22 (초5) ${hist(16, 22)} / 23~30 (초6·추상어) ${hist(23, 30)}`,
    `- 한→영 가능 ${made.filter((e) => e.ko_en_allowed).length}개 / 불가 ${made.filter((e) => !e.ko_en_allowed).length}개 (뜻이 같은 영어 단어가 여럿이거나, 뜻이 여러 개인 단어는 불가)`,
    `- 두 항목으로 나눈 단어: ${[...new Set(made.filter((e) => made.filter((x) => x.expression === e.expression).length > 1).map((e) => e.expression))].join(', ')}`,
  )

  writeFileSync(resolve(process.cwd(), 'docs/stage4-review-pack.md'), out.join('\n') + '\n')
  console.log(out.slice(8, 16).join('\n'))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
