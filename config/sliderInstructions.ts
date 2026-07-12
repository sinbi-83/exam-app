import { StyleAxisKey, StyleParams } from "@/config/stylePresets";

// 각 축마다 [임계값, 방향, 지시문] 규칙을 배열로 관리합니다.
// direction: "gte"면 값이 threshold 이상일 때, "lte"면 threshold 이하일 때 지시문이 활성화됩니다.
// 같은 축에 여러 규칙을 넣어두면 값에 맞는 규칙들이 전부 적용됩니다 (배타적일 필요 없음).

interface InstructionRule {
  threshold: number;
  direction: "gte" | "lte";
  instruction: string;
}

export const SLIDER_INSTRUCTION_RULES: Record<StyleAxisKey, InstructionRule[]> = {
  textbookFocus: [
    { threshold: 8, direction: "gte", instruction: "교과서 본문에 매우 밀착된 문제를 출제하라. 지문의 표현과 문맥을 최대한 활용하라." },
    { threshold: 3, direction: "lte", instruction: "교과서 본문에서 다소 벗어난, 독립적인 지문 해석 위주로 출제하라." },
  ],
  sentenceStructure: [
    { threshold: 7, direction: "gte", instruction: "문장의 구조(주어, 동사, 절 구분 등)를 분석하는 문항 비중을 높여라." },
    { threshold: 2, direction: "lte", instruction: "문장구조 분석보다는 전체 맥락 이해 위주로 출제하라." },
  ],
  examPattern: [
    { threshold: 7, direction: "gte", instruction: "실제 내신/수능 기출 문제와 유사한 형식과 발문을 사용하라." },
    { threshold: 3, direction: "lte", instruction: "정형화된 기출 패턴보다는 자유로운 형식으로 출제하라." },
  ],
  vocabWeight: [
    { threshold: 7, direction: "gte", instruction: "어휘의 의미, 유의어, 문맥상 쓰임을 묻는 문항 비중을 높여라." },
  ],
  inferenceDifficulty: [
    { threshold: 7, direction: "gte", instruction: "행간의 의미나 저자의 의도를 추론해야 풀 수 있는 고난도 문항을 포함하라." },
    { threshold: 2, direction: "lte", instruction: "지문에 명시적으로 드러난 정보만으로 풀 수 있도록 쉽게 출제하라." },
  ],
  writtenAnswerRatio: [
    { threshold: 20, direction: "gte", instruction: "전체 문항 중 서술형(우리말 서술) 문제의 비중을 높게 유지하라." },
    { threshold: 5, direction: "lte", instruction: "서술형 문제는 최소한으로만 출제하라." },
  ],
  distractorComplexity: [
    { threshold: 7, direction: "gte", instruction: "오답 선지가 매력적인 함정이 되도록 정교하게 설계하라. 지문의 일부를 교묘하게 왜곡하거나 유사 어휘로 헷갈리게 만들어라." },
    { threshold: 2, direction: "lte", instruction: "오답 선지는 명확하게 구분되도록 단순하게 설계하라." },
  ],
};

/**
 * 사용자가 설정한 7개 슬라이더 값을 받아서,
 * 활성화되는 규칙들의 지시문을 이어붙인 하나의 문자열로 반환합니다.
 */
export function buildStyleInstructions(params: StyleParams): string {
  const lines: string[] = [];

  (Object.keys(SLIDER_INSTRUCTION_RULES) as StyleAxisKey[]).forEach((axisKey) => {
    const value = params[axisKey];
    const rules = SLIDER_INSTRUCTION_RULES[axisKey];

    rules.forEach((rule) => {
      const active =
        rule.direction === "gte" ? value >= rule.threshold : value <= rule.threshold;
      if (active) {
        lines.push(`- ${rule.instruction}`);
      }
    });
  });

  if (lines.length === 0) return "";

  return `\n\n다음은 사용자가 설정한 출제 성향에 따른 추가 지시사항이다:\n${lines.join("\n")}`;
}
