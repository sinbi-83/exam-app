import Anthropic from "@anthropic-ai/sdk";
import { ExamGenerationResult, GenerateResponse } from "@/types/exam";

// 서버 사이드에서만 사용됩니다. API 키는 절대 클라이언트에 노출되지 않습니다.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-5";
const TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

function tryParseExamJson(raw: string): ExamGenerationResult | null {
  // 혹시 모를 코드블록 표시(```json ... ```)를 방어적으로 제거
  const cleaned = raw.replace(/^```json\s*|^```\s*|```$/gm, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.passage === "string" &&
      Array.isArray(parsed.questions)
    ) {
      return parsed as ExamGenerationResult;
    }
    return null;
  } catch {
    return null;
  }
}

async function callClaudeOnce(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const message = await withTimeout(
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
    TIMEOUT_MS
  );
  return extractText(message);
}

/**
 * 문제 생성 + JSON 파싱 실패 시 1회 자동 재시도.
 * 재시도도 실패하면 명확한 에러를 반환합니다 (예외를 던지지 않고 항상 GenerateResponse를 반환).
 */
export async function generateExamQuestions(
  systemPrompt: string,
  userMessage: string
): Promise<GenerateResponse> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callClaudeOnce(systemPrompt, userMessage);
      const parsed = tryParseExamJson(raw);

      if (parsed) {
        return { ok: true, data: parsed };
      }

      // JSON 파싱 실패 -> 마지막 시도가 아니면 재시도, 마지막 시도면 에러 반환
      if (attempt === 2) {
        return {
          ok: false,
          errorType: "invalid_json",
          message: "생성에 실패했습니다. 다시 시도해주세요.",
        };
      }
      // 다음 루프에서 재시도
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "TIMEOUT";

      if (attempt === 2) {
        return {
          ok: false,
          errorType: isTimeout ? "timeout" : "network",
          message: isTimeout
            ? "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
            : "네트워크 오류가 발생했습니다. 연결을 확인하고 다시 시도해주세요.",
        };
      }
      // 다음 루프에서 재시도
    }
  }

  // 이 지점에 도달하면 안 되지만, 방어적으로 처리
  return {
    ok: false,
    errorType: "unknown",
    message: "알 수 없는 오류가 발생했습니다. 다시 시도해주세요.",
  };
}
