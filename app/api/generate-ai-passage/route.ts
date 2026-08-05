import { NextRequest, NextResponse } from "next/server";
import {
  AiPassageRequestBody,
  AiPassageResponse,
  PassageHighlightItem,
} from "@/types/aiPassage";
import {
  buildAiPassageSystemPrompt,
  buildAiPassageUserMessage,
} from "@/lib/aiPassagePromptBuilder";
export async function POST(req: NextRequest) {
  let body: AiPassageRequestBody;

  try {
    body = await req.json();
  } catch {
    const errorResponse: AiPassageResponse = {
      ok: false,
      errorType: "invalid_json",
      message: "요청 형식이 올바르지 않습니다.",
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  if (!body.topicKeyword || body.topicKeyword.trim().length === 0) {
    const errorResponse: AiPassageResponse = {
      ok: false,
      errorType: "unknown",
      message: "주제 키워드를 입력해주세요.",
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  const systemPrompt = buildAiPassageSystemPrompt();
  const userMessage = buildAiPassageUserMessage(body);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorResponse: AiPassageResponse = {
        ok: false,
        errorType: "network",
        message: "AI 서버 요청이 실패했습니다.",
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text ?? "";

    let parsed: { passage: string; translation: string; items: PassageHighlightItem[] };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const errorResponse: AiPassageResponse = {
        ok: false,
        errorType: "invalid_json",
        message: "AI 응답을 해석할 수 없습니다.",
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

 const successResponse: AiPassageResponse = {
      ok: true,
      data: {
        passage: parsed.passage,
        translation: parsed.translation,
        items: parsed.items,
      },
    };
    return NextResponse.json(successResponse, { status: 200 });
  } catch {
    const errorResponse: AiPassageResponse = {
      ok: false,
      errorType: "unknown",
      message: "알 수 없는 오류가 발생했습니다.",
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}