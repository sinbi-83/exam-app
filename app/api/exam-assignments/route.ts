import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { diffAssignees, isTableMissing } from '@/lib/examAssignments'

// 시험 응시 대상 (표: exam_assignments, exam-assignments-migration.sql)
// 표가 아직 없으면 GET 은 빈 목록 + tableMissing 을 준다 (채점관리 화면이 고르기 버튼을 숨김).

const TABLE_MISSING_MESSAGE = '응시 대상 표가 아직 없습니다. exam-assignments-migration.sql 을 먼저 실행해 주세요.'

// GET: 응시 대상 전체
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase
    .from('exam_assignments')
    .select('id, exam_id, student_id, absent')
    .eq('user_id', user.id)
  if (error) {
    if (isTableMissing(error)) return NextResponse.json({ data: [], tableMissing: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data, tableMissing: false })
}

// PUT { exam_id, student_ids }: 그 시험의 응시 대상을 이 목록으로 맞춘다 (빠진 학생은 대상에서 뺌, 성적은 그대로)
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const examId = String(body.exam_id ?? '')
  const studentIds: string[] = Array.isArray(body.student_ids) ? body.student_ids.map(String) : []
  if (!examId) return NextResponse.json({ error: '시험을 골라 주세요.' }, { status: 400 })

  const { data: exam } = await supabase.from('exams').select('id').eq('id', examId).eq('user_id', user.id).maybeSingle()
  if (!exam) return NextResponse.json({ error: '시험을 찾을 수 없습니다.' }, { status: 404 })

  const { data: current, error: readError } = await supabase
    .from('exam_assignments')
    .select('student_id')
    .eq('user_id', user.id)
    .eq('exam_id', examId)
  if (readError) {
    if (isTableMissing(readError)) return NextResponse.json({ error: TABLE_MISSING_MESSAGE, tableMissing: true }, { status: 500 })
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }

  const { add, remove } = diffAssignees((current ?? []).map((r) => r.student_id), studentIds)
  if (add.length > 0) {
    const { error } = await supabase
      .from('exam_assignments')
      .insert(add.map((student_id) => ({ user_id: user.id, exam_id: examId, student_id })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (remove.length > 0) {
    const { error } = await supabase
      .from('exam_assignments')
      .delete()
      .eq('user_id', user.id)
      .eq('exam_id', examId)
      .in('student_id', remove)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, added: add.length, removed: remove.length })
}

// PATCH ?id= { absent }: 결석 표시
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  const body = await request.json()
  if (typeof body.absent !== 'boolean') return NextResponse.json({ error: 'absent 값이 필요합니다.' }, { status: 400 })

  const { data, error } = await supabase
    .from('exam_assignments')
    .update({ absent: body.absent })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, exam_id, student_id, absent')
    .single()
  if (error) {
    if (isTableMissing(error)) return NextResponse.json({ error: TABLE_MISSING_MESSAGE, tableMissing: true }, { status: 500 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}
