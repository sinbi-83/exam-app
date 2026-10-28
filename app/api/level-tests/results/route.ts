import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { findLevelTestById, recommendLevel, scoreLevelTest } from '@/lib/levelTest'
import { isColumnMissing } from '@/lib/reportStatus'
import type { LevelTestAnswers, LevelTestOverrides } from '@/types/levelTest'

// 레벨테스트 응시 결과 (표: level_test_results, level-test-results-migration.sql)
// 점수·추천 반은 서버에서 시험지(data/level-tests)로 다시 계산해 저장한다.

const SELECT = 'id, test_id, grade, form, student_id, student_name, mode, score, recommendation, memo, taken_at, created_at, updated_at'
// reviewed_at 칸은 report-status-level-test-review-migration.sql 실행 뒤에만 있다 → 없으면 빼고 다시 읽는다
const SELECT_WITH_REVIEW = `${SELECT}, reviewed_at`

function isTableMissing(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || (error.message ?? '').includes('level_test_results')
}

// GET ?grade=초3 &unreviewed=1 : 결과 목록 (최근 순), unreviewed=1 이면 확인 전 결과만
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const grade = request.nextUrl.searchParams.get('grade')
  const unreviewed = request.nextUrl.searchParams.get('unreviewed') === '1'
  const read = (select: string, onlyUnreviewed: boolean) => {
    let query = supabase.from('level_test_results').select(select).eq('user_id', user.id).order('taken_at', { ascending: false })
    if (grade) query = query.eq('grade', grade)
    if (onlyUnreviewed) query = query.is('reviewed_at', null)
    return query
  }
  let { data, error } = await read(SELECT_WITH_REVIEW, unreviewed)
  if (error && isColumnMissing(error)) {
    // 확인 칸이 아직 없으면 확인 전 목록은 빈 것으로
    if (unreviewed) return NextResponse.json({ data: [], tableMissing: false, reviewMissing: true })
    ;({ data, error } = await read(SELECT, false))
  }
  if (error) {
    if (isTableMissing(error)) return NextResponse.json({ data: [], tableMissing: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data, tableMissing: false })
}

// POST { test_id, student_name, student_id?, mode, answers, overrides?, memo?, taken_at? }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const test = findLevelTestById(String(body.test_id ?? ''))
  if (!test) return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 400 })
  const studentName = String(body.student_name ?? '').trim()
  if (!studentName) return NextResponse.json({ error: '학생 이름을 입력해 주세요.' }, { status: 400 })

  const answers = (body.answers ?? {}) as LevelTestAnswers
  const overrides = (body.overrides ?? {}) as LevelTestOverrides
  const score = scoreLevelTest(test, answers, overrides)
  const mode = body.mode === 'online' ? 'online' : 'paper'
  const row = {
    user_id: user.id,
    test_id: test.id,
    grade: test.grade,
    form: test.form,
    student_id: body.student_id || null,
    student_name: studentName,
    mode,
    answers,
    overrides,
    score,
    recommendation: recommendLevel(test.form, score.percent, test.grade),
    memo: body.memo ? String(body.memo) : null,
    taken_at: body.taken_at || new Date().toISOString(),
  }
  // 종이 답은 선생님이 직접 입력·채점하므로 바로 '확인함', 태블릿 응시는 확인 전으로 남긴다
  const insert = (values: Record<string, unknown>) => supabase.from('level_test_results').insert(values).select('id').single()
  let { data, error } = await insert(mode === 'paper' ? { ...row, reviewed_at: new Date().toISOString() } : row)
  if (error && isColumnMissing(error)) ({ data, error } = await insert(row))
  if (error) {
    if (isTableMissing(error)) return NextResponse.json({ error: '결과 저장 표가 아직 없습니다. level-test-results-migration.sql 을 먼저 실행해 주세요.', tableMissing: true }, { status: 500 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}
