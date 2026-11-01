import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { isSchemaMissing } from '@/lib/classManagement'

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  // 새 컬럼 포함해서 조회, 실패 시 기존 컬럼만으로 재시도
  const read = (columns: string) => supabase
    .from('students')
    .select(columns)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  const COLUMNS = 'id, name, grade, pin, created_at, school_name, student_phone, parent_phone, enrolled_at, notes'

  // 상태 칸은 class-management-migration.sql 적용 뒤에만 있다 → 없으면 빼고 읽는다 (statusReady: false)
  const withStatus = await read(`${COLUMNS}, status, withdrawn_on, withdraw_note`)
  if (!withStatus.error) return NextResponse.json({ data: withStatus.data, statusReady: true })
  const statusReady = !isSchemaMissing(withStatus.error)

  // eslint-disable-next-line prefer-const
  let { data, error } = statusReady ? withStatus : await read(COLUMNS)

  if (error) {
    // 새 컬럼이 아직 없을 경우 기존 컬럼만 조회
    const fallback = await supabase
      .from('students')
      .select('id, name, grade, pin, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data = fallback.data as any
  }
  return NextResponse.json({ data, statusReady: false })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const { name, grade, school_name, student_phone, parent_phone, enrolled_at, notes } = body

  if (!name) return NextResponse.json({ error: '학생 이름을 입력해주세요.' }, { status: 400 })

  const pin = generatePin()

  const { data, error } = await supabase
    .from('students')
    .insert({
      user_id: user.id,
      name,
      grade: grade || '',
      pin,
      school_name: school_name || '',
      student_phone: student_phone || '',
      parent_phone: parent_phone || '',
      enrolled_at: enrolled_at || null,
      notes: notes || '',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
