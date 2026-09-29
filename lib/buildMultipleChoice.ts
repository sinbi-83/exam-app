import { SummaryQuestion, ReadingQuestion } from "@/types/aiPassage";
import { buildBlankStem, buildFindErrorStem } from "@/lib/grammarLeak";

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
  // grammar 전용: blank(빈칸형) / find_error(밑줄 ①~⑤ 중 틀린 것) — lib/grammarLeak.ts
  grammarFormat?: "blank" | "find_error";
  errorSentence?: string;
  segments?: string[];
  wrongIndex?: number;
  correction?: string;
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
  // grammar: 시험지에 쓸 문제 문장 (빈칸형·틀린 것 찾기). 정답이 드러나지 않는 형식만
  grammarFormat?: "blank" | "find_error";
  stem?: string;
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

  // 어법: 정답이 드러나지 않는 두 형식만 (예전 "밑줄 친 (정답)" 형식은 만들지 않는다 — lib/grammarLeak.ts)
  if (item.type === "grammar") {
    if (item.grammarFormat === "find_error") {
      const segments = item.segments ?? [];
      const stem = item.errorSentence ? buildFindErrorStem(item.errorSentence, segments) : null;
      const wi = item.wrongIndex;
      if (!stem || typeof wi !== "number" || wi < 0 || wi > 4) return null;
      return {
        targetText: segments[wi],
        type: item.type,
        difficulty: item.difficulty,
        choices: segments, // ①~⑤ 순서 그대로 (섞지 않는다)
        correctIndex: wi,
        explanation: item.explanation || "",
        detailTags: item.detailTags,
        grammarFormat: "find_error",
        stem,
      };
    }
    if (item.grammarFormat !== "blank") return null;
    const stem = item.targetSentence ? buildBlankStem(item.targetSentence, item.targetText) : null;
    if (!stem) return null;
    const choices = shuffleArray([item.answer, ...item.wrongAnswers.slice(0, 4)]);
    return {
      targetText: item.targetText,
      type: item.type,
      difficulty: item.difficulty,
      choices,
      correctIndex: choices.indexOf(item.answer),
      explanation: item.explanation || "",
      targetSentence: item.targetSentence,
      sentenceNumber: item.sentenceNumber,
      detailTags: item.detailTags,
      excerpt: item.excerpt,
      grammarFormat: "blank",
      stem,
    };
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