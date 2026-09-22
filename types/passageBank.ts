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
  answerLang?: "en" | "ko"; // 답변 언어. 없으면 영어 작문으로 간주 ("ko"는 "우리말로 쓰시오" 유형)
}

export interface PassageTags {
  vocab: string[]; // 어휘 목록
  grammar: string[]; // 어법 포인트 목록
  topic: string[]; // 주제 표현 목록
}

// 난이도 4단계 내부 값 (화면에는 한글로 표시)
export type PassageVariantLevel = "school" | "academy" | "advanced" | "prestudy";

export const VARIANT_LABELS: Record<PassageVariantLevel, string> = {
  school: "학교형",
  academy: "일반학원형",
  advanced: "상위학원형",
  prestudy: "선행형",
};

// 같은 주제 4단계 세트의 묶음 (passage_groups 테이블)
export interface PassageGroupRecord {
  id: string;
  user_id: string;
  title: string;
  level: string | null;
  topic: string | null;
  source_body: string;
  status: "pending" | "generating" | "completed" | "partial" | "failed";
  archived: boolean; // 보관함 이동 여부. true면 학교형/일반학원형/상위학원형/선행형 4개 전체가 보관된 것으로 취급.
  archived_at: string | null;
  created_at: string;
  updated_at: string;
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
  group_id?: string | null; // 4단계 세트 소속 (기존 단독 지문은 null)
  variant_level?: PassageVariantLevel | null;
  archived: boolean; // 단독 지문일 때만 의미 있음. 그룹 소속 지문은 항상 false(부모 그룹이 보관 상태를 관리).
  archived_at: string | null;
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
  group_id?: string | null;
  variant_level?: PassageVariantLevel | null;
  archived: boolean; // 단독 지문의 보관 여부
  archived_at: string | null;
  group_archived?: boolean | null; // group_id가 있을 때, 소속 묶음(passage_groups)의 보관 여부
  group_archived_at?: string | null;
  created_at: string;
  updated_at: string;
  question_count: number; // questions 배열 길이 (목록에서는 문제 내용 대신 개수만 내려준다)
  essay_count: number; // essays 배열 길이
}
