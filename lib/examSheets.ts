import { ExamGenerationResult } from "@/types/exam";
import { StyleParams } from "@/config/stylePresets";
import { GradeLevel, QuestionConfigItem } from "@/config/questionTypes";

export interface ExamSheetRow {
  id: string;
  created_at: string;
  title: string;
  style_preset: string | null;
  style_params: StyleParams;
  grade_level: GradeLevel;
  question_config: QuestionConfigItem[];
  questions_data: ExamGenerationResult;
}

function buildAutoTitle(
  gradeLevel: GradeLevel,
  stylePresetName: string | null
): string {
  const today = new Date().toISOString().slice(0, 10);
  const styleLabel = stylePresetName ? `${stylePresetName}형` : "커스텀형";
  return `${today} ${gradeLevel} ${styleLabel} 독해`;
}

export async function saveExamSheet(params: {
  stylePresetName: string | null;
  styleParams: StyleParams;
  gradeLevel: GradeLevel;
  questionConfig: QuestionConfigItem[];
  result: ExamGenerationResult;
}) {
  const title = buildAutoTitle(params.gradeLevel, params.stylePresetName);

  try {
    const res = await fetch("/api/exam-sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        style_preset: params.stylePresetName,
        style_params: params.styleParams,
        grade_level: params.gradeLevel,
        question_config: params.questionConfig,
        questions_data: params.result,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      // 저장 실패해도 화면에 이미 생성된 결과는 계속 보여줄 수 있도록,
      // 여기서는 에러를 던지지 않고 콘솔에만 남깁니다.
      console.error("exam_sheets 저장 실패:", json.error);
      return null;
    }
    return json.data as ExamSheetRow;
  } catch (err) {
    console.error("exam_sheets 저장 실패:", err);
    return null;
  }
}

export async function listExamSheets(): Promise<ExamSheetRow[]> {
  try {
    const res = await fetch("/api/exam-sheets");
    const json = await res.json();
    if (!res.ok) {
      console.error("exam_sheets 목록 조회 실패:", json.error);
      return [];
    }
    return json.data as ExamSheetRow[];
  } catch (err) {
    console.error("exam_sheets 목록 조회 실패:", err);
    return [];
  }
}

export async function getExamSheetById(id: string): Promise<ExamSheetRow | null> {
  try {
    const res = await fetch(`/api/exam-sheets/${id}`);
    const json = await res.json();
    if (!res.ok) {
      console.error("exam_sheets 상세 조회 실패:", json.error);
      return null;
    }
    return json.data as ExamSheetRow;
  } catch (err) {
    console.error("exam_sheets 상세 조회 실패:", err);
    return null;
  }
}
