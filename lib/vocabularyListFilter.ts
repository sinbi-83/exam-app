// 단어은행 목록 필터 보조 규칙 (학년 바꿈 → 학년 범위 자동 선택, 범위별 개수, 한 줄 요약, 선택 초기화 기준).
//
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

import type { GradeRangePosition } from '../config/vocabularyLevels'

export type GradeRangeFilter = GradeRangePosition | 'all'

export const GRADE_RANGE_POSITIONS: readonly GradeRangePosition[] = ['below', 'within', 'above']

// 학년을 바꾸면 바로 그 학년 단어가 보이도록 '학년 범위 안'으로 바꾼다.
// 그 학년 기준표가 없으면 범위로 거를 수 없으므로 '전체'.
export function gradeFilterAfterGradeChange(hasGradeRange: boolean): GradeRangeFilter {
  return hasGradeRange ? 'within' : 'all'
}

// 학년 범위 아래/안/위 개수 (난이도 없는 단어는 어느 쪽에도 세지 않는다)
export function countByGradePosition<T>(
  items: readonly T[],
  positionOf: (item: T) => GradeRangePosition | null,
): Record<GradeRangePosition, number> {
  const c: Record<GradeRangePosition, number> = { below: 0, within: 0, above: 0 }
  for (const item of items) {
    const p = positionOf(item)
    if (p) c[p]++
  }
  return c
}

export interface FilterSummaryInput {
  grade: string
  hasGradeRange: boolean
  gradeRangeLabel: string | null // null = 학년 범위 '전체'
  statusLabel: string | null // null = 상태 '전체'
  reviewLabel: string | null
  zoneLabel: string | null
  search: string
  count: number
}

// 목록 위 한 줄 요약: "초5 기준 · 학년 범위 안 · 12개"
export function vocabularyFilterSummary(s: FilterSummaryInput): string {
  const parts: string[] = []
  if (!s.hasGradeRange) parts.push(`${s.grade} 기준 미설정`, '학년 범위 전체')
  else parts.push(`${s.grade} 기준`, s.gradeRangeLabel ?? '학년 범위 전체')
  if (s.statusLabel) parts.push(s.statusLabel)
  if (s.reviewLabel) parts.push(s.reviewLabel)
  if (s.zoneLabel) parts.push(`난이도 ${s.zoneLabel}`)
  const q = s.search.trim()
  if (q) parts.push(`검색 “${q}”`)
  parts.push(`${s.count}개`)
  return parts.join(' · ')
}

// 이 값이 바뀌면 체크해 둔 단어를 비운다 (안 보이는 단어가 선택된 채 일괄 사용되지 않게)
export function vocabularyFilterKey(f: {
  grade: string
  status: string
  gradeFilter: string
  review: string
  zone: string
  customMin: string
  customMax: string
  search: string
}): string {
  return JSON.stringify([f.grade, f.status, f.gradeFilter, f.review, f.zone, f.customMin, f.customMax, f.search])
}
