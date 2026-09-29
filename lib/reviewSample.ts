// 향미 선생님용 검수 샘플표: '확인 필요' 공식 어휘에서 난이도 구간별로 고르게 뽑아 CSV 로 만들고,
// 선생님이 O/X 를 채운 CSV 를 읽어 판정한다. (scripts/review-sample-build.ts, scripts/review-sample-result.ts)
// DB 에 쓰지 않는다. 무작위는 고정 씨앗(seed)이라 다시 뽑아도 같은 결과.

import { parseCsv } from './officialVocabulary.ts'

// 난이도 구간 (포함)
export const REVIEW_BUCKETS: readonly { label: string; min: number; max: number }[] = [
  { label: '1~10', min: 1, max: 10 },
  { label: '11~40', min: 11, max: 40 },
  { label: '41~79', min: 41, max: 79 },
  { label: '80+', min: 80, max: 100 },
]

export function bucketIndex(difficulty: number | null): number {
  if (difficulty === null) return -1
  return REVIEW_BUCKETS.findIndex((b) => difficulty >= b.min && difficulty <= b.max)
}

// 고정 씨앗 난수 (mulberry32)
export function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 구간별 개수: 단어가 있는 구간에 한 개씩 돌아가며 나눈다 (모자란 구간 몫은 다른 구간으로)
export function allocate(available: number[], total: number): number[] {
  const out = available.map(() => 0)
  let left = Math.min(total, available.reduce((a, b) => a + b, 0))
  while (left > 0) {
    for (let i = 0; i < available.length && left > 0; i++) {
      if (out[i] < available[i]) {
        out[i]++
        left--
      }
    }
  }
  return out
}

// 구간별로 고르게 무작위 표본. 같은 입력·씨앗이면 같은 결과 (입력 순서와 무관하게 id 로 먼저 정렬)
export function stratifiedSample<T extends { id: string; base_difficulty: number | null }>(entries: readonly T[], total: number, seed: number): T[] {
  const random = seededRandom(seed)
  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id))
  const groups = REVIEW_BUCKETS.map((_, i) => sorted.filter((e) => bucketIndex(e.base_difficulty) === i))
  const counts = allocate(groups.map((g) => g.length), total)
  const picked: T[] = []
  groups.forEach((g, i) => {
    const a = [...g]
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(random() * (k + 1))
      ;[a[k], a[j]] = [a[j], a[k]]
    }
    picked.push(...a.slice(0, counts[i]))
  })
  return picked.sort((a, b) => (a.base_difficulty ?? 0) - (b.base_difficulty ?? 0) || a.id.localeCompare(b.id))
}

export const REVIEW_CSV_HEADER = ['번호', '단어', '품사', '대표 뜻', '인정 뜻', '난이도', '한→영 가능', '판정', '메모'] as const

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface ReviewRow {
  expression: string
  pos: string // 화면용 한글 품사
  meaning_ko: string
  accepted_meanings: string[]
  base_difficulty: number | null
  ko_en_allowed: boolean
}

// 엑셀에서 한글이 깨지지 않게 UTF-8 BOM + CRLF
export function buildReviewCsv(rows: readonly ReviewRow[]): string {
  const lines = [REVIEW_CSV_HEADER.join(',')]
  rows.forEach((r, i) => {
    lines.push(
      [i + 1, r.expression, r.pos, r.meaning_ko, r.accepted_meanings.join(', '), r.base_difficulty ?? '', r.ko_en_allowed ? '가능' : '불가', '', '']
        .map(csvCell)
        .join(','),
    )
  })
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// ── 채점 ──
export type Verdict = 'O' | 'X' | ''

export function normalizeVerdict(v: string | undefined): Verdict | null {
  const s = (v ?? '').trim().toUpperCase()
  if (s === '') return ''
  if (['O', '○', 'ㅇ', '0'].includes(s)) return 'O'
  if (['X', '×', '✕'].includes(s)) return 'X'
  return null // 알아볼 수 없는 값
}

export interface ReviewResult {
  total: number
  o: number
  x: number
  blank: number
  unknown: { no: string; word: string; value: string }[]
  xWords: { no: string; word: string; memo: string }[]
  xRate: number // X / (O + X), 판정한 것이 없으면 0
  decision: string
}

// X 가 2개 이하 → 일괄 사용하기 가능 (X 단어는 빼고), 3개 이상 → 난이도 구간별로 나눠 다시 검토
export const REVIEW_X_LIMIT = 2

export function judgeReviewCsv(text: string): ReviewResult {
  const rows = parseCsv(text.replace(/^﻿/, ''))
  const header = rows[0]?.map((h) => h.trim()) ?? []
  const col = (name: string) => header.indexOf(name)
  const [cNo, cWord, cVerdict, cMemo] = [col('번호'), col('단어'), col('판정'), col('메모')]
  if (cWord < 0 || cVerdict < 0) throw new Error('CSV 머리줄에 "단어"와 "판정" 칸이 있어야 합니다.')
  const r: ReviewResult = { total: 0, o: 0, x: 0, blank: 0, unknown: [], xWords: [], xRate: 0, decision: '' }
  for (const row of rows.slice(1)) {
    const word = (row[cWord] ?? '').trim()
    if (!word) continue
    r.total++
    const no = cNo >= 0 ? (row[cNo] ?? '').trim() : String(r.total)
    const v = normalizeVerdict(row[cVerdict])
    if (v === 'O') r.o++
    else if (v === 'X') {
      r.x++
      r.xWords.push({ no, word, memo: cMemo >= 0 ? (row[cMemo] ?? '').trim() : '' })
    } else if (v === '') r.blank++
    else r.unknown.push({ no, word, value: (row[cVerdict] ?? '').trim() })
  }
  r.xRate = r.o + r.x > 0 ? r.x / (r.o + r.x) : 0
  if (r.blank > 0 || r.unknown.length > 0) {
    r.decision = `아직 판정할 수 없음: 빈칸 ${r.blank}개, 알아볼 수 없는 값 ${r.unknown.length}개를 O 또는 X 로 채워 주세요.`
  } else if (r.x <= REVIEW_X_LIMIT) {
    r.decision = `일괄 사용하기 가능 (X 단어 ${r.x}개는 빼고 사용하기, X 가 ${r.total}개 중 ${REVIEW_X_LIMIT}개 이하)`
  } else {
    r.decision = `난이도 구간별로 나눠 다시 검토 (X 가 ${r.total}개 중 ${r.x}개 — ${REVIEW_X_LIMIT + 1}개 이상)`
  }
  return r
}
