import type { PassageEssay } from '../types/passageBank'

// 단위를 명시한 새 영어 자료는 단어 수. 단위 없는 기존 자료는 원래 글자 수 표시를 보존한다.
export function passageEssayLimit(
  essay: Pick<PassageEssay, 'wordLimit' | 'wordLimitUnit'>,
  legacySuffix: '내외' | '이내' = '내외',
): string {
  if (!essay.wordLimit) return ''
  return essay.wordLimitUnit === 'words'
    ? `${essay.wordLimit}단어 이내`
    : `${essay.wordLimit}자 ${legacySuffix}`
}
