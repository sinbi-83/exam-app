// 문제 포인트 하나의 원본 재료 모양 (AI가 준 데이터)
export interface PassageHighlightItem {
  targetText: string;
  type: "vocab" | "grammar";
  difficulty: "beginner" | "intermediate" | "advanced";
  answer: string;
  wrongAnswers: string[];
}

// 실제 시험 문제로 조립된 후의 모양
export interface MultipleChoiceQuestion {
  targetText: string;
  type: "vocab" | "grammar";
  difficulty: "beginner" | "intermediate" | "advanced";
  choices: string[];      // 무작위로 섞인 보기 (개수는 오답 개수+1)
  correctIndex: number;   // 정답이 몇 번째에 있는지
}

// 배열 순서를 무작위로 섞어주는 함수
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 문제 포인트 하나를 객관식 문제로 바꾸는 함수
export function buildOneMultipleChoice(
  item: PassageHighlightItem
): MultipleChoiceQuestion | null {
  // 정답이 없거나, 오답이 하나도 없으면 문제로 만들 수 없으니 건너뜀
  if (!item.answer || !item.wrongAnswers || item.wrongAnswers.length === 0) {
    return null;
  }

  // 오답이 4개보다 많으면 앞의 4개만 사용, 4개 이하면 있는 만큼 전부 사용
  const usedWrongAnswers = item.wrongAnswers.slice(0, 4);

  // 정답 1개 + 오답들을 하나의 배열로 합치기
  const allChoices = [item.answer, ...usedWrongAnswers];

  // 무작위로 섞기
  const shuffled = shuffleArray(allChoices);

  // 섞인 배열에서 정답이 몇 번째로 갔는지 찾기
  const correctIndex = shuffled.indexOf(item.answer);

  return {
    targetText: item.targetText,
    type: item.type,
    difficulty: item.difficulty,
    choices: shuffled,
    correctIndex,
  };
}

// 문제 포인트 여러 개를 한꺼번에 객관식 문제 목록으로 바꾸는 함수
export function buildMultipleChoiceQuestions(
  items: PassageHighlightItem[]
): MultipleChoiceQuestion[] {
  const result: MultipleChoiceQuestion[] = [];
  for (const item of items) {
    const question = buildOneMultipleChoice(item);
    if (question) {
      result.push(question);
    }
  }
  return result;
}
