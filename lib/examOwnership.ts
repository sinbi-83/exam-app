// 시험(exams)이 로그인한 선생님 것인지 확인한다.
// exam_questions 의 RLS 는 행의 user_id 만 보므로, exam_id 가 본인 시험인지는 API 에서 확인해야 한다.
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

import type { SupabaseClient } from '@supabase/supabase-js'

export type ExamOwnership = { ok: true } | { ok: false; status: 403 | 500; error: string }

// 없는 시험, 남의 시험, uuid 형식이 아닌 값(22P02)은 구별하지 않고 모두 403
export async function checkExamOwnership(supabase: SupabaseClient, examId: unknown, userId: string): Promise<ExamOwnership> {
  const { data, error } = await supabase.from('exams').select('id').eq('id', examId).eq('user_id', userId).maybeSingle()
  if (error && error.code !== '22P02') return { ok: false, status: 500, error: error.message }
  if (error || !data) return { ok: false, status: 403, error: '내 시험이 아닙니다.' }
  return { ok: true }
}
