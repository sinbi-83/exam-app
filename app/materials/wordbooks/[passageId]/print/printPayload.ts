import type { WordbookWord } from '@/types/wordbook'

// 편집 화면 → 인쇄 탭으로 넘기는 내용 (저장 전 내용도 출력되게)
export interface WordbookPrintPayload {
  title: string
  level: string
  variant: string | null
  words: WordbookWord[]
}

export const wordbookPrintKey = (passageId: string) => `wordbook-print:${passageId}`
