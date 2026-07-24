import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { grade, topic } = await request.json();

    if (!grade || !topic) {
      return NextResponse.json(
        { error: "학년과 주제를 모두 입력해주세요." },
        { status: 400 }
      );
    }

    const systemPrompt = `너는 한국 중고등학생을 위한 영어 시험 문제 출제 전문가야.

[역할]
학년과 주제를 받아서, 그 학년 수준에 맞는 영어 지문을 직접 작성해.

[지문 작성 규칙]
- 학년: ${grade}
- 주제: ${topic}
- 문장 수: 8~10문장
- 학년 수준에 맞는 어휘와 문법 난이도로 작성

[태그 규칙 - 매우 중요]
지문의 각 문장 앞에 반드시 아래 형식으로 태그를 붙여:
(문장번호)[유형-난이도] 문장 내용

- 유형은 반드시 다음 중 하나: 문법, 어휘, 독해
- 난이도는 반드시 다음 중 하나: 초급, 중급, 상급, 심화
- 지문 전체에서 태그는 총 25개 안팎이 되도록 해. (한 문장에 태그가 여러 개 붙어도 됨)

[어휘 객관식 문제 생성 규칙 - 매우 중요]
지문에서 어휘 태그가 붙은 문장 중 3개를 골라서, 각 문장 안의 단어 하나를 시험 내는 객관식 문제를 만들어.
- 보기는 정답 1개 + 그럴듯한 오답 3개, 총 4개
- 보기 순서는 무작위로 섞어
- sentenceNumber는 그 단어가 들어있는 문장의 번호와 반드시 일치해야 함

[전체 출력 형식 - 반드시 아래 순서와 형식을 그대로 지킬 것. 다른 설명, 인사말, 마크다운 기호는 절대 넣지 마.]

(1)[유형-난이도] 첫 번째 문장
(2)[유형-난이도] 두 번째 문장
...

===VOCAB_QUESTIONS===
[
  {"sentenceNumber": 1, "word": "시험 낼 단어", "options": ["보기1", "보기2", "보기3", "보기4"], "answerIndex": 0},
  {"sentenceNumber": 3, "word": "...", "options": ["...", "...", "...", "..."], "answerIndex": 2},
  {"sentenceNumber": 5, "word": "...", "options": ["...", "...", "...", "..."], "answerIndex": 1}
]

주의: ===VOCAB_QUESTIONS=== 아래에는 반드시 유효한 JSON 배열만 나와야 해.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `학년: ${grade}, 주제: ${topic} 로 지문을 만들어줘.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", errorText);
      return NextResponse.json(
        { error: "AI 호출 중 문제가 발생했어요." },
        { status: 500 }
      );
    }

    const data = await response.json();
    const fullText = data.content
      .map((block: any) => (block.type === "text" ? block.text : ""))
      .join("\n");

    // 조교(코드)가 여기서 지문과 어휘 문제를 나눠서 정리함 (AI 재호출 없음, 무료)
    const [passagePart, vocabPart] = fullText.split("===VOCAB_QUESTIONS===");

    let vocabQuestions = [];
    if (vocabPart) {
      try {
        const cleaned = vocabPart.trim().replace(/```json|```/g, "");
        vocabQuestions = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error("어휘 문제 JSON 파싱 실패:", parseErr);
        vocabQuestions = [];
      }
    }

    return NextResponse.json({
      passage: passagePart ? passagePart.trim() : fullText.trim(),
      vocabQuestions,
    });
  } catch (err) {
    console.error("generate-passage error:", err);
    return NextResponse.json(
      { error: "서버에서 오류가 발생했어요." },
      { status: 500 }
    );
  }
}