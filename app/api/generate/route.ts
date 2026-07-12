import { NextRequest, NextResponse } from "next/server";
import { GenerateRequestBody, GenerateResponse } from "@/types/exam";
import { buildSystemPrompt, buildUserMessage } from "@/lib/promptBuilder";
import { generateExamQuestions } from "@/lib/generateQuestions";

export async function POST(req: NextRequest) {
  let body: GenerateRequestBody;

  try {
    body = await req.json();
  } catch {
    const errorResponse: GenerateResponse = {
      ok: false,
      errorType: "unknown",
      message: "요청 형식이 올바르지 않습니다.",
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  if (!body.passage || body.passage.trim().length === 0) {
    const errorResponse: GenerateResponse = {
      ok: false,
      errorType: "unknown",
      message: "지문을 입력해주세요.",
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  const systemPrompt = buildSystemPrompt(body);
  const userMessage = buildUserMessage(body.passage);

  const result = await generateExamQuestions(systemPrompt, userMessage);

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
