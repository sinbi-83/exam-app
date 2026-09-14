import { NextRequest, NextResponse } from 'next/server'

interface GenerateReportRequestBody {
  studentName: string
  studentGrade: string
  score: number
  maxScore: number
  typeScores?: Record<string, number>
  // 선생님 단문 메모 (짧게 입력)
  strengthsMemo?: string
  commentMemo?: string
  nextStepsMemo?: string
  vocabMemo?: string
  grammarMemo?: string
  readingMemo?: string
}

interface GenerateReportResponse {
  ok: boolean
  data?: {
    strengths: string
    comment: string
    nextSteps: string
    vocabAnalysis: string
    grammarAnalysis: string
    readingAnalysis: string
  }
  message?: string
}

function buildSystemPrompt(): string {
  return `당신은 영어학원 선생님의 학생 보고서 작성을 돕는 전문 보조 AI입니다.

역할:
- 선생님이 짧게 남긴 관찰 메모를 바탕으로 보고서에 들어갈 완성된 문장을 작성합니다.
- 학부모가 읽는 공식 문서이므로 정중하고 전문적인 어조를 유지합니다.
- 학생의 성장 가능성을 긍정적으로 표현하되, 개선이 필요한 부분은 솔직하고 건설적으로 표현합니다.
- 학부모가 이해하기 쉽도록 구체적으로 씁니다.
- 선생님의 메모가 비어 있는 경우 점수 데이터를 바탕으로 적절한 내용을 생성합니다.

출력 형식:
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "strengths": "강점 내용 (2~3문장, 학생이 잘하는 점을 구체적으로)",
  "comment": "보완이 필요한 부분 (2~3문장, 건설적이고 희망적으로)",
  "nextSteps": "다음 학습 계획 (줄바꿈으로 구분된 3~4가지 실천 항목)",
  "vocabAnalysis": "어휘력 분석 (2~3문장)",
  "grammarAnalysis": "어법/이해 분석 (2~3문장)",
  "readingAnalysis": "독해 & 요약 분석 (2~3문장)"
}`
}

function buildUserMessage(body: GenerateReportRequestBody): string {
  const pct = body.maxScore > 0 ? Math.round((body.score / body.maxScore) * 100) : 0

  let msg = `학생 정보:
- 이름: ${body.studentName}
- 학년: ${body.studentGrade}
- 점수: ${body.score}/${body.maxScore} (${pct}%)`

  if (body.typeScores && Object.keys(body.typeScores).length > 0) {
    msg += '\n- 영역별 점수: ' + Object.entries(body.typeScores).map(([k, v]) => `${k} ${v}점`).join(', ')
  }

  msg += '\n\n선생님 관찰 메모 (이것을 바탕으로 완성된 문장을 작성해주세요):'

  if (body.strengthsMemo?.trim()) {
    msg += `\n- 강점 메모: "${body.strengthsMemo}"`
  } else {
    msg += '\n- 강점 메모: (없음 — 점수 데이터로 판단해서 작성)'
  }

  if (body.commentMemo?.trim()) {
    msg += `\n- 보완 메모: "${body.commentMemo}"`
  } else {
    msg += '\n- 보완 메모: (없음 — 점수 데이터로 판단해서 작성)'
  }

  if (body.nextStepsMemo?.trim()) {
    msg += `\n- 학습계획 메모: "${body.nextStepsMemo}"`
  } else {
    msg += '\n- 학습계획 메모: (없음 — 점수와 영역별 데이터로 판단해서 작성)'
  }

  if (body.vocabMemo?.trim()) {
    msg += `\n- 어휘 메모: "${body.vocabMemo}"`
  } else {
    msg += '\n- 어휘 메모: (없음 — 어휘 점수 데이터로 판단)'
  }

  if (body.grammarMemo?.trim()) {
    msg += `\n- 어법 메모: "${body.grammarMemo}"`
  } else {
    msg += '\n- 어법 메모: (없음 — 어법 점수 데이터로 판단)'
  }

  if (body.readingMemo?.trim()) {
    msg += `\n- 독해 메모: "${body.readingMemo}"`
  } else {
    msg += '\n- 독해 메모: (없음 — 독해/요약 점수 데이터로 판단)'
  }

  msg += '\n\n위 정보를 바탕으로 학부모용 보고서 문장을 JSON 형식으로 작성해주세요.'

  return msg
}

export async function POST(req: NextRequest) {
  let body: GenerateReportRequestBody

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  if (!body.studentName) {
    return NextResponse.json({ ok: false, message: '학생 이름이 필요합니다.' }, { status: 400 })
  }

  const systemPrompt = buildSystemPrompt()
  const userMessage = buildUserMessage(body)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      console.error('Claude API 오류:', response.status)
      return NextResponse.json({ ok: false, message: 'AI 서버 요청 실패.' }, { status: 500 })
    }

    const data = await response.json()
    const rawText = data.content?.[0]?.text ?? ''

    let parsed: GenerateReportResponse['data']
    try {
      // JSON 블록이 있으면 추출
      const match = rawText.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : rawText)
    } catch {
      return NextResponse.json({ ok: false, message: 'AI 응답을 해석할 수 없습니다.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data: parsed }, { status: 200 })
  } catch {
    return NextResponse.json({ ok: false, message: '알 수 없는 오류가 발생했습니다.' }, { status: 500 })
  }
}
