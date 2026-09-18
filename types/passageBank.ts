// 외부지문저장소 기능에서 사용하는 타입들.
// 이 기능은 AI API를 호출하지 않는다 — 지문/문제는 미리 만들어 add-passage.ts로
// Supabase에 저장해두고, 화면은 그 저장된 데이터를 읽기/수정/삭제/인쇄만 한다.

export interface PassageMultipleChoice {
  type: "mc";
  q: string;
  choices: string[]; // 5지선다
  answer: string;
  explanation: string;
}

export interface PassageBlankQuestion {
  type: "blank";
  q: string;
  answer: string;
  explanation: string;
}

export interface PassageTrueFalseQuestion {
  type: "tf";
  q: string;
  answer: boolean;
  explanation: string;
}

export interface PassageOrderQuestion {
  type: "order";
  items: string[];
  answer: string[];
}

export interface PassageMatchQuestion {
  type: "match";
  pairs: { word: string; meaning: string }[];
}

export type PassageQuestion =
  | PassageMultipleChoice
  | PassageBlankQuestion
  | PassageTrueFalseQuestion
  | PassageOrderQuestion
  | PassageMatchQuestion;

export interface PassageEssay {
  q: string;
  wordLimit: number;
  sampleAnswer: string;
  rubric: string;
}

export interface PassageTags {
  vocab: string[]; // 어휘 목록
  grammar: string[]; // 어법 포인트 목록
  topic: string[]; // 주제 표현 목록
}

// data/passages/*.json 에 저장하는 원본 입력 형식.
// scripts/add-passage.ts 가 이 형식을 읽어 그대로 passages 테이블에 넣는다.
export interface PassageInput {
  title: string;
  level: string; // 예: "중1" ~ "고3"
  topic: string;
  body: string; // 지문 원문 (마크업 없음)
  tagged_body: string; // {{v:단어}} {{g:구문|설명}} {{t:구문}} 마크업 포함
  tags: PassageTags;
  questions: PassageQuestion[]; // 20개 (mc 10 + blank 5 + tf 3 + order 1 + match 1)
  essays: PassageEssay[]; // 5개
}

// Supabase passages 테이블 레코드
export interface PassageRecord extends PassageInput {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// 목록 화면에서 쓰는 요약본
export interface PassageSummary {
  id: string;
  title: string;
  level: string;
  topic: string;
  tags: PassageTags;
  created_at: string;
  updated_at: string;
}
