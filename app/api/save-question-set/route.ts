import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // 1. 로그인한 사용자 확인
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  // 2. 받은 데이터 꺼내기
  const body = await request.json()
  const { grade, topic, passage, translation, items, questions } = body

  // 3. Supabase에 저장
  const { data, error } = await supabase
    .from('question_sets')
    .insert({
      user_id: user.id,
      grade,
      topic,
      passage,
      translation,
      items,
      questions,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}