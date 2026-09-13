import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  // 문제 세트 전체
  const { data: sets } = await supabase
    .from('question_sets')
    .select('id, created_at, questions, essay_questions, summary_questions, reading_questions')
    .eq('user_id', user.id)

  // 문항 테이블 집계
  const { data: questions } = await supabase
    .from('questions')
    .select('question_type, created_at')
    .eq('user_id', user.id)

  const totalSets = sets?.length ?? 0

  // 유형별 문항 수
  const typeCount: Record<string, number> = {}
  for (const q of questions ?? []) {
    const key = q.question_type.startsWith('essay_')
      ? '서술형'
      : q.question_type.startsWith('reading_')
      ? '독해'
      : q.question_type === 'summary'
      ? '지문요약'
      : q.question_type === 'vocab'
      ? '어휘'
      : q.question_type === 'grammar'
      ? '어법'
      : q.question_type
    typeCount[key] = (typeCount[key] ?? 0) + 1
  }

  // 월별 지문 생성 수 (최근 6개월)
  const now = new Date()
  const monthlyMap: Record<string, number> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = 0
  }
  for (const s of sets ?? []) {
    const key = s.created_at.slice(0, 7)
    if (key in monthlyMap) monthlyMap[key] = (monthlyMap[key] ?? 0) + 1
  }
  const monthly = Object.entries(monthlyMap).map(([month, count]) => ({ month, count }))

  return NextResponse.json({
    totalSets,
    totalQuestions: questions?.length ?? 0,
    typeCount,
    monthly,
  })
}
