// 레벨테스트 규칙 (화면·API 가 함께 쓴다): 학년 목록, 시험지 목록, 채점, 추천 반 판정.
// 시험지 내용은 data/level-tests/*.json — 새 시험지를 만들면 아래 LEVEL_TESTS 에 한 줄 추가한다. AI API 는 호출하지 않는다.

import type {
  LevelTest,
  LevelTestAnswers,
  LevelTestForm,
  LevelTestItem,
  LevelTestOverrides,
  LevelTestRecommendation,
  LevelTestScore,
  LevelTestSection,
} from '@/types/levelTest'
import { LEVEL_TEST_BANDS, LEVEL_TEST_STRENGTH_MIN, LEVEL_TEST_WEAKNESS_MAX, type LevelTestBand } from '@/config/levelTestBands'
import e3A from '@/data/level-tests/e3-A.json'
import e3B from '@/data/level-tests/e3-B.json'
import e4A from '@/data/level-tests/e4-A.json'
import e4B from '@/data/level-tests/e4-B.json'
import e5A from '@/data/level-tests/e5-A.json'
import e5B from '@/data/level-tests/e5-B.json'
import e6A from '@/data/level-tests/e6-A.json'
import e6B from '@/data/level-tests/e6-B.json'
import m1A from '@/data/level-tests/m1-A.json'
import m1B from '@/data/level-tests/m1-B.json'
import m2A from '@/data/level-tests/m2-A.json'
import m2B from '@/data/level-tests/m2-B.json'
import m3A from '@/data/level-tests/m3-A.json'
import m3B from '@/data/level-tests/m3-B.json'
import h1A from '@/data/level-tests/h1-A.json'
import h1B from '@/data/level-tests/h1-B.json'
import h2A from '@/data/level-tests/h2-A.json'
import h2B from '@/data/level-tests/h2-B.json'
import h3A from '@/data/level-tests/h3-A.json'
import h3B from '@/data/level-tests/h3-B.json'

// 학년 폴더 (주소에는 slug 를 쓴다: /materials/level-tests/e3)
export const LEVEL_TEST_GRADES = [
  { slug: 'e3', grade: '초3' },
  { slug: 'e4', grade: '초4' },
  { slug: 'e5', grade: '초5' },
  { slug: 'e6', grade: '초6' },
  { slug: 'm1', grade: '중1' },
  { slug: 'm2', grade: '중2' },
  { slug: 'm3', grade: '중3' },
  { slug: 'h1', grade: '고1' },
  { slug: 'h2', grade: '고2' },
  { slug: 'h3', grade: '고3' },
] as const

export const LEVEL_TEST_FORMS: { form: LevelTestForm; label: string; range: string }[] = [
  { form: 'A', label: 'A형', range: '초급~중급' },
  { form: 'B', label: 'B형', range: '중급~고급' },
]

export const SECTION_LABELS: Record<LevelTestSection, string> = {
  vocab: '어휘',
  grammar: '문법',
  reading: '독해',
  writing: '서술형',
}
export const SECTION_ORDER: LevelTestSection[] = ['vocab', 'grammar', 'reading', 'writing']

const LEVEL_TESTS: LevelTest[] = [
  e3A, e3B, e4A, e4B, e5A, e5B, e6A, e6B,
  m1A, m1B, m2A, m2B, m3A, m3B, h1A, h1B, h2A, h2B, h3A, h3B,
] as LevelTest[]

export function gradeBySlug(slug: string) {
  return LEVEL_TEST_GRADES.find((g) => g.slug === slug) ?? null
}
export function slugOfGrade(grade: string): string | null {
  return LEVEL_TEST_GRADES.find((g) => g.grade === grade)?.slug ?? null
}
export function findLevelTest(grade: string, form: string): LevelTest | null {
  return LEVEL_TESTS.find((t) => t.grade === grade && t.form === form) ?? null
}
export function findLevelTestById(id: string): LevelTest | null {
  return LEVEL_TESTS.find((t) => t.id === id) ?? null
}
export function levelTestsOfGrade(grade: string): LevelTest[] {
  return LEVEL_TESTS.filter((t) => t.grade === grade)
}

// 문항을 영역 순서대로 (시험지·답안지·응시 화면 모두 이 순서·번호를 쓴다)
export function orderedItems(test: LevelTest): LevelTestItem[] {
  return SECTION_ORDER.flatMap((s) => test.items.filter((i) => i.section === s))
}

export const CHOICE_MARKS = ['①', '②', '③', '④', '⑤']

// 쓰기 답 비교용: 대소문자·앞뒤 공백·여러 칸 공백·끝 문장부호·곧은/굽은 따옴표 차이는 무시
export function normalizeWritten(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim()
}

export function isItemCorrect(item: LevelTestItem, answers: LevelTestAnswers, overrides: LevelTestOverrides = {}): boolean {
  if (item.id in overrides) return !!overrides[item.id]
  const given = answers[item.id]
  if (given === undefined || given === '') return false
  if (item.type === 'mc') return Number(given) === item.answer
  const g = normalizeWritten(String(given))
  return [String(item.answer), ...(item.accept ?? [])].some((a) => normalizeWritten(a) === g)
}

export function scoreLevelTest(test: LevelTest, answers: LevelTestAnswers, overrides: LevelTestOverrides = {}): LevelTestScore {
  const correctIds: string[] = []
  const sections = SECTION_ORDER.map((section) => {
    const items = test.items.filter((i) => i.section === section)
    let score = 0
    let correct = 0
    for (const it of items) {
      if (isItemCorrect(it, answers, overrides)) {
        score += it.points
        correct++
        correctIds.push(it.id)
      }
    }
    return { section, score, max: items.reduce((a, i) => a + i.points, 0), correct, count: items.length }
  }).filter((s) => s.count > 0)
  const total = sections.reduce((a, s) => a + s.score, 0)
  const max = sections.reduce((a, s) => a + s.max, 0)
  return { total, max, percent: max ? Math.round((total / max) * 100) : 0, sections, correctIds }
}

// 기초반 안내(알파벳·기초 단어부터)는 초등용 — 중·고등은 안내 문구를 비운다 (2026-10-26 향미님)
export function bandAdvice(band: LevelTestBand, grade: string): string {
  return band.band === '기초반' && !grade.startsWith('초') ? '' : band.advice
}

export function recommendLevel(form: LevelTestForm, percent: number, grade: string): LevelTestRecommendation {
  const band = LEVEL_TEST_BANDS[form].find((b) => percent >= b.min) ?? LEVEL_TEST_BANDS[form][LEVEL_TEST_BANDS[form].length - 1]
  return { band: band.band, summary: band.summary, advice: bandAdvice(band, grade) }
}

// 영역별 강점·약점 (영역 백분율 기준)
export function strengthsAndWeaknesses(score: LevelTestScore): { strengths: LevelTestSection[]; weaknesses: LevelTestSection[] } {
  const pct = (s: { score: number; max: number }) => (s.max ? (s.score / s.max) * 100 : 0)
  return {
    strengths: score.sections.filter((s) => pct(s) >= LEVEL_TEST_STRENGTH_MIN).map((s) => s.section),
    weaknesses: score.sections.filter((s) => pct(s) <= LEVEL_TEST_WEAKNESS_MAX).map((s) => s.section),
  }
}

// 시험지 JSON 검사 (scripts/check-level-test.ts 와 화면 안전장치)
export function levelTestProblems(test: LevelTest): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const passageIds = new Set(test.passages.map((p) => p.id))
  for (const it of test.items) {
    if (ids.has(it.id)) errors.push(`문항 id 중복: ${it.id}`)
    ids.add(it.id)
    if (!it.explanation) errors.push(`${it.id}: 해설 없음`)
    if (it.passageId && !passageIds.has(it.passageId)) errors.push(`${it.id}: 지문 ${it.passageId} 없음`)
    if (it.type === 'mc') {
      if (!Array.isArray(it.choices) || it.choices.length !== 4) errors.push(`${it.id}: 보기가 4개가 아님`)
      if (typeof it.answer !== 'number' || it.answer < 0 || it.answer >= (it.choices?.length ?? 0)) errors.push(`${it.id}: 정답 번호 이상`)
      if (it.choices && new Set(it.choices).size !== it.choices.length) errors.push(`${it.id}: 같은 보기가 있음`)
    } else if (typeof it.answer !== 'string' || !it.answer.trim()) errors.push(`${it.id}: 쓰기 모범답 없음`)
  }
  const max = test.items.reduce((a, i) => a + i.points, 0)
  if (max !== 100) errors.push(`총점이 100점이 아니라 ${max}점`)
  return errors
}
