// 태그 표시용 공통 헬퍼
// 나중에 새 태그 유형이 실제로 쓰이게 되면 아래 값들이 이미 준비되어 있습니다.

export const TYPE_LABEL: Record<string, string> = {
  vocab: '어휘',
  grammar: '어법',
  reading: '독해',
  written: '서술형',
  blank: '빈칸',
}

export const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
}

// 지문 안 하이라이트용 배경색 (형광펜 느낌)
export const TYPE_HIGHLIGHT_CLASS: Record<string, string> = {
  vocab: 'bg-yellow-200',
  grammar: 'bg-blue-200',
  reading: 'bg-purple-200',
  written: 'bg-green-200',
  blank: 'bg-orange-100 border border-orange-300',
}

// 배지(태그 알약 모양)용 색상
export const TYPE_BADGE_CLASS: Record<string, string> = {
  vocab: 'bg-yellow-100 text-yellow-800',
  grammar: 'bg-blue-100 text-blue-800',
  reading: 'bg-purple-100 text-purple-800',
  written: 'bg-green-100 text-green-800',
  blank: 'bg-orange-100 text-orange-800',
}

export const DIFFICULTY_BADGE_CLASS: Record<string, string> = {
  beginner: 'bg-gray-100 text-gray-600',
  intermediate: 'bg-indigo-100 text-indigo-700',
  advanced: 'bg-rose-100 text-rose-700',
}

export function getTypeLabel(type: string): string {
  return TYPE_LABEL[type] || type
}

export function getDifficultyLabel(difficulty: string): string {
  return DIFFICULTY_LABEL[difficulty] || difficulty
}

export function getTypeHighlightClass(type: string): string {
  return TYPE_HIGHLIGHT_CLASS[type] || 'bg-gray-200'
}

export function getTypeBadgeClass(type: string): string {
  return TYPE_BADGE_CLASS[type] || 'bg-gray-100 text-gray-600'
}

export function getDifficultyBadgeClass(difficulty: string): string {
  return DIFFICULTY_BADGE_CLASS[difficulty] || 'bg-gray-100 text-gray-600'
}

// 문제 세트 하나의 통계 계산 (문제은행 목록/상세에서 공통 사용)
export interface SetQuestionLike {
  type: string
  difficulty: string
}

export interface SetStats {
  total: number
  countByType: Record<string, number>
  dominantDifficulty: string | null
}

export function computeSetStats(questions: SetQuestionLike[] | undefined | null): SetStats {
  const list = questions || []
  const countByType: Record<string, number> = {}
  const countByDifficulty: Record<string, number> = {}

  for (const q of list) {
    countByType[q.type] = (countByType[q.type] || 0) + 1
    countByDifficulty[q.difficulty] = (countByDifficulty[q.difficulty] || 0) + 1
  }

  let dominantDifficulty: string | null = null
  let maxCount = 0
  for (const [level, count] of Object.entries(countByDifficulty)) {
    if (count > maxCount) {
      maxCount = count
      dominantDifficulty = level
    }
  }

  return { total: list.length, countByType, dominantDifficulty }
}

// 상세 태그(detailTags) 객체를 화면에 뿌릴 수 있는 문자열 배열로 변환
// 값이 있는 필드만 순서대로 뽑아서 반환합니다. (예전 데이터처럼 없으면 빈 배열)
export interface DetailTagsLike {
  partOfSpeech?: string
  grammarPoint?: string
  vocabPoint?: string
  readingPoint?: string
  thinkingType?: string
  answerFormat?: string
  answerLanguage?: string
}

export function flattenDetailTags(tags: DetailTagsLike | undefined | null): string[] {
  if (!tags) return []
  return [
    tags.partOfSpeech,
    tags.grammarPoint,
    tags.vocabPoint,
    tags.readingPoint,
    tags.thinkingType,
    tags.answerFormat,
    tags.answerLanguage,
  ].filter((v): v is string => Boolean(v && v.trim()))
}