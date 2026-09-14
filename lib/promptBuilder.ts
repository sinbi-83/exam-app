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
4. 객관식 문항 수는 반드시 정확히 20개여야 한다. 절대 19개나 18개나 16개로 줄이지 마라. 반드시 20개를 끝까지 완성하라. 출력이 길어지더라도 20개를 모두 출력해야 한다.
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
  const mcTypes = body.questionConfig.filter((q) => {
    const def = QUESTION_TYPES.find((t) => t.key === q.type);
    return def && !def.isWrittenAnswer;
  });

  const mcLabels = mcTypes.map((q) => {
    const def = QUESTION_TYPES.find((t) => t.key === q.type);
    return def?.label ?? q.type;
  });

  // 서술형은 항상 4문항 고정
  const WRITTEN_COUNT = 4;
  const TOTAL = 20 + WRITTEN_COUNT;

  let text = `\n\n대상 학년: ${body.gradeLevel}`;
  text += `\n\n==== 문항 구성 (절대 변경 불가) ====`;
  text += `\n총 ${TOTAL}문항: 객관식 20문항 + 서술형 ${WRITTEN_COUNT}문항`;
  text += `\n\n[1단계: 객관식 20문항]`;
  text += `\n- isWrittenAnswer: false 인 문항을 정확히 20개 출제`;
  text += `\n- choices 배열에 ①②③④⑤ 5개 선택지 필수`;
  text += `\n- 아래 유형들을 골고루 섞어 20문항 배분 (특정 유형 편중 금지):`;
  text += `\n${mcLabels.map((l) => `  · ${l}`).join("\n")}`;
  text += `\n\n[2단계: 서술형 ${WRITTEN_COUNT}문항]`;
  text += `\n- isWrittenAnswer: true 인 문항을 정확히 ${WRITTEN_COUNT}개 출제`;
  text += `\n- choices는 빈 배열 []`;
  text += `\n- answer에 모범답안, explanation에 채점기준`;
  text += `\n\n★ questions 배열 순서: 객관식 20개 먼저, 서술형 ${WRITTEN_COUNT}개 마지막`;
  text += `\n★ 객관식이 20개 미만이면 출력이 잘못된 것이다. 반드시 20개를 모두 완성하라.`;

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
