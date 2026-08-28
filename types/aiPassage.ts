import { GradeLevel } from "@/config/questionTypes";

// 화면(프론트)에서 서버로 보내는 요청 데이터
export interface AiPassageRequestBody {
  gradeLevel: GradeLevel;
  topicKeyword: string;
}

// 문제 하나에 붙는 "상세 태그" - 전부 선택 항목입니다.
// 예전에 만들어진 데이터에는 이 필드 자체가 없을 수 있습니다.
export interface DetailTags {
  partOfSpeech?: string;    // 품사 (예: 동사, 형용사, 명사)
  grammarPoint?: string;    // 문법 포인트 (예: 수일치, 병렬구조, 동명사구 주어)
  vocabPoint?: string;      // 어휘 포인트 (예: 동의어 추론, 반의어 구분)
  readingPoint?: string;    // 독해 포인트 (예: 주제 파악, 세부사항 확인)
  thinkingType?: string;    // 사고 유형 (예: 뜻 추론, 이유 설명)
  answerFormat?: string;    // 답변 방식 (예: 객관식, 서술형, 빈칸)
  answerLanguage?: string;  // 답변 언어 (예: 한국어답변, 영어답변)
}

// 문제가 지문의 어느 부분에서 발췌되어야 하는지에 대한 정보 (전부 선택 항목)
export interface ExcerptInfo {
  excerptText?: string;
  sentenceNumbers?: number[];
  needsFullPassage?: boolean;
  canUsePartialExcerpt?: boolean;
}

// 지문 안에서 문제로 낼 부분 하나하나의 정보
export interface PassageHighlightItem {
  targetText: string;
  type: "vocab" | "grammar" | "reading" | "written" | "blank" | string;
  difficulty: "beginner" | "intermediate" | "advanced";
  answer: string;
  wrongAnswers: string[];
  explanation: string;
  // 아래는 상세 태그 확장 필드 (선택 항목, 예전 데이터엔 없을 수 있음)
  targetSentence?: string;
  sentenceNumber?: number;
  detailTags?: DetailTags;
  excerpt?: ExcerptInfo;
}

export interface AiPassageSuccessResponse {
  ok: true;
  data: {
    passage: string;
    translation: string;
    items: PassageHighlightItem[];
  };
}

export interface AiPassageErrorResponse {
  ok: false;
  errorType: "invalid_json" | "network" | "timeout" | "unknown";
  message: string;
}

export type AiPassageResponse = AiPassageSuccessResponse | AiPassageErrorResponse;