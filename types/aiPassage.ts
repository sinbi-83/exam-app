import { GradeLevel } from "@/config/questionTypes";

// 화면(프론트)에서 서버로 보내는 요청 데이터
export interface AiPassageRequestBody {
  gradeLevel: GradeLevel;
  topicKeyword: string;
}

// 문제 하나에 붙는 "상세 태그" - 전부 선택 항목입니다.
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

// 지문을 문장 단위로 쪼갠 것 하나
export interface PassageSentence {
  id: string;
  text: string;
}

// 서술형 문제의 채점 기준 한 줄
export interface EssayRubricItem {
  criteria: string;
  points: number;
}

// 서술형 문제 후보 하나
export interface EssayQuestion {
  id: string;
  scope: "excerpt" | "full";
  sourceSentenceIds: string[];
  type: string; // "어법고쳐쓰기" | "조건영작" | "지칭추론" | "해석" | "배열영작" | "생략구문찾기"
  level: "beginner" | "intermediate" | "advanced";
  prompt: string;
  conditions?: string;
  wordBank?: string[]; // "배열영작" 유형일 때만 사용 (재료 단어/구, 무작위 순서로 제공)
  modelAnswer: string;
  rubric: EssayRubricItem[];
  partialCreditNotes?: string;
  answerLines?: number;
}

// 지문요약 빈칸채우기 문제 (객관식, 지문 전체를 보고 푸는 유형)
export interface SummaryQuestion {
  id: string;
  summaryText: string; // 빈칸은 "_____" 로 표시됨
  answer: string;
  wrongAnswers: string[];
  explanation: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

// 독해 문제 하나 (지문 전체를 보고 푸는 유형: 주제/제목/분위기/요지/내용일치)
export interface ReadingQuestion {
  id: string;
  type: "주제" | "제목" | "분위기" | "요지" | "내용일치";
  answer: string;
  wrongAnswers: string[];
  explanation: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface AiPassageSuccessResponse {
  ok: true;
  data: {
    passage: string;
    translation: string;
    items: PassageHighlightItem[];
    sentences?: PassageSentence[];
    essayQuestions?: EssayQuestion[];
    summaryQuestions?: SummaryQuestion[];
    readingQuestions?: ReadingQuestion[];
  };
}

export interface AiPassageErrorResponse {
  ok: false;
  errorType: "invalid_json" | "network" | "timeout" | "unknown";
  message: string;
}

export type AiPassageResponse = AiPassageSuccessResponse | AiPassageErrorResponse;