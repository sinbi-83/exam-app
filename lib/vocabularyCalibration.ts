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

// 화면 이름 (한글). 내부 값 floor / middle / ceiling 은 그대로 둔다.
export const CALIBRATION_ZONE_LABELS: Record<CalibrationZone, string> = {
  floor: `하한 기준 1~${FLOOR_MAX}`,
  middle: `중간 ${FLOOR_MAX + 1}~${CEILING_MIN - 1}`,
  ceiling: `상한 기준 ${CEILING_MIN}+`,
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

// ── "교사가 수정함" 과 "검수 완료" 는 다르다 ──
// - teacher_reviewed_at: 교사가 값을 한 번이라도 저장한 시각 → 교사값 보호용 (seed/import 가 덮어쓰지 않음)
// - 검수 완료: "현재 기준 맞음" 또는 "검수 완료 → 다음" 을 실제로 누른 항목만.
//   새 DB 칸 없이 vocabulary_sources 에 source_ref='teacher-review:<시각>' 행이 있는지로 판단한다.
type SourceRefOnly = { source_ref: string }

export function isCalibrationReviewed(entry: { vocabulary_sources?: SourceRefOnly[] }): boolean {
  return (entry.vocabulary_sources ?? []).some((s) => s.source_ref.startsWith(REVIEW_DONE_REF_PREFIX))
}

// 화면 표시용 3단계
export type ReviewState = 'reviewed' | 'edited' | 'unreviewed'
export function reviewState(entry: Pick<VocabularyEntryRecord, 'teacher_reviewed_at'> & { vocabulary_sources?: SourceRefOnly[] }): ReviewState {
  if (isCalibrationReviewed(entry)) return 'reviewed'
  return entry.teacher_reviewed_at !== null ? 'edited' : 'unreviewed'
}
export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  reviewed: '교사 검수 완료',
  edited: '교사 수정함 (검수 전)',
  unreviewed: '교사 미확인',
}

// ── 출처 식별값 (vocabulary_sources.source_type='teacher' + source_ref) ──
// 공식어휘가 아니다. 새 source_type 을 만들지 않고 source_ref 로 구분한다.
export const SEED_SOURCE_REFS = {
  middle: 'bostons-teacher-seed-v1', // 중1 기능검증 seed 60개
  floor: 'bostons-calibration-floor-v1', // BostonS calibration anchor (Floor)
  ceiling: 'bostons-calibration-ceiling-v1', // BostonS calibration anchor (Ceiling)
} as const

// 화면 이름 (한글). source_ref 값 자체는 DB 에 저장된 식별값이라 바꾸지 않는다.
export const SOURCE_REF_LABELS: Record<string, string> = {
  [SEED_SOURCE_REFS.middle]: '보스턴S 기초 단어 (중1 기능검증)',
  [SEED_SOURCE_REFS.floor]: '난이도 기준점 · 하한',
  [SEED_SOURCE_REFS.ceiling]: '난이도 기준점 · 상한',
}

// Calibration anchor 출처만 가진 항목 = 난이도 자 검수용 기준 데이터 → 일반 /vocab-test 자동생성 후보가 아니다.
// 같은 항목에 공식·실제 BostonS 자료 등 다른 출처가 추가되면 그때부터 일반 출제 후보가 된다.
// (검수 메모 행은 출처가 아니므로 판단에서 뺀다. 출처가 하나도 없는 항목은 일반 항목으로 본다.)
export const CALIBRATION_SOURCE_REF_PREFIX = 'bostons-calibration-'

export function isCalibrationOnly(entry: { vocabulary_sources?: SourceRefOnly[] }): boolean {
  const refs = countableSources(entry.vocabulary_sources)
  return refs.length > 0 && refs.every((s) => s.source_ref.startsWith(CALIBRATION_SOURCE_REF_PREFIX))
}

// 일반 자동 단어시험 후보 (Calibration 검수용 시험은 이 필터를 쓰지 않는다)
export function generalTestCandidates<T extends { vocabulary_sources?: SourceRefOnly[] }>(entries: T[]): T[] {
  return entries.filter((e) => !isCalibrationOnly(e))
}

// ── 검수 기록 / 판단 이유 (가벼운 메모. 완전한 이력 시스템이 아니다) ──
// 새 칸을 만들지 않고 vocabulary_sources 에 created_by='teacher' 행으로 추가만 한다 (수정 없음).
//  - teacher-review:<시각>  = 검수 완료 기록 ("현재 기준 맞음" / "검수 완료 → 다음"). 이유가 없어도 남긴다.
//  - teacher-note:<시각>    = 검수 완료 없이 "수정만 저장" 할 때 남긴 판단 이유
export const REVIEW_DONE_REF_PREFIX = 'teacher-review:'
export const REVIEW_NOTE_ONLY_REF_PREFIX = 'teacher-note:'
//  - teacher-note:owner-approval:<시각> = 소유자(향미 선생님) 명시 승인 기록 (예: 1단계 상태 바로잡기). 검수 완료로 세지 않는다
//    일부러 'teacher-note:' 로 시작한다 → 이 규칙을 모르는 예전 배포 코드도 이 행을 출처가 아닌 메모로 보고
//    출처 표시·기준점(anchor) 판단에서 뺀다. (새 접두어였다면 예전 코드에서 기준점 단어가 일반 시험 후보로 새어 나간다)
export const OWNER_APPROVAL_REF_PREFIX = `${REVIEW_NOTE_ONLY_REF_PREFIX}owner-approval:`

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

// 검수·승인 기록 행인지 (출처가 아니다 → 출처 표시·출처 수·anchor 판단에서 제외)
// 소유자 승인 기록(OWNER_APPROVAL_REF_PREFIX)도 teacher-note: 로 시작하므로 여기에 포함된다.
export function isReviewNoteRef(sourceRef: string): boolean {
  return sourceRef.startsWith(REVIEW_DONE_REF_PREFIX) || sourceRef.startsWith(REVIEW_NOTE_ONLY_REF_PREFIX)
}

// 실제 출처만 (검수·승인 기록 행 제외). 출처 수·공식 출처 판정·출처 표시는 모두 이 목록으로 센다.
export function countableSources<T extends SourceRefOnly>(sources: T[] | undefined): T[] {
  return (sources ?? []).filter((s) => !isReviewNoteRef(s.source_ref))
}

// 검수 메모 한 줄: "너무 쉬움 · 메모" (둘 다 없으면 null → 메모 행을 만들지 않는다)
export function reviewNoteText(reason: string | null | undefined, memo: string | null | undefined): string | null {
  const label = reason && reason in REVIEW_REASON_LABELS ? REVIEW_REASON_LABELS[reason as ReviewReason] : null
  const m = memo?.trim() || null
  if (!label && !m) return null
  return [label, m].filter(Boolean).join(' · ')
}

// 검수 모드 "다음 단어": 지금 목록에서 현재 항목 뒤쪽의 첫 미검수(검수 완료 기록 없음) 항목, 없으면 앞쪽. 없으면 null.
export function nextUnreviewedId<T extends { id: string; vocabulary_sources?: SourceRefOnly[] }>(
  list: T[],
  currentId: string,
): string | null {
  const idx = list.findIndex((e) => e.id === currentId)
  const ordered = idx === -1 ? list : [...list.slice(idx + 1), ...list.slice(0, idx)]
  return ordered.find((e) => e.id !== currentId && !isCalibrationReviewed(e))?.id ?? null
}
