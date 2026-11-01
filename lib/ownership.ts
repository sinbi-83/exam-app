// 받은 ID 가 로그인한 선생님 것인지 확인한다 (lib/examOwnership.ts 와 같은 방식).
// RLS 는 행의 user_id 만 보므로, student_id·question_set_id 처럼 다른 표를 가리키는 값은 API 에서 저장 전에 확인해야 한다.
// 없는 것, 남의 것, 형식이 잘못된 값(22P02)은 구별하지 않고 모두 403 (남의 ID 가 있는지 알려 주지 않는다).
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

import type { SupabaseClient } from '@supabase/supabase-js'

export type Ownership = { ok: true } | { ok: false; status: 403 | 500; error: string }

const IN_CHUNK = 100 // URL 길이 제한 때문에 .in() 에 한 번에 너무 많이 넣지 않는다

export async function checkOwnedIds(
  supabase: SupabaseClient,
  table: string,
  ids: unknown[],
  userId: string,
  notMine: string,
): Promise<Ownership> {
  if (ids.some((id) => typeof id !== 'string' || !id)) return { ok: false, status: 403, error: notMine }
  const wanted = [...new Set(ids as string[])]
  const found = new Set<string>()
  for (let i = 0; i < wanted.length; i += IN_CHUNK) {
    const { data, error } = await supabase.from(table).select('id').eq('user_id', userId).in('id', wanted.slice(i, i + IN_CHUNK))
    if (error && error.code === '22P02') return { ok: false, status: 403, error: notMine }
    if (error) return { ok: false, status: 500, error: error.message }
    for (const row of (data ?? []) as { id: string }[]) found.add(row.id)
  }
  return found.size === wanted.length ? { ok: true } : { ok: false, status: 403, error: notMine }
}

export function checkStudentsOwnership(supabase: SupabaseClient, studentIds: unknown[], userId: string): Promise<Ownership> {
  return checkOwnedIds(supabase, 'students', studentIds, userId, '내 학생이 아닙니다.')
}

export function checkStudentOwnership(supabase: SupabaseClient, studentId: unknown, userId: string): Promise<Ownership> {
  return checkStudentsOwnership(supabase, [studentId], userId)
}

export function checkQuestionSetOwnership(supabase: SupabaseClient, questionSetId: unknown, userId: string): Promise<Ownership> {
  return checkOwnedIds(supabase, 'question_sets', [questionSetId], userId, '내 문제 세트가 아닙니다.')
}

export function checkVocabularyEntriesOwnership(supabase: SupabaseClient, entryIds: unknown[], userId: string): Promise<Ownership> {
  return checkOwnedIds(supabase, 'vocabulary_entries', entryIds, userId, '내 단어은행의 단어가 아닙니다.')
}
