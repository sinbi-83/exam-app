// "초6", "중1", "고2" 같은 학년 표기를 학교급으로 나누고, 학교급별 배지 색을 정해준다.
// 화면 표시 전용 유틸리티. DB 값이나 저장 로직에는 영향이 없다.

export type SchoolStage = '초등' | '중등' | '고등' | null

export function schoolStageOf(level: string | null | undefined): SchoolStage {
  if (!level) return null
  if (level.startsWith('초')) return '초등'
  if (level.startsWith('중')) return '중등'
  if (level.startsWith('고')) return '고등'
  return null
}

// 학교급별 배지 색 (Tailwind 클래스). 색만으로 구분하지 않도록 항상 글자(학년 텍스트)와 함께 쓴다.
export function schoolStageBadgeClass(level: string | null | undefined): string {
  switch (schoolStageOf(level)) {
    case '초등':
      return 'bg-blue-50 text-blue-700 border-blue-100'
    case '중등':
      return 'bg-purple-50 text-purple-700 border-purple-100'
    case '고등':
      return 'bg-orange-50 text-orange-700 border-orange-100'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}
