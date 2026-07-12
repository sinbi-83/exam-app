import { GenerateRequestBody } from "@/types/exam";
import { buildStyleInstructions } from "@/config/sliderInstructions";
import { QUESTION_TYPES } from "@/config/questionTypes";

// 고정 규칙 (절대 변경되면 안 되는 핵심 원칙)
const BASE_SYSTEM_PROMPT = `너는 영어 시험 문제 출제 전문가다.
아래 규칙을 절대 어기지 마라:
1. 주어진 지문을 그대로 사용하되, 문제·보기·정답·해설은 반드시 새로 창작하라.
   기존 교재나 기출문제를 참고했다는 사실을 문제에 드러내지 말고, 실제 시중 문제를
   그대로 베끼거나 거의 동일하게 재현하지 마라.
2. 출력은 반드시 JSON 형식으로만 응답하라. JSON 앞뒤에 어떤 설명이나 마크다운 코드블록
   표시(\`\`\`)도 붙이지 마라. 순수 JSON 텍스트만 출력하라.
3. 아래 JSON 스키마를 정확히 따르라.
4. 각 문제유형에 지정된 문항 수를 정확히 맞춰라.
5. 정답이 명확하게 하나로 판별되도록 출제하라. 애매한 정답이 나오지 않게 하라.

JSON 스키마:
{
  "passage": "입력받은 지문 그대로",
  "questions": [
    {
      "id": 1,
      "type": "빈칸추론",
      "question": "문제 지문",
      "choices": ["①...", "②...", "③...", "④...", "⑤..."],
      "answer": "②",
      "explanation": "정답 근거와 오답이 틀린 이유 설명",
      "isWrittenAnswer": false
    }
  ]
}

서술형 문제는 choices를 빈 배열([])로, isWrittenAnswer를 true로 설정하고,
answer에는 모범답안을, explanation에는 채점기준을 넣어라.`;

function buildQuestionConfigText(body: GenerateRequestBody): string {
  const lines = body.questionConfig
    .filter((q) => q.count > 0)
    .map((q) => {
      const def = QUESTION_TYPES.find((t) => t.key === q.type);
      const label = def?.label ?? q.type;
      return `- ${label}: ${q.count}문항`;
    });

  const totalCount = body.questionConfig.reduce((sum, q) => sum + q.count, 0);

  return `\n\n대상 학년: ${body.gradeLevel}\n요청 문항 구성 (총 ${totalCount}문항):\n${lines.join("\n")}`;
}

export function buildSystemPrompt(body: GenerateRequestBody): string {
  const styleInstructions = buildStyleInstructions(body.styleParams);
  const questionConfigText = buildQuestionConfigText(body);
  return `${BASE_SYSTEM_PROMPT}${styleInstructions}${questionConfigText}`;
}

export function buildUserMessage(passage: string): string {
  return `다음 지문을 바탕으로 문제를 출제하라. 지문은 절대 수정하지 말고 원문 그대로 "passage" 필드에 넣어라.\n\n지문:\n${passage}`;
}
