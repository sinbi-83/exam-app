// 문제 유형을 한 곳에서 관리합니다.
// 나중에 유형을 추가/삭제할 때는 이 배열만 수정하면 UI, 프롬프트, 검증 로직에 모두 반영됩니다.

export type QuestionTypeKey =
  | "topic"
  | "blank"
  | "content_match"
  | "grammar_error"
  | "sentence_insert"
  | "order"
  | "vocab_inference"
  | "sentence_structure"
  | "written_answer";

export interface QuestionTypeDef {
  key: QuestionTypeKey;
  label: string; // 화면에 표시될 한글 라벨
  isWrittenAnswer: boolean; // 서술형 여부 (choices 유무 결정)
}

export const QUESTION_TYPES: QuestionTypeDef[] = [
  { key: "topic", label: "주제/제목/요지 찾기", isWrittenAnswer: false },
  { key: "blank", label: "빈칸추론", isWrittenAnswer: false },
  { key: "content_match", label: "내용일치", isWrittenAnswer: false },
  { key: "grammar_error", label: "어법 오류 찾기", isWrittenAnswer: false },
  { key: "sentence_insert", label: "문장 삽입", isWrittenAnswer: false },
  { key: "order", label: "순서 배열", isWrittenAnswer: false },
  { key: "vocab_inference", label: "어휘 추론", isWrittenAnswer: false },
  { key: "sentence_structure", label: "문장성분 분석", isWrittenAnswer: false },
  { key: "written_answer", label: "서술형(우리말 서술)", isWrittenAnswer: true },
];

export const GRADE_LEVELS = [
  "초등고학년",
  "중1",
  "중2",
  "중3",
  "고1",
  "고2",
  "고3",
] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number];

// 화면에서 사용자가 선택한 값의 형태
export interface QuestionConfigItem {
  type: QuestionTypeKey;
  count: number;
}
