import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { buildReadingQuestionPrompt } from '@/lib/buildMultipleChoice'

// 난이도 문자열 → 숫자 변환 (1~5 척도, 3=표준 기준)
const DIFFICULTY_TO_NUMBER: Record<string, number> = {
  beginner: 2,
  intermediate: 3,
  advanced: 4,
}

// 어휘/어법 문제에 맞는 질문 문구 생성
function buildQuestionText(q: any): string {
  if (q.type === 'grammar') {
    return `밑줄 친 "${q.targetText}"의 쓰임이 어법상 가장 적절한 것은?`
  }
  return `"${q.targetText}"의 의미로 가장 알맞은 것은?`
}

// 서술형 문제의 해설란 텍스트 생성 (채점기준을 한 줄로 정리)
function buildEssayExplanation(eq: any): string {
  const rubricText = Array.isArray(eq.rubric)
    ? eq.rubric.map((r: any) => `${r.criteria}(${r.points}점)`).join(', ')
    : ''
  const parts = [rubricText, eq.partialCreditNotes].filter(Boolean)
  return parts.join(' / ')
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
    readingQuestions,
  } = body

  // 3. Supabase에 저장 (기존 로직 그대로, 절대 변경 없음)
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
      reading_questions: readingQuestions ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 4. questions 테이블에도 문항 단위로 저장
  //    여기서 실패해도 위 question_sets 저장 결과에는 전혀 영향 없음 (격리)
  try {
    const rows: any[] = []

    // 4-1. 어휘/어법 (기존 로직 그대로)
    if (Array.isArray(questions) && questions.length > 0) {
      for (const q of questions) {
        rows.push({
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
        })
      }
    }

    // 4-2. 지문요약 (신규)
    if (Array.isArray(summaryQuestions) && summaryQuestions.length > 0) {
      for (const sq of summaryQuestions) {
        rows.push({
          user_id: user.id,
          question_set_id: data.id,
          question_type: 'summary',
          question_text: sq.summaryText,
          choices: sq.choices,
          correct_answer: sq.choices?.[sq.correctIndex] ?? null,
          explanation: sq.explanation ?? null,
          grade,
          topic,
          difficulty: DIFFICULTY_TO_NUMBER[sq.difficulty] ?? null,
          tags: topic ? [topic, '지문요약'] : ['지문요약'],
          weakness_tags: [],
          status: 'ai_generated',
        })
      }
    }

    // 4-3. 독해 (신규) - type별로 구분: reading_주제, reading_제목 등
    if (Array.isArray(readingQuestions) && readingQuestions.length > 0) {
      for (const rq of readingQuestions) {
        rows.push({
          user_id: user.id,
          question_set_id: data.id,
          question_type: `reading_${rq.type}`,
          question_text: buildReadingQuestionPrompt(rq.type),
          choices: rq.choices,
          correct_answer: rq.choices?.[rq.correctIndex] ?? null,
          explanation: rq.explanation ?? null,
          grade,
          topic,
          difficulty: DIFFICULTY_TO_NUMBER[rq.difficulty] ?? null,
          tags: topic ? [topic, '독해'] : ['독해'],
          weakness_tags: [],
          status: 'ai_generated',
        })
      }
    }

    // 4-4. 서술형 (신규) - type별로 구분: essay_어법고쳐쓰기 등
    //      객관식이 아니므로 choices는 없고, correct_answer에 모범답안을 저장
    if (Array.isArray(essayQuestions) && essayQuestions.length > 0) {
      for (const eq of essayQuestions) {
        rows.push({
          user_id: user.id,
          question_set_id: data.id,
          question_type: `essay_${eq.type}`,
          question_text: eq.prompt,
          choices: null,
          correct_answer: eq.modelAnswer ?? null,
          explanation: buildEssayExplanation(eq),
          grade,
          topic,
          difficulty: DIFFICULTY_TO_NUMBER[eq.level] ?? null,
          tags: topic ? [topic, '서술형'] : ['서술형'],
          weakness_tags: [],
          status: 'ai_generated',
          essay_meta: {
            wordBank: eq.wordBank ?? null,
            conditions: eq.conditions ?? null,
            answerLines: eq.answerLines ?? null,
          },
        })
      }
    }

    if (rows.length > 0) {
      const { error: questionsError } = await supabase.from('questions').insert(rows)

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