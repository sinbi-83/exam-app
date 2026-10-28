import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { isColumnMissing, isReportSentVia, isReportStatus, reportStatusPatch } from '@/lib/reportStatus'

// GET: 저장된 보고서 목록
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST: 보고서 저장
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const {
    student_id, exam_id,
    student_name, student_grade,
    exam_title, exam_date,
    score, max_score,
    strengths, comment, next_steps,
    type_scores,
    teacher, vocab_analysis, grammar_analysis, reading_analysis,
  } = body

  if (!student_name || score === undefined) {
    return NextResponse.json({ error: '학생 이름과 점수는 필수입니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({
      user_id: user.id,
      student_id: student_id || null,
      exam_id: exam_id || null,
      student_name,
      student_grade: student_grade || null,
      exam_title: exam_title || null,
      exam_date: exam_date || null,
      score: Number(score),
      max_score: Number(max_score) || 100,
      strengths: strengths || null,
      comment: comment || null,
      next_steps: next_steps || null,
      type_scores: type_scores || {},
      teacher: teacher || null,
      vocab_analysis: vocab_analysis || null,
      grammar_analysis: grammar_analysis || null,
      reading_analysis: reading_analysis || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// PATCH ?id= { status, sent_via? }: 확인·발송 상태 바꾸기 (report-status-level-test-review-migration.sql)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  const body = await request.json()
  if (!isReportStatus(body.status)) return NextResponse.json({ error: '상태 값이 올바르지 않습니다.' }, { status: 400 })
  const via = isReportSentVia(body.sent_via) ? body.sent_via : null
  if (body.status === 'sent' && !via) return NextResponse.json({ error: '보낸 방법을 골라 주세요.' }, { status: 400 })

  const { data, error } = await supabase
    .from('reports')
    .update(reportStatusPatch(body.status, via, new Date().toISOString()))
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    if (isColumnMissing(error)) {
      return NextResponse.json({ error: '보고서 상태 칸이 아직 없습니다. report-status-level-test-review-migration.sql 을 먼저 실행해 주세요.', columnMissing: true }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

// DELETE: 보고서 삭제
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
