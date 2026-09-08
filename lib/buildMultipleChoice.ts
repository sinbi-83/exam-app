import { SummaryQuestion, ReadingQuestion } from "@/types/aiPassage";

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

// ===== 지문요약 빈칸채우기(summaryQuestions) 조립 함수 =====

export interface SummaryMultipleChoiceQuestion {
  summaryText: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export function buildOneSummaryQuestion(
  item: SummaryQuestion
): SummaryMultipleChoiceQuestion | null {
  if (!item.answer || !item.wrongAnswers || item.wrongAnswers.length === 0) {
    return null;
  }

  const usedWrongAnswers = item.wrongAnswers.slice(0, 4);
  const allChoices = [item.answer, ...usedWrongAnswers];
  const shuffled = shuffleArray(allChoices);
  const correctIndex = shuffled.indexOf(item.answer);

  return {
    summaryText: item.summaryText,
    choices: shuffled,
    correctIndex,
    explanation: item.explanation || "",
    difficulty: item.difficulty,
  };
}

export function buildSummaryQuestions(
  items: SummaryQuestion[]
): SummaryMultipleChoiceQuestion[] {
  const result: SummaryMultipleChoiceQuestion[] = [];
  for (const item of items) {
    const question = buildOneSummaryQuestion(item);
    if (question) {
      result.push(question);
    }
  }
  return result;
}

// ===== 여기부터 독해 문제(readingQuestions) 조립 함수 (신규) =====

// 독해 문제 하나가 조립된 후의 모양
export interface ReadingMultipleChoiceQuestion {
  type: string; // "주제" | "제목" | "분위기" | "요지" | "내용일치"
  choices: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

// 유형별 질문 문구는 AI가 아니라 코드가 고정으로 담당 (일관성 유지)
export function buildReadingQuestionPrompt(type: string): string {
  switch (type) {
    case "주제":
      return "이 글의 주제로 가장 알맞은 것은?";
    case "제목":
      return "이 글의 제목으로 가장 알맞은 것은?";
    case "분위기":
      return "이 글의 어조(분위기)로 가장 알맞은 것은?";
    case "요지":
      return "이 글의 요지로 가장 알맞은 것은?";
    case "내용일치":
      return "이 글의 내용과 일치하지 않는 것은?";
    default:
      return "다음 중 가장 알맞은 것은?";
  }
}

export function buildOneReadingQuestion(
  item: ReadingQuestion
): ReadingMultipleChoiceQuestion | null {
  if (!item.answer || !item.wrongAnswers || item.wrongAnswers.length === 0) {
    return null;
  }

  const usedWrongAnswers = item.wrongAnswers.slice(0, 4);
  const allChoices = [item.answer, ...usedWrongAnswers];
  const shuffled = shuffleArray(allChoices);
  const correctIndex = shuffled.indexOf(item.answer);

  return {
    type: item.type,
    choices: shuffled,
    correctIndex,
    explanation: item.explanation || "",
    difficulty: item.difficulty,
  };
}

export function buildReadingQuestions(
  items: ReadingQuestion[]
): ReadingMultipleChoiceQuestion[] {
  const result: ReadingMultipleChoiceQuestion[] = [];
  for (const item of items) {
    const question = buildOneReadingQuestion(item);
    if (question) {
      result.push(question);
    }
  }
  return result;
}