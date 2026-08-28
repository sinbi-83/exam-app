// 문제 포인트 하나의 원본 재료 모양 (AI가 준 데이터)
export interface DetailTags {
  partOfSpeech?: string;
  grammarPoint?: string;
  vocabPoint?: string;
  readingPoint?: string;
  thinkingType?: string;
  answerFormat?: string;
  answerLanguage?: string;
}

export interface ExcerptInfo {
  excerptText?: string;
  sentenceNumbers?: number[];
  needsFullPassage?: boolean;
  canUsePartialExcerpt?: boolean;
}

export interface PassageHighlightItem {
  targetText: string;
  type: "vocab" | "grammar" | "reading" | "written" | "blank" | string;
  difficulty: "beginner" | "intermediate" | "advanced";
  answer: string;
  wrongAnswers: string[];
  explanation: string;
  targetSentence?: string;
  sentenceNumber?: number;
  detailTags?: DetailTags;
  excerpt?: ExcerptInfo;
}

// 실제 시험 문제로 조립된 후의 모양
export interface MultipleChoiceQuestion {
  targetText: string;
  type: "vocab" | "grammar" | "reading" | "written" | "blank" | string;
  difficulty: "beginner" | "intermediate" | "advanced";
  choices: string[];
  correctIndex: number;
  explanation: string;
  targetSentence?: string;
  sentenceNumber?: number;
  detailTags?: DetailTags;
  excerpt?: ExcerptInfo;
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
  if (!item.answer || !item.wrongAnswers || item.wrongAnswers.length === 0) {
    return null;
  }

  const usedWrongAnswers = item.wrongAnswers.slice(0, 4);
  const allChoices = [item.answer, ...usedWrongAnswers];
  const shuffled = shuffleArray(allChoices);
  const correctIndex = shuffled.indexOf(item.answer);

  return {
    targetText: item.targetText,
    type: item.type,
    difficulty: item.difficulty,
    choices: shuffled,
    correctIndex,
    explanation: item.explanation || "",
    // 상세 태그/발췌 정보도 그대로 이어받기 (없으면 undefined로 유지)
    targetSentence: item.targetSentence,
    sentenceNumber: item.sentenceNumber,
    detailTags: item.detailTags,
    excerpt: item.excerpt,
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