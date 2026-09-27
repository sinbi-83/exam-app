// 단어은행 난이도 영점 보정(calibration) v1 규칙.
//
// - 1~100 척도의 양 끝(Floor 1~10 / Ceiling 80+)과 가운데(중1 seed)를 같은 화면에서 비교하기 위한 구간 정의.
// - "조금 쉽게 / 조금 어렵게" 이동폭, 검수 판단 이유, anchor 출처 식별값.
// - 중1 Cut(config/vocabularyLevels.ts)은 여기서 바꾸지 않는다. 검수 결과를 보고 사람이 결정한다.
//
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

import type { VocabularyEntryRecord } from '../types/vocabulary'

// 조금 쉽게 / 조금 어렵게 한 번에 움직이는 폭 (나중에 여기만 바꾸면 된다)
export const DIFFICULTY_NUDGE_STEP = 5

// 1~100 을 벗어나지 않게 이동
export function nudgeDifficulty(current: number, delta: number): number {
  return Math.min(100, Math.max(1, current + delta))
}

// 비교용 구간 (canonical 어휘에 "초등/고3" 값을 저장하지 않는다 — 난이도 숫자로만 나눈다)
export type CalibrationZone = 'floor' | 'middle' | 'ceiling'
export const FLOOR_MAX = 10
export const CEILING_MIN = 80

export const CALIBRATION_ZONE_LABELS: Record<CalibrationZone, string> = {
  floor: `Floor 1~${FLOOR_MAX}`,
  middle: `중간 ${FLOOR_MAX + 1}~${CEILING_MIN - 1}`,
  ceiling: `Ceiling ${CEILING_MIN}+`,
}

export const CALIBRATION_ZONE_RANGES: Record<CalibrationZone, { min: number; max: number }> = {
  floor: { min: 1, max: FLOOR_MAX },
  middle: { min: FLOOR_MAX + 1, max: CEILING_MIN - 1 },
  ceiling: { min: CEILING_MIN, max: 100 },
}

export function calibrationZone(difficulty: number | null): CalibrationZone | null {
  if (difficulty === null) return null
  if (difficulty <= FLOOR_MAX) return 'floor'
  if (difficulty >= CEILING_MIN) return 'ceiling'
  return 'middle'
}

export function isTeacherReviewed(entry: Pick<VocabularyEntryRecord, 'teacher_reviewed_at'>): boolean {
  return entry.teacher_reviewed_at !== null
}

// ── 출처 식별값 (vocabulary_sources.source_type='teacher' + source_ref) ──
// 공식어휘가 아니다. 새 source_type 을 만들지 않고 source_ref 로 구분한다.
export const SEED_SOURCE_REFS = {
  middle: 'bostons-teacher-seed-v1', // 중1 기능검증 seed 60개
  floor: 'bostons-calibration-floor-v1', // BostonS calibration anchor (Floor)
  ceiling: 'bostons-calibration-ceiling-v1', // BostonS calibration anchor (Ceiling)
} as const

export const SOURCE_REF_LABELS: Record<string, string> = {
  [SEED_SOURCE_REFS.middle]: 'BostonS seed (중1 기능검증)',
  [SEED_SOURCE_REFS.floor]: 'Calibration anchor · Floor',
  [SEED_SOURCE_REFS.ceiling]: 'Calibration anchor · Ceiling',
}

// ── 검수 판단 이유 (가벼운 메모. 완전한 이력 시스템이 아니다) ──
// 새 칸을 만들지 않고 vocabulary_sources 에 created_by='teacher' 인 "검수 메모" 행으로 남긴다 (추가만, 수정 없음).
export const REVIEW_NOTE_REF_PREFIX = 'teacher-review:'

export const REVIEW_REASON_LABELS = {
  too_easy: '너무 쉬움',
  too_hard: '너무 어려움',
  meaning_fixed: '뜻 수정',
  ko_en_unfit: '한→영 부적합',
  polysemy: '다의어 문제',
  low_value: '시험 가치 낮음',
  out_of_scope: '교육 범위 밖',
  other: '기타',
} as const
export type ReviewReason = keyof typeof REVIEW_REASON_LABELS

export function isReviewNoteRef(sourceRef: string): boolean {
  return sourceRef.startsWith(REVIEW_NOTE_REF_PREFIX)
}

// 검수 메모 한 줄: "너무 쉬움 · 메모" (둘 다 없으면 null → 메모 행을 만들지 않는다)
export function reviewNoteText(reason: string | null | undefined, memo: string | null | undefined): string | null {
  const label = reason && reason in REVIEW_REASON_LABELS ? REVIEW_REASON_LABELS[reason as ReviewReason] : null
  const m = memo?.trim() || null
  if (!label && !m) return null
  return [label, m].filter(Boolean).join(' · ')
}

// 검수 모드 "다음 단어": 지금 목록에서 현재 항목 뒤쪽의 첫 미검수 항목, 없으면 앞쪽에서 찾는다. 없으면 null.
export function nextUnreviewedId<T extends { id: string; teacher_reviewed_at: string | null }>(
  list: T[],
  currentId: string,
): string | null {
  const idx = list.findIndex((e) => e.id === currentId)
  const ordered = idx === -1 ? list : [...list.slice(idx + 1), ...list.slice(0, idx)]
  return ordered.find((e) => e.id !== currentId && e.teacher_reviewed_at === null)?.id ?? null
}
