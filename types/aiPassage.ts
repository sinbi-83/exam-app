import { GradeLevel } from "@/config/questionTypes";

// 화면(프론트)에서 서버로 보내는 요청 데이터
export interface AiPassageRequestBody {
  gradeLevel: GradeLevel; // 학년 (기존 타입 재사용)
  topicKeyword: string;   // 주제 키워드 (예: "환경 보호")
}

// 지문 안에서 문제로 낼 부분 하나하나의 정보
export interface PassageHighlightItem {
  targetText: string;                                  // 지문에서 찾을 정확한 단어/구절
  type: "vocab" | "grammar";                            // 어휘 문제인지 어법 문제인지
  difficulty: "beginner" | "intermediate" | "advanced"; // 쉬움 / 보통 / 어려움
  answer: string;                                       // 정답
  wrongAnswers: string[];                               // 오답 보기 (1~3개, 개수 유동적)
}

// 서버가 성공적으로 만들어서 돌려주는 데이터
export interface AiPassageSuccessResponse {
  ok: true;
  data: {
    passage: string;                  // AI가 새로 만든 지문 전체
    items: PassageHighlightItem[];    // 지문 속 하이라이트 포인트 목록
  };
}

// 서버에서 문제가 생겼을 때 돌려주는 데이터
export interface AiPassageErrorResponse {
  ok: false;
  errorType: "invalid_json" | "network" | "timeout" | "unknown";
  message: string; // 화면에 보여줄 에러 메시지
}

// 성공 또는 실패, 둘 중 하나의 모양
export type AiPassageResponse = AiPassageSuccessResponse | AiPassageErrorResponse;