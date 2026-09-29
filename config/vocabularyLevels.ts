// 단어은행 난이도 자(1~100)와 학년 × 레벨 × 출제방향 → 난이도 범위 변환표.
//
// 어휘에는 "중1 상위학원형" 같은 값을 저장하지 않고 base_difficulty(1~100) 하나만 둔다.
// 1~100 은 학년과 무관한 "절대 난이도"다 (설계도 C-2). 실제 출제 범위는 아래 표로 정한다
// → 기준을 바꿀 때 수천 개 단어를 고치지 않고 이 표만 고친다.
//
// ⚠️ 기준점은 "향미 선생님 승인 전 초안"이다 (3단계, 2026-09-28).
//    범위표: 초5·중1·중3 은 승인됨. 초3·초4·초6·중2·고1·고2·고3 은 승인 전 초안 (2026-09-29, docs/grade-ranges-proposal.md).
//    표에 없는 학년은 findDifficultyBand 가 null → 자동시험·학년 범위 필터가 "기준 미설정"으로 멈춘다 (임의 범위로 출제 금지).
//    기존 101개 단어의 난이도는 2026-09-28 에 새 자로 재조정됐다 (docs/stage3-reanchor-proposal.csv, 소유자 승인).

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
export const VOCABULARY_BANDS_NOTE = '초5·중1·중3 승인 · 나머지 학년은 향미 선생님 승인 전 초안'

// 승인 전 초안 범위표 학년 (화면에 "승인 전 초안"으로 표시). 승인되면 여기서 빼기만 하면 된다.
export const DRAFT_BAND_GRADES: readonly VocabularyGrade[] = ['초3', '초4', '초6', '중2', '고1', '고2', '고3']
export const DRAFT_BAND_LABEL = '향미 선생님 승인 전 초안'
export function isDraftBandGrade(grade: VocabularyGrade): boolean {
  return DRAFT_BAND_GRADES.includes(grade)
}

// 학년별 레벨 범위. 초5·중1·중3 은 승인값 (바꾸지 않는다). 만든 원칙:
//   학교형   = 이전 학년 기준점 윗부분 ~ 이 학년 기준점 앞부분 (복습 + 교과서 수준)
//   일반학원형 = 이 학년 기준점 앞 ~ 가운데
//   상위학원형 = 이 학년 기준점 전체
//   선행형   = 이 학년 기준점 뒷부분 ~ 다음 학년 기준점 앞부분
// 한→영은 같은 범위 + 어휘별 ko_en_difficulty 예외값으로 조정한다.
// 초안 학년(DRAFT_BAND_GRADES)은 승인된 세 학년의 간격 패턴을 따른다 (docs/grade-ranges-proposal.md):
//   학교형 ≈ [기준점 하한 − 10, 하한 + 10], 일반학원형 ≈ [하한 − 2, 상한 − 7], 상위학원형 = 기준점 전체,
//   선행형 ≈ [다음 기준점 하한 − 3, 다음 상한 − 8]. 같은 기준점을 쓰는 둘째 학년(초4·초6·중2·고2)은 첫 학년 +5.
const LEVEL_RANGES: { grade: VocabularyGrade; ranges: Record<PassageVariantLevel, [number, number]> }[] = [
  // 초5: 이전 초3~4(1~15) / 이 학년 초5~6(10~30) / 다음 중1~2(25~50)
  // 초3 (초안): 이 학년 초3~4(1~15) / 다음 초5~6(10~30). 기준점 폭이 좁아 학교형·일반학원형은 손으로 좁힘
  { grade: '초3', ranges: { school: [1, 8], academy: [1, 12], advanced: [1, 15], prestudy: [7, 22] } },
  // 초4 (초안): 초3 +5 (학교형 하한은 1 유지 — 가장 쉬운 단어 복습)
  { grade: '초4', ranges: { school: [1, 13], academy: [6, 17], advanced: [6, 20], prestudy: [12, 27] } },
  { grade: '초5', ranges: { school: [1, 20], academy: [8, 25], advanced: [10, 30], prestudy: [22, 40] } },
  // 초6 (초안): 초5 +5
  { grade: '초6', ranges: { school: [6, 25], academy: [13, 30], advanced: [15, 35], prestudy: [27, 45] } },
  // 중1: 이전 초5~6(10~30) / 이 학년 중1~2(25~50) / 다음 중3(40~65)
  { grade: '중1', ranges: { school: [15, 35], academy: [22, 42], advanced: [25, 50], prestudy: [38, 58] } },
  // 중2 (초안): 중1 +5
  { grade: '중2', ranges: { school: [20, 40], academy: [27, 47], advanced: [30, 55], prestudy: [43, 63] } },
  // 중3: 이전 중1~2(25~50) / 이 학년 중3(40~65) / 다음 고1~2(55~80)
  { grade: '중3', ranges: { school: [30, 50], academy: [38, 58], advanced: [40, 65], prestudy: [52, 72] } },
  // 고1 (초안): 이전 중3(40~65) / 이 학년 고1~2(55~80) / 다음 고3(75~100)
  { grade: '고1', ranges: { school: [45, 65], academy: [53, 73], advanced: [55, 80], prestudy: [72, 92] } },
  // 고2 (초안): 고1 +5
  { grade: '고2', ranges: { school: [50, 70], academy: [58, 78], advanced: [60, 85], prestudy: [77, 97] } },
  // 고3 (초안): 이전 고1~2(55~80) / 이 학년 고3(75~100) / 다음 없음 → 선행형은 최상단 85~100
  { grade: '고3', ranges: { school: [65, 85], academy: [73, 93], advanced: [75, 100], prestudy: [85, 100] } },
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
