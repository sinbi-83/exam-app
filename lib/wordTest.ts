// 단어은행 → 자동 단어시험: 후보 고르기 / 교체 / 시험 문항 snapshot 만들기.
//
// - AI API 를 호출하지 않는다. 승인된 어휘 목록 + 난이도 범위로만 고른다.
// - 후보가 부족해도 다른(하위) 레벨 범위에서 몰래 채우지 않는다 → 고른 개수와 부족 여부를 그대로 돌려준다.
// - 저장되는 문항은 snapshot 이다: 이후 단어은행이 바뀌어도 저장된 시험은 바뀌지 않는다.
//
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

import type { VocabularyDirection, VocabularyEntryRecord } from '../types/vocabulary'

export type WordTestMode = VocabularyDirection | 'mixed'

export const WORD_TEST_MODE_LABELS: Record<WordTestMode, string> = {
  en_ko: '영→한',
  ko_en: '한→영',
  mixed: '혼합',
}

// 자동시험에 필요한 어휘 칸만
export type WordTestEntry = Pick<
  VocabularyEntryRecord,
  | 'id'
  | 'expression'
  | 'expression_key'
  | 'meaning_ko'
  | 'meaning_key'
  | 'accepted_meanings'
  | 'pos'
  | 'entry_type'
  | 'base_difficulty'
  | 'ko_en_difficulty'
  | 'ko_en_allowed'
  | 'status'
  | 'deleted_at'
>

export interface WordTestBand {
  min: number
  max: number
}

export interface WordTestItem {
  entry: WordTestEntry
  direction: VocabularyDirection
}

// 어휘 하나가 그 방향으로 이 범위에서 출제 가능한지 (조건 1~4)
export function isEligible(entry: WordTestEntry, direction: VocabularyDirection, band: WordTestBand): boolean {
  if (entry.status !== 'approved' || entry.deleted_at !== null) return false
  if (direction === 'ko_en' && !entry.ko_en_allowed) return false
  const d = direction === 'ko_en' && entry.ko_en_difficulty !== null ? entry.ko_en_difficulty : entry.base_difficulty
  return d !== null && d >= band.min && d <= band.max
}

// 이미 고른 문항들과 충돌하는지 (조건 5, 6)
//  5) 같은 기준표기(expression_key)의 다른 뜻은 한 시험에 한 번만
//  6) 한→영 문항끼리 같은 한국어 뜻(meaning_key)이면 정답이 둘이 되므로 하나만
function conflicts(entry: WordTestEntry, direction: VocabularyDirection, picked: WordTestItem[]): boolean {
  return picked.some(
    (p) =>
      p.entry.expression_key === entry.expression_key ||
      (direction === 'ko_en' && p.direction === 'ko_en' && p.entry.meaning_key === entry.meaning_key),
  )
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface GenerateResult {
  items: WordTestItem[]
  requested: number
  shortage: boolean // 요청 개수보다 적게 골랐다
}

// 혼합: 한→영 가능한 단어가 절반까지 한→영, 나머지는 영→한. 결과는 영→한 먼저, 한→영 나중 순서.
export function generateWordTest(
  entries: WordTestEntry[],
  band: WordTestBand,
  mode: WordTestMode,
  count: number,
  random: () => number = Math.random,
): GenerateResult {
  const pool = shuffle(entries, random)
  const picked: WordTestItem[] = []

  const take = (direction: VocabularyDirection, limit: number) => {
    for (const entry of pool) {
      if (picked.length >= limit) break
      if (picked.some((p) => p.entry.id === entry.id)) continue
      if (!isEligible(entry, direction, band) || conflicts(entry, direction, picked)) continue
      picked.push({ entry, direction })
    }
  }

  if (mode === 'mixed') {
    take('ko_en', Math.floor(count / 2))
    take('en_ko', count)
  } else {
    take(mode, count)
  }

  const order = (d: VocabularyDirection) => (d === 'en_ko' ? 0 : 1)
  const items = picked.map((p, i) => ({ p, i })).sort((a, b) => order(a.p.direction) - order(b.p.direction) || a.i - b.i).map((x) => x.p)
  return { items, requested: count, shortage: items.length < count }
}

// index 번째 문항을 같은 방향의 다른 단어로 바꾼다. excludedIds = 이번 시험에서 이미 빼거나 바꾼 단어 (다시 뽑지 않음).
// 바꿀 단어가 없으면 null.
export function pickReplacement(
  entries: WordTestEntry[],
  band: WordTestBand,
  items: WordTestItem[],
  index: number,
  excludedIds: Set<string>,
  random: () => number = Math.random,
): WordTestItem | null {
  const target = items[index]
  if (!target) return null
  const others = items.filter((_, i) => i !== index)
  for (const entry of shuffle(entries, random)) {
    if (entry.id === target.entry.id || excludedIds.has(entry.id)) continue
    if (others.some((p) => p.entry.id === entry.id)) continue
    if (!isEligible(entry, target.direction, band) || conflicts(entry, target.direction, others)) continue
    return { entry, direction: target.direction }
  }
  return null
}

// ── 저장용 snapshot (exam_questions.question_data) ──
// 기존 'vocab'(지문 속 어휘 객관식) 분석 영역과 섞이지 않도록 새 type 'word' 를 쓴다.
export interface WordQuestionData {
  type: 'word'
  direction: VocabularyDirection
  question: string // 시험지에 보이는 제시어 (영→한: 영어 표현 / 한→영: 한국어 뜻)
  answer: string // 대표 정답
  accepted_answers: string[] // 정답으로 인정할 답 전체 (대표 정답 포함)
  expression: string
  meaning_ko: string
  pos: string | null
  entry_type: string
  source: 'vocabulary_bank'
  source_vocabulary_entry_id: string
}

export function toWordQuestionData(item: WordTestItem): WordQuestionData {
  const { entry, direction } = item
  const accepted = direction === 'en_ko'
    ? [entry.meaning_ko, ...entry.accepted_meanings.filter((m) => m !== entry.meaning_ko)]
    : [entry.expression]
  return {
    type: 'word',
    direction,
    question: direction === 'en_ko' ? entry.expression : entry.meaning_ko,
    answer: direction === 'en_ko' ? entry.meaning_ko : entry.expression,
    accepted_answers: accepted,
    expression: entry.expression,
    meaning_ko: entry.meaning_ko,
    pos: entry.pos,
    entry_type: entry.entry_type,
    source: 'vocabulary_bank',
    source_vocabulary_entry_id: entry.id,
  }
}

// 저장된 시험이 단어시험인지: 문항이 있고 전부 'word' 일 때만 (기존 시험은 전부 false → 기존 인쇄 그대로)
export function isWordTestExam(questions: { question_data: { type: string } }[]): boolean {
  return questions.length > 0 && questions.every((q) => q.question_data.type === 'word')
}

export const POS_LABELS_KO: Record<string, string> = {
  noun: '명', pronoun: '대', verb: '동', auxiliary: '조', adjective: '형', adverb: '부',
  preposition: '전', conjunction: '접', determiner: '한', interjection: '감', numeral: '수',
}
