// 7단계 혼합 출제: 지문 1개의 문항을 유형(객관식/주관식/문법) × 레벨로 고르는 규칙 (docs/design-plan.md 7단계).
//
// - AI API 를 호출하지 않는다. 고른 지문 한 개의 문항만 쓴다 — 다른 지문에서 채우지 않는다.
// - 고른 레벨 문항을 먼저, 모자라면 같은 지문 안에서 가까운 레벨 순서로 채운다 (같은 거리면 낮은 쪽, 난이도 없음은 맨 뒤).
// - 그래도 모자라면 있는 만큼만 고르고 부족을 그대로 돌려준다.
//
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

import type { UnifiedDifficulty, UnifiedPassageRow } from './passageUnified'

export type MixedCategory = 'mc' | 'subjective' | 'grammar'

export const MIXED_CATEGORIES: readonly MixedCategory[] = ['mc', 'subjective', 'grammar']

export const MIXED_CATEGORY_LABELS: Record<MixedCategory, string> = { mc: '객관식', subjective: '주관식', grammar: '문법' }

// AI 문항 (questions.question_type 원래 값): 어법 객관식·서술형 어법고쳐쓰기 → 문법, 어휘·독해·지문요약 → 객관식, 그 밖 서술형 → 주관식
export function aiCategory(questionType: string, hasChoices: boolean): MixedCategory {
  if (questionType === 'grammar' || questionType === 'essay_어법고쳐쓰기') return 'grammar'
  if (questionType.startsWith('essay_')) return 'subjective'
  if (questionType === 'vocab' || questionType === 'summary' || questionType.startsWith('reading_')) return 'mc'
  return hasChoices ? 'mc' : 'subjective'
}

// 외부지문 문항: mc·tf → 객관식, blank·order·match·서술형 → 주관식. 외부지문에는 문법 표시가 없다
export function externalCategory(kind: 'question' | 'essay', type: string | undefined): MixedCategory {
  if (kind === 'essay') return 'subjective'
  return type === 'mc' || type === 'tf' ? 'mc' : 'subjective'
}

// 외부지문 문항을 구분하는 키: qid 가 있으면 qid, 없으면(예전 지문) 위치 기반 임시 키. DB 에 저장된 qid 를 지어내지 않는다.
export function externalItemKey(passageId: string, kind: 'question' | 'essay', index: number, qid: string | undefined): string {
  return qid ? `ext:${passageId}:qid:${qid}` : `ext:${passageId}:${kind === 'essay' ? 'essays' : 'questions'}:${index}`
}

export interface MixedCandidate<D = Record<string, unknown>> {
  key: string // 한 지문 안에서 유일 (AI = ai:<questions.id>, 외부 = externalItemKey)
  category: MixedCategory
  difficulty: UnifiedDifficulty | null
  preview: string // 미리보기 한 줄
  question_data: D // 시험에 그대로 저장할 snapshot
}

export type CategoryCounts = Record<MixedCategory, number>

// 고른 레벨에 가까운 순서 (같은 거리면 낮은 쪽, 난이도 없음은 맨 뒤)
function levelRank(d: UnifiedDifficulty | null, level: UnifiedDifficulty): number {
  if (d === null) return 100
  const dist = Math.abs(d - level)
  return dist * 2 + (d < level ? 0 : 1)
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 같은 우선순위 안에서는 섞고, 우선순위(레벨 거리) 순으로 늘어놓는다
function ordered<C extends MixedCandidate>(cands: readonly C[], level: UnifiedDifficulty, random: () => number): C[] {
  return shuffle(cands, random)
    .map((c, i) => ({ c, i, r: levelRank(c.difficulty, level) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c)
}

export interface Availability {
  total: CategoryCounts // 이 지문의 유형별 전체 문항 수
  atLevel: CategoryCounts // 그중 고른 레벨과 같은 것
}

export function availability(cands: readonly MixedCandidate[], level: UnifiedDifficulty): Availability {
  const total: CategoryCounts = { mc: 0, subjective: 0, grammar: 0 }
  const atLevel: CategoryCounts = { mc: 0, subjective: 0, grammar: 0 }
  for (const c of cands) {
    total[c.category]++
    if (c.difficulty === level) atLevel[c.category]++
  }
  return { total, atLevel }
}

export interface Shortage {
  category: MixedCategory
  requested: number
  picked: number
}

// 뽑기 전에 알려줄 부족 (요청 > 이 지문의 그 유형 전체 문항 수)
export function expectedShortages(cands: readonly MixedCandidate[], counts: CategoryCounts): Shortage[] {
  const { total } = availability(cands, 1)
  return MIXED_CATEGORIES.filter((c) => counts[c] > total[c]).map((c) => ({ category: c, requested: counts[c], picked: total[c] }))
}

export interface SelectResult<C> {
  items: C[] // 유형 순서(객관식 → 주관식 → 문법), 유형 안에서는 레벨 우선순위 순
  shortages: Shortage[]
  offLevel: number // 고른 레벨이 아닌 레벨에서 채운 문항 수 (미리보기 안내용)
}

export function selectPassageItems<C extends MixedCandidate>(
  cands: readonly C[],
  counts: CategoryCounts,
  level: UnifiedDifficulty,
  random: () => number = Math.random,
): SelectResult<C> {
  const items: C[] = []
  const shortages: Shortage[] = []
  for (const category of MIXED_CATEGORIES) {
    const want = Math.max(0, Math.floor(counts[category] || 0))
    if (want === 0) continue
    const picked = ordered(cands.filter((c) => c.category === category), level, random).slice(0, want)
    items.push(...picked)
    if (picked.length < want) shortages.push({ category, requested: want, picked: picked.length })
  }
  return { items, shortages, offLevel: items.filter((c) => c.difficulty !== level).length }
}

// 미리보기의 한 문항을 같은 유형의 다른 문항으로 바꾼다 (같은 지문 안에서만). 없으면 null.
// excludedKeys = 이번 초안에서 이미 빼거나 바꾼 문항 (다시 뽑지 않음)
export function pickPassageReplacement<C extends MixedCandidate>(
  cands: readonly C[],
  current: readonly C[],
  target: C,
  level: UnifiedDifficulty,
  excludedKeys: ReadonlySet<string>,
  random: () => number = Math.random,
): C | null {
  const used = new Set(current.map((c) => c.key))
  const pool = cands.filter((c) => c.category === target.category && !used.has(c.key) && !excludedKeys.has(c.key))
  return ordered(pool, level, random)[0] ?? null
}

// 통합 목록에서 고른 한 줄 → 실제로 문항을 읽을 지문.
// 외부지문 4단계 세트는 고른 레벨의 단계 지문을, 그 단계가 없으면 가장 가까운 단계(같은 거리면 낮은 쪽)를 쓴다.
export function resolvePassageSource(
  row: Pick<UnifiedPassageRow, 'kind' | 'id' | 'isGroup' | 'levels'>,
  level: UnifiedDifficulty,
): { kind: 'ai' | 'external'; id: string; levelLabel: string | null } {
  if (row.kind === 'ai') return { kind: 'ai', id: row.id, levelLabel: null }
  if (!row.isGroup || row.levels.length === 0) return { kind: 'external', id: row.id, levelLabel: null }
  const best = [...row.levels].sort((a, b) => levelRank(a.difficulty, level) - levelRank(b.difficulty, level))[0]
  return { kind: 'external', id: best.passageId, levelLabel: best.label }
}

// ── 100점 만점 자동 배점 ──
// n 문항에 total 점을 정수로 나누고, 남는 점수는 앞쪽 문항부터 1점씩 더한다 (39문항 → 3점 22개 + 2점 17개 = 100).
// 문항이 total 보다 많으면 1점씩도 줄 수 없으므로 null.
export const MIXED_TOTAL_POINTS = 100
export function allocatePoints(n: number, total: number = MIXED_TOTAL_POINTS): number[] | null {
  if (!Number.isInteger(n) || n < 1 || n > total) return null
  const base = Math.floor(total / n)
  const extra = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0))
}

// 화면 안내: "3점 × 22문항 + 2점 × 17문항 = 100점"
export function pointsSummary(points: readonly number[]): string {
  if (points.length === 0) return ''
  const groups: { p: number; n: number }[] = []
  for (const p of points) {
    const g = groups.find((x) => x.p === p)
    if (g) g.n++
    else groups.push({ p, n: 1 })
  }
  const sum = points.reduce((s, p) => s + p, 0)
  return `${groups.sort((a, b) => b.p - a.p).map((g) => `${g.p}점 × ${g.n}문항`).join(' + ')} = ${sum}점`
}
