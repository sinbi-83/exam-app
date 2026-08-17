import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// POST: 학생 ID + PIN을 받아서 확인 후, 맞으면 성적 이력 반환
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const body = await request.json()
  const { studentId, pin } = body

  if (!studentId || !pin) {
    return NextResponse.json({ error: '학생 정보와 PIN이 필요합니다.' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('get_student_report', {
    p_student_id: studentId,
    p_pin: pin,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data || !data.found) {
    return NextResponse.json({ error: 'PIN이 일치하지 않습니다.' }, { status: 401 })
  }

  return NextResponse.json({ data })
}