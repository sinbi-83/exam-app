import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { findLevelTestById, recommendLevel, scoreLevelTest } from '@/lib/levelTest'
import { isColumnMissing } from '@/lib/reportStatus'
import type { LevelTestAnswers, LevelTestOverrides } from '@/types/levelTest'

// GET: 결과 한 개 (답 포함)
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase.from('level_test_results').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '결과를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ data })
}

// PATCH { reviewed: true|false } : 확인함 표시만 바꾼다 (점수는 그대로)
// PATCH { answers?, overrides?, student_name?, student_id?, memo? } : 채점 고치기 → 점수·추천 반 다시 계산
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  if (typeof body.reviewed === 'boolean') {
    const { data, error } = await supabase
      .from('level_test_results')
      .update({ reviewed_at: body.reviewed ? new Date().toISOString() : null })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single()
    if (error) {
      if (isColumnMissing(error)) return NextResponse.json({ error: '확인 칸이 아직 없습니다. report-status-level-test-review-migration.sql 을 먼저 실행해 주세요.' }, { status: 500 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data })
  }

  const { data: row, error: readError } = await supabase.from('level_test_results').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: '결과를 찾을 수 없습니다.' }, { status: 404 })
  const test = findLevelTestById(row.test_id)
  if (!test) return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 400 })

  const answers = (body.answers ?? row.answers) as LevelTestAnswers
  const overrides = (body.overrides ?? row.overrides) as LevelTestOverrides
  const score = scoreLevelTest(test, answers, overrides)
  const patch: Record<string, unknown> = {
    answers,
    overrides,
    score,
    recommendation: recommendLevel(test.form, score.percent, test.grade),
    updated_at: new Date().toISOString(),
  }
  if (typeof body.student_name === 'string' && body.student_name.trim()) patch.student_name = body.student_name.trim()
  if ('student_id' in body) patch.student_id = body.student_id || null
  if ('memo' in body) patch.memo = body.memo ? String(body.memo) : null

  const { data, error } = await supabase.from('level_test_results').update(patch).eq('id', id).eq('user_id', user.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE: 결과 삭제 (화면에서 한 번 더 확인한 뒤)
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { error } = await supabase.from('level_test_results').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
