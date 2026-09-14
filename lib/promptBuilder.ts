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
  // 객관식 유형과 서술형 분리
  const mcTypes = body.questionConfig.filter((q) => {
    const def = QUESTION_TYPES.find((t) => t.key === q.type);
    return def && !def.isWrittenAnswer;
  });
  const writtenTypes = body.questionConfig.filter((q) => {
    const def = QUESTION_TYPES.find((t) => t.key === q.type);
    return def && def.isWrittenAnswer;
  });

  const mcLabels = mcTypes.map((q) => {
    const def = QUESTION_TYPES.find((t) => t.key === q.type);
    return def?.label ?? q.type;
  });

  const writtenLines = writtenTypes.map((q) => {
    const def = QUESTION_TYPES.find((t) => t.key === q.type);
    return `- ${def?.label ?? q.type}: ${q.count}문항`;
  });

  const writtenCount = writtenTypes.reduce((sum, q) => sum + q.count, 0);
  const totalCount = 20 + writtenCount;

  let text = `\n\n대상 학년: ${body.gradeLevel}\n요청 문항 구성 (총 ${totalCount}문항):\n`;

  // 객관식: 항상 20문항 고정, AI가 유형별 배분
  if (mcLabels.length > 0) {
    text += `\n[객관식 - 반드시 정확히 20문항 출제]\n`;
    text += `다음 유형들을 골고루 섞어 총 20문항을 출제하라. 특정 유형에 편중되지 않게 다양하게 배분하라:\n`;
    text += mcLabels.map((l) => `- ${l}`).join("\n");
    text += `\n※ 객관식 총합이 반드시 20문항이어야 한다. 19문항이나 21문항은 절대 안 된다.`;
  }

  // 서술형
  if (writtenLines.length > 0) {
    text += `\n\n[서술형]\n${writtenLines.join("\n")}`;
  }

  return text;
}

export function buildSystemPrompt(body: GenerateRequestBody): string {
  const styleInstructions = buildStyleInstructions(body.styleParams);
  const questionConfigText = buildQuestionConfigText(body);
  return `${BASE_SYSTEM_PROMPT}${styleInstructions}${questionConfigText}`;
}

export function buildUserMessage(passage: string): string {
  return `다음 지문을 바탕으로 문제를 출제하라. 지문은 절대 수정하지 말고 원문 그대로 "passage" 필드에 넣어라.\n\n지문:\n${passage}`;
}
