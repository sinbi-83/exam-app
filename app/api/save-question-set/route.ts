import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// 난이도 문자열 → 숫자 변환 (1~5 척도, 3=표준 기준)
const DIFFICULTY_TO_NUMBER: Record<string, number> = {
  beginner: 2,
  intermediate: 3,
  advanced: 4,
}

// 문제 유형에 맞는 질문 문구 생성 (화면 쪽 buildQuestionPrompt와 동일한 로직)
function buildQuestionText(q: any): string {
  if (q.type === 'grammar') {
    return `밑줄 친 "${q.targetText}"의 쓰임이 어법상 가장 적절한 것은?`
  }
  return `"${q.targetText}"의 의미로 가장 알맞은 것은?`
}

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
  const {
    grade,
    topic,
    passage,
    translation,
    items,
    questions,
    sentences,
    essayQuestions,
    summaryQuestions,
  } = body

  // 3. Supabase에 저장 (기존 로직 + 서술형/지문요약 컬럼 추가)
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
      sentences: sentences ?? null,
      essay_questions: essayQuestions ?? null,
      summary_questions: summaryQuestions ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 4. [기존] questions 테이블에도 문항 단위로 저장
  //    여기서 실패해도 위 question_sets 저장 결과에는 영향 없음
  try {
    if (Array.isArray(questions) && questions.length > 0) {
      const rows = questions.map((q: any) => ({
        user_id: user.id,
        question_set_id: data.id,
        question_type: q.type,
        question_text: buildQuestionText(q),
        choices: q.choices,
        correct_answer: q.choices?.[q.correctIndex] ?? null,
        explanation: q.explanation ?? null,
        grade,
        topic,
        difficulty: DIFFICULTY_TO_NUMBER[q.difficulty] ?? null,
        tags: topic ? [topic] : [],
        weakness_tags: [],
        status: 'ai_generated',
      }))

      const { error: questionsError } = await supabase
        .from('questions')
        .insert(rows)

      if (questionsError) {
        console.error('questions 테이블 저장 실패:', questionsError.message)
      }
    }
  } catch (err) {
    console.error('questions 테이블 저장 중 예외 발생:', err)
  }

  // 5. 응답은 기존과 동일
  return NextResponse.json({ data })
}