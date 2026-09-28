// 단어은행 난이도 자(1~100)와 학년 × 레벨 × 출제방향 → 난이도 범위 변환표.
//
// 어휘에는 "중1 상위학원형" 같은 값을 저장하지 않고 base_difficulty(1~100) 하나만 둔다.
// 1~100 은 학년과 무관한 "절대 난이도"다 (설계도 C-2). 실제 출제 범위는 아래 표로 정한다
// → 기준을 바꿀 때 수천 개 단어를 고치지 않고 이 표만 고친다.
//
// ⚠️ 기준점과 범위표는 모두 "향미 선생님 승인 전 초안"이다 (3단계, 2026-09-28).
//    표에 없는 학년은 findDifficultyBand 가 null → 자동시험·학년 범위 필터가 "기준 미설정"으로 멈춘다 (임의 범위로 출제 금지).
//    기존 101개 단어의 난이도는 예전 중1 기준으로 매긴 값이다. 새 자에 맞춘 값은 제안표(docs/stage3-reanchor-proposal.md)로만 두고,
//    선생님 확인 후 적용한다. 적용 전에는 이 표와 단어 값의 기준이 다르다는 점에 주의.

import type { PassageVariantLevel } from '@/types/passageBank'
import type { VocabularyDirection } from '@/types/vocabulary'

// 학년 표기는 passages.level 과 같다 ("초6", "중1" …)
export const VOCABULARY_GRADES = ['초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3'] as const
export type VocabularyGrade = (typeof VOCABULARY_GRADES)[number]

export const VOCABULARY_DIRECTION_LABELS: Record<VocabularyDirection, string> = {
  en_ko: '영→한',
  ko_en: '한→영',
}

// ── 절대 난이도 자의 기준점 (설계도 C-2 앵커 초안) ──
// 구간이 서로 겹친다 (학년 경계가 칼로 자르듯 나뉘지 않으므로).
export interface DifficultyAnchor {
  label: string // 화면 이름
  min: number
  max: number
}

export const DIFFICULTY_ANCHORS: readonly DifficultyAnchor[] = [
  { label: '초3~4', min: 1, max: 15 },
  { label: '초5~6', min: 10, max: 30 },
  { label: '중1~2', min: 25, max: 50 },
  { label: '중3', min: 40, max: 65 },
  { label: '고1~2', min: 55, max: 80 },
  { label: '고3·고난도', min: 75, max: 100 },
]

export const DIFFICULTY_ANCHORS_PROVISIONAL = true

// 이 난이도가 들어가는 기준점 이름들 (겹치면 모두): 42 → ['중1~2', '중3']
export function anchorLabels(difficulty: number | null, anchors: readonly DifficultyAnchor[] = DIFFICULTY_ANCHORS): string[] {
  if (difficulty === null) return []
  return anchors.filter((a) => difficulty >= a.min && difficulty <= a.max).map((a) => a.label)
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
export const VOCABULARY_BANDS_NOTE = '초5·중1·중3 초안 (향미 선생님 승인 전)'

// 학년별 레벨 범위 (1차 대상: 초5, 중1, 중3). 만든 원칙:
//   학교형   = 이전 학년 기준점 윗부분 ~ 이 학년 기준점 앞부분 (복습 + 교과서 수준)
//   일반학원형 = 이 학년 기준점 앞 ~ 가운데
//   상위학원형 = 이 학년 기준점 전체
//   선행형   = 이 학년 기준점 뒷부분 ~ 다음 학년 기준점 앞부분
// 한→영은 같은 범위 + 어휘별 ko_en_difficulty 예외값으로 조정한다.
const LEVEL_RANGES: { grade: VocabularyGrade; ranges: Record<PassageVariantLevel, [number, number]> }[] = [
  // 초5: 이전 초3~4(1~15) / 이 학년 초5~6(10~30) / 다음 중1~2(25~50)
  { grade: '초5', ranges: { school: [1, 20], academy: [8, 25], advanced: [10, 30], prestudy: [22, 40] } },
  // 중1: 이전 초5~6(10~30) / 이 학년 중1~2(25~50) / 다음 중3(40~65)
  { grade: '중1', ranges: { school: [15, 35], academy: [22, 42], advanced: [25, 50], prestudy: [38, 58] } },
  // 중3: 이전 중1~2(25~50) / 이 학년 중3(40~65) / 다음 고1~2(55~80)
  { grade: '중3', ranges: { school: [30, 50], academy: [38, 58], advanced: [40, 65], prestudy: [52, 72] } },
]

const LEVEL_ORDER: readonly PassageVariantLevel[] = ['school', 'academy', 'advanced', 'prestudy']

export const VOCABULARY_DIFFICULTY_BANDS: readonly DifficultyBand[] = LEVEL_RANGES.flatMap(({ grade, ranges }) =>
  LEVEL_ORDER.flatMap((level) =>
    (['en_ko', 'ko_en'] as const).map((direction) => ({ grade, level, direction, min: ranges[level][0], max: ranges[level][1] })),
  ),
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
