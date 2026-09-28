// 시험 종류 (exams.exam_type). 당분간 'problem' / 'word' 두 값만 쓴다 (설계도 B-6).
// 시험 목적(Placement 등)·내용 영역·응답 방식은 다른 축이므로 이 칸에 넣지 않는다.
// 1단계 migration 이전에 만든 시험은 값이 비어 있을 수 있다 → 문항 구성으로 추론한다 (lib/wordTest.ts isWordTestExam 과 같은 기준).
// 이 파일은 다른 모듈을 런타임 import 하지 않는다.

export type ExamType = 'problem' | 'word'

export const EXAM_TYPES: readonly ExamType[] = ['problem', 'word']

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  problem: '문제 시험',
  word: '단어 시험',
}

export function isExamType(value: unknown): value is ExamType {
  return value === 'problem' || value === 'word'
}

// 문항 구성으로 추론: 문항이 있고 전부 type 'word' 이면 단어 시험, 그 밖(빈 시험 포함)은 문제 시험
export function inferExamType(questions: { question_data: { type?: string } }[]): ExamType {
  return questions.length > 0 && questions.every((q) => q.question_data.type === 'word') ? 'word' : 'problem'
}

// 저장된 값이 있으면 그 값, 없으면 추론
export function resolveExamType(examType: string | null | undefined, questions: { question_data: { type?: string } }[]): ExamType {
  return isExamType(examType) ? examType : inferExamType(questions)
}
