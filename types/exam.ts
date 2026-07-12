import { StyleParams } from "../config/stylePresets";
import { GradeLevel, QuestionConfigItem } from "../config/questionTypes";

export interface ExamQuestion {
  id: number;
  type: string;
  question: string;
  choices: string[]; // 서술형이면 빈 배열
  answer: string;
  explanation: string;
  isWrittenAnswer: boolean;
}

export interface ExamGenerationResult {
  passage: string;
  questions: ExamQuestion[];
}

export interface GenerateRequestBody {
  passage: string;
  stylePresetName: string | null; // 프리셋을 그대로 썼다면 이름, 수동 조정했으면 null
  styleParams: StyleParams;
  gradeLevel: GradeLevel;
  questionConfig: QuestionConfigItem[];
}

export interface GenerateSuccessResponse {
  ok: true;
  data: ExamGenerationResult;
}

export interface GenerateErrorResponse {
  ok: false;
  errorType: "invalid_json" | "network" | "timeout" | "unknown";
  message: string;
}

export type GenerateResponse = GenerateSuccessResponse | GenerateErrorResponse;
