import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// 4자리 랜덤 PIN 생성 함수
function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

// GET: 로그인한 선생님의 학생 목록 가져오기
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
    .from('students')
    .select('id, name, grade, pin, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST: 새 학생 등록 (PIN 자동 생성)
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const body = await request.json()
  const { name, grade } = body

  if (!name) {
    return NextResponse.json({ error: '학생 이름을 입력해주세요.' }, { status: 400 })
  }

  const pin = generatePin()

  const { data, error } = await supabase
    .from('students')
    .insert({
      user_id: user.id,
      name,
      grade: grade || '',
      pin,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}