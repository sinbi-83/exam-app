import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { selectAllPages } from '@/lib/supabasePaging'
import { GRAMMAR_QUESTION_TYPES, isGrammarLeak } from '@/lib/grammarLeak'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('question_sets')
    .select('id, grade, topic, created_at, questions')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 세트별 "정답 노출 의심" 어법 문항 수 (문제은행 questions 기준, 읽기만 — lib/grammarLeak.ts)
  const { data: grammarRows } = await selectAllPages<{ question_set_id: string | null; question_type: string; question_text: string; choices: string[] | null; correct_answer: string | null }>(
    (from, to) =>
      supabase
        .from('questions')
        .select('id, question_set_id, question_type, question_text, choices, correct_answer')
        .eq('user_id', user.id)
        .in('question_type', [...GRAMMAR_QUESTION_TYPES])
        .order('id')
        .range(from, to),
  )
  const leakBySet = new Map<string, number>()
  for (const q of grammarRows) {
    if (q.question_set_id && isGrammarLeak(q)) leakBySet.set(q.question_set_id, (leakBySet.get(q.question_set_id) ?? 0) + 1)
  }

  return NextResponse.json({ data: (data ?? []).map((s) => ({ ...s, grammar_leak_count: leakBySet.get(s.id) ?? 0 })) })
}