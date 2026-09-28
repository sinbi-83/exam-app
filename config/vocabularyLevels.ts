// 단어은행 학년 × 레벨 × 출제방향 → 기본 난이도(1~100) 범위 변환표.
//
// 어휘에는 "중1 상위학원형" 같은 값을 저장하지 않고 base_difficulty(1~100) 하나만 둔다.
// 실제 출제 범위는 이 표로 정한다 → 기준을 바꿀 때 수천 개 단어를 고치지 않고 이 표만 고친다.
//
// ⚠️ 현재 값은 "중1 한 학년만, 향미 선생님 검수 전 임시 기준"이다 (단어시험 기능 검증용, 2026-09-27).
//    다른 학년은 표에 없다 → findDifficultyBand 가 null 을 돌려주고, 자동시험은 "기준 미설정"으로 멈춘다 (임의 범위로 출제 금지).
//    검수 후 min/max 만 고치면 된다 (어휘 난이도 값은 그대로).

import type { PassageVariantLevel } from '@/types/passageBank'
import type { VocabularyDirection } from '@/types/vocabulary'

// 학년 표기는 passages.level 과 같다 ("초6", "중1" …)
export const VOCABULARY_GRADES = ['초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3'] as const
export type VocabularyGrade = (typeof VOCABULARY_GRADES)[number]

export const VOCABULARY_DIRECTION_LABELS: Record<VocabularyDirection, string> = {
  en_ko: '영→한',
  ko_en: '한→영',
}

export interface DifficultyBand {
  grade: VocabularyGrade
  level: PassageVariantLevel // 학교형 / 일반학원형 / 상위학원형 / 선행형 (외부지문 4단계와 같은 값)
  direction: VocabularyDirection
  min: number // 1~100, 포함
  max: number // 1~100, 포함
}

// 임시 기준이라는 표시 (화면에 그대로 보여준다)
export const VOCABULARY_BANDS_PROVISIONAL = true
export const VOCABULARY_BANDS_NOTE = '중1 임시 기준 (향미 선생님 검수 전)'

// 중1 임시 기준: 레벨끼리 일부 겹치게 둔다. 한→영은 같은 범위 + 어휘별 ko_en_difficulty 예외값으로 조정한다.
const G1_PROVISIONAL: { level: PassageVariantLevel; min: number; max: number }[] = [
  { level: 'school', min: 1, max: 30 },
  { level: 'academy', min: 15, max: 45 },
  { level: 'advanced', min: 30, max: 60 },
  { level: 'prestudy', min: 45, max: 75 },
]

export const VOCABULARY_DIFFICULTY_BANDS: readonly DifficultyBand[] = G1_PROVISIONAL.flatMap(({ level, min, max }) =>
  (['en_ko', 'ko_en'] as const).map((direction) => ({ grade: '중1' as const, level, direction, min, max })),
)

// 기준표가 있는 학년만 (자동시험 선택지)
export function gradesWithBands(bands: readonly DifficultyBand[] = VOCABULARY_DIFFICULTY_BANDS): VocabularyGrade[] {
  return VOCABULARY_GRADES.filter((g) => bands.some((b) => b.grade === g))
}

export function findDifficultyBand(
  grade: VocabularyGrade,
  level: PassageVariantLevel,
  direction: VocabularyDirection,
  bands: readonly DifficultyBand[] = VOCABULARY_DIFFICULTY_BANDS,
): DifficultyBand | null {
  return bands.find((b) => b.grade === grade && b.level === level && b.direction === direction) ?? null
}

// 어휘 하나가 해당 방향에서 쓰는 난이도: 한→영은 예외값이 있으면 그것, 없으면 기본 난이도
export function effectiveDifficulty(
  entry: { base_difficulty: number | null; ko_en_difficulty: number | null },
  direction: VocabularyDirection,
): number | null {
  if (direction === 'ko_en' && entry.ko_en_difficulty !== null) return entry.ko_en_difficulty
  return entry.base_difficulty
}

// 화면 표시용: 숫자(63) 대신 "중1 상위학원형 수준"처럼 보여주기 위해, 이 난이도가 들어가는 구간들을 찾는다.
export function bandsContaining(
  difficulty: number,
  direction: VocabularyDirection,
  bands: readonly DifficultyBand[] = VOCABULARY_DIFFICULTY_BANDS,
): DifficultyBand[] {
  return bands.filter((b) => b.direction === direction && difficulty >= b.min && difficulty <= b.max)
}

// ── 학년 범위 필터 (설계도 C-2): 학년 범위 아래 / 안 / 위 ──
// 학년의 모든 레벨 범위를 합친 구간. 기준표가 없는 학년은 null → 화면에 "기준 미설정".
// '범위 밖'은 상태로 저장하지 않고 항상 이 함수로 그때그때 계산한다.
export function gradeDifficultyRange(
  grade: VocabularyGrade,
  direction: VocabularyDirection = 'en_ko',
  bands: readonly DifficultyBand[] = VOCABULARY_DIFFICULTY_BANDS,
): { min: number; max: number } | null {
  const list = bands.filter((b) => b.grade === grade && b.direction === direction)
  if (list.length === 0) return null
  return { min: Math.min(...list.map((b) => b.min)), max: Math.max(...list.map((b) => b.max)) }
}

export type GradeRangePosition = 'below' | 'within' | 'above'

export const GRADE_RANGE_POSITION_LABELS: Record<GradeRangePosition, string> = {
  below: '학년 범위 아래',
  within: '학년 범위 안',
  above: '학년 범위 위',
}

// 난이도가 없으면 null (어느 쪽에도 넣지 않는다)
export function gradeRangePosition(difficulty: number | null, range: { min: number; max: number }): GradeRangePosition | null {
  if (difficulty === null) return null
  if (difficulty < range.min) return 'below'
  if (difficulty > range.max) return 'above'
  return 'within'
}
