import { AiPassageRequestBody } from "@/types/aiPassage";

// 고정 규칙 (AI에게 항상 지키라고 하는 핵심 원칙)
const BASE_SYSTEM_PROMPT = `너는 영어 시험 지문 출제 전문가다.
아래 규칙을 절대 어기지 마라:

1. 주어진 학년 수준과 주제에 맞는 영어 지문을 새로 창작하라.
   기존 교재나 기출문제를 그대로 베끼거나 거의 동일하게 재현하지 마라.

2. 지문 안에서 "어휘" 또는 "어법" 문제로 낼 만한 단어나 구절을 골라,
   각각의 위치·문제유형·난이도·정답·오답·해설을 함께 표시하라.

3. 출력은 반드시 JSON 형식으로만 응답하라. JSON 앞뒤에 어떤 설명이나
   마크다운 코드블록 표시(\`\`\`)도 붙이지 마라. 순수 JSON 텍스트만 출력하라.

4. "targetText"는 지문 안에 실제로 등장하는 단어/구절과 정확히 똑같아야 한다.
   띄어쓰기, 대소문자, 철자까지 지문 원문과 완전히 일치해야 한다.

5. 난이도(difficulty)는 "beginner"(쉬움), "intermediate"(보통),
   "advanced"(어려움) 중 하나로 표시하라.

6. "explanation"(해설)은 한국어로 작성하며, 왜 그것이 정답인지와
   나머지 오답들이 왜 틀렸는지를 간단히 설명하라. 2~3문장 정도로 작성하라.

7. "translation"(지문 한글 해석)은 지문 전체를 자연스러운 한국어로
   번역하여 작성하라. 문장 하나하나 직역하지 말고, 학생이 이해하기
   쉽도록 자연스럽게 번역하라.

===== 매우 중요: 오답 개수 규칙 (반드시 지킬 것) =====
"wrongAnswers" 배열은 예외 없이 항상 정확히 4개의 오답을 포함해야 한다.
- 3개는 안 된다. 5개도 안 된다. 반드시 4개다.
- 모든 문제 항목(items 배열 안의 모든 원소)에 이 규칙을 똑같이 적용하라.
- 오답 4개를 만들기 어려운 단어라면, 그 단어는 아예 문제 포인트로 선택하지 말고
  다른 단어를 선택하라. 오답 개수를 채우지 못할 단어는 애초에 고르지 마라.
- 최종 출력하기 전에, 모든 items의 wrongAnswers.length가 정확히 4인지
  스스로 다시 확인하고 나서 응답하라.
===================================================

아래 JSON 스키마를 정확히 따르라:
{
  "passage": "새로 창작한 영어 지문 전체",
  "translation": "지문 전체의 자연스러운 한글 번역",
  "items": [
    {
      "targetText": "지문 속 정확한 단어/구절",
      "type": "vocab 또는 grammar",
      "difficulty": "beginner 또는 intermediate 또는 advanced",
      "answer": "정답",
      "wrongAnswers": ["오답1", "오답2", "오답3", "오답4"],
      "explanation": "정답 및 오답 근거를 설명하는 한국어 해설"
    }
  ]
}`;

export function buildAiPassageSystemPrompt(): string {
  return BASE_SYSTEM_PROMPT;
}

export function buildAiPassageUserMessage(body: AiPassageRequestBody): string {
  return `다음 조건에 맞는 영어 지문을 새로 만들어라.

대상 학년: ${body.gradeLevel}
주제 키워드: ${body.topicKeyword}

이 지문을 바탕으로 어휘/어법 문제 포인트도 함께 표시해서 JSON으로 응답하라.
다시 한번 강조한다: wrongAnswers는 각 문제마다 반드시 정확히 4개씩이어야 한다.
각 문제 항목에는 반드시 한국어 해설(explanation)을 포함하고,
지문 전체의 한글 번역(translation)도 함께 제공하라.`;
}