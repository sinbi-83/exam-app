import { NextRequest, NextResponse } from "next/server";
import {
  AiPassageRequestBody,
  AiPassageResponse,
  PassageHighlightItem,
  PassageSentence,
  EssayQuestion,
  SummaryQuestion,
  ReadingQuestion,
} from "@/types/aiPassage";
import {
  buildAiPassageSystemPrompt,
  buildAiPassageUserMessage,
} from "@/lib/aiPassagePromptBuilder";
import { createClient } from "@/lib/supabaseServer";
import { logApiUsage } from "@/lib/apiUsageLog";
import { detectGrammarLeak, validateGrammarItem } from "@/lib/grammarLeak";

const MODEL = "claude-sonnet-4-6";
// 어법 문항이 정답 노출 규칙을 어기면 다시 만든다 (처음 1번 + 다시 2번)
const MAX_ATTEMPTS = 3;

function essayLeaks(eq: EssayQuestion): boolean {
  if (eq.type !== "어법고쳐쓰기") return false;
  return detectGrammarLeak({ question_type: "어법고쳐쓰기", question_text: eq.prompt ?? "", correct_answer: eq.modelAnswer ?? "" }).length > 0;
}

// 어법 문항 문제 목록 (비어 있으면 통과)
function grammarProblems(p: { passage?: string; items?: PassageHighlightItem[]; essayQuestions?: EssayQuestion[] }): string[] {
  const out: string[] = [];
  (p.items ?? []).forEach((it, i) => {
    for (const msg of validateGrammarItem(it, p.passage ?? "")) out.push(`items[${i}] (${it.targetText}): ${msg}`);
  });
  (p.essayQuestions ?? []).forEach((eq, i) => {
    if (essayLeaks(eq)) out.push(`essayQuestions[${i}] 어법고쳐쓰기: 문장에 틀린 곳이 없거나 지시문이 고친 답을 알려 줌`);
  });
  return out;
}

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
  const baseUserMessage = buildAiPassageUserMessage(body);

  type Parsed = {
    passage: string;
    translation: string;
    items: PassageHighlightItem[];
    sentences?: PassageSentence[];
    essayQuestions?: EssayQuestion[];
    summaryQuestions?: SummaryQuestion[];
    readingQuestions?: ReadingQuestion[];
  };

  // 어법 문항 정답 노출 검사 (lib/grammarLeak.ts). 걸리면 이유를 붙여 다시 만들게 한다
  let parsed: Parsed | null = null;
  let userMessage = baseUserMessage;
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 14000,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Claude API 요청 실패:", response.status, errorBody);
        const errorResponse: AiPassageResponse = {
          ok: false,
          errorType: "network",
          message: "AI 서버 요청이 실패했습니다.",
        };
        return NextResponse.json(errorResponse, { status: 500 });
      }

      const data = await response.json();
      const rawText = data.content?.[0]?.text ?? "";

      if (data.usage) {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        await logApiUsage(supabase, {
          userId: user?.id ?? null,
          route: "generate-ai-passage",
          model: MODEL,
          inputTokens: data.usage.input_tokens ?? 0,
          outputTokens: data.usage.output_tokens ?? 0,
        });
      }

      let candidate: Parsed;
      try {
        candidate = JSON.parse(rawText);
      } catch {
        if (attempt < MAX_ATTEMPTS) continue;
        const errorResponse: AiPassageResponse = {
          ok: false,
          errorType: "invalid_json",
          message: "AI 응답을 해석할 수 없습니다.",
        };
        return NextResponse.json(errorResponse, { status: 500 });
      }

      const problems = grammarProblems(candidate);
      parsed = candidate;
      if (problems.length === 0) break;
      console.warn(`어법 문항 검증 실패 (${attempt}/${MAX_ATTEMPTS}):`, problems.slice(0, 10));
      if (attempt < MAX_ATTEMPTS) {
        const feedback = problems.slice(0, 20).map((p) => `- ${p}`).join("\n");
        userMessage = `${baseUserMessage}\n\n[이전 응답의 어법 문항 문제 — 모두 고쳐서 처음부터 다시 만들어라]\n${feedback}`;
      }
    }
  } catch {
    const errorResponse: AiPassageResponse = {
      ok: false,
      errorType: "unknown",
      message: "알 수 없는 오류가 발생했습니다.",
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
  if (!parsed) {
    const errorResponse: AiPassageResponse = { ok: false, errorType: "unknown", message: "알 수 없는 오류가 발생했습니다." };
    return NextResponse.json(errorResponse, { status: 500 });
  }

  // 끝까지 규칙을 어긴 어법 문항은 버린다 (정답이 보이는 문항을 넘기지 않는다)
  parsed = {
    ...parsed,
    items: (parsed.items ?? []).filter((it) => validateGrammarItem(it, parsed!.passage ?? "").length === 0),
    essayQuestions: (parsed.essayQuestions ?? []).filter((eq) => !essayLeaks(eq)),
  };

 const successResponse: AiPassageResponse = {
      ok: true,
      data: {
        passage: parsed.passage,
        translation: parsed.translation,
        items: parsed.items,
        sentences: parsed.sentences,
        essayQuestions: parsed.essayQuestions,
        summaryQuestions: parsed.summaryQuestions,
        readingQuestions: parsed.readingQuestions,
      },
    };
    return NextResponse.json(successResponse, { status: 200 });
}