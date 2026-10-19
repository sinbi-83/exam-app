// scripts 에서 지문 단어장(passage_wordbooks) 저장 — 지문 저장 스크립트(add-passage, add-passage-set-questions)가 함께 쓴다.
// 화면에서 선생님이 고쳐 저장한 단어장은 replace 가 아니면 건드리지 않는다.
// 이 파일은 런타임 import 를 lib/wordbook.ts 하나만 한다 (scripts 에서 그대로 쓰기 위해).

import { cleanWordbookWords } from './wordbook.ts'
import type { WordbookWord } from '../types/wordbook'

export type WordbookSaveResult =
  | { kind: 'saved'; count: number; replaced: boolean }
  | { kind: 'kept_existing' } // 이미 저장된 단어장이 있어 그대로 둠
  | { kind: 'table_missing' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }

const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || (e.message ?? '').includes('passage_wordbooks'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveWordbookFromScript(supabase: any, userId: string, passageId: string, rawWords: readonly Partial<WordbookWord>[], replace: boolean): Promise<WordbookSaveResult> {
  const words = cleanWordbookWords(rawWords)
  if (words.length === 0) return { kind: 'empty' }
  const { data: existing, error: readError } = await supabase
    .from('passage_wordbooks')
    .select('id')
    .eq('user_id', userId)
    .eq('passage_id', passageId)
    .maybeSingle()
  if (isMissingTable(readError)) return { kind: 'table_missing' }
  if (readError) return { kind: 'error', message: readError.message }
  if (existing && !replace) return { kind: 'kept_existing' }
  const { error } = await supabase
    .from('passage_wordbooks')
    .upsert({ user_id: userId, passage_id: passageId, words, updated_at: new Date().toISOString() }, { onConflict: 'user_id,passage_id' })
  if (isMissingTable(error)) return { kind: 'table_missing' }
  if (error) return { kind: 'error', message: error.message }
  return { kind: 'saved', count: words.length, replaced: !!existing }
}

export function wordbookSaveMessage(label: string, r: WordbookSaveResult): string {
  switch (r.kind) {
    case 'saved': return `📗 ${label} 단어장 ${r.count}단어 저장${r.replaced ? ' (기존 단어장 바꿔 씀)' : ''}`
    case 'kept_existing': return `📗 ${label} 이미 저장된 단어장이 있어 그대로 둠 (바꿔 쓰려면 --replace-wordbook)`
    case 'table_missing': return `⚠️ ${label} 단어장 표(passage_wordbooks)가 없어 단어장은 저장 못 함 — passage-wordbooks-migration.sql 실행 후 같은 명령에 --wordbook-only`
    case 'empty': return `⚠️ ${label} 단어장이 비어 있어 저장하지 않음`
    case 'error': return `❌ ${label} 단어장 저장 실패: ${r.message}`
  }
}
