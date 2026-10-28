// 시험 응시 대상 (exam-assignments-migration.sql). 채점 여부는 저장하지 않고
// 같은 시험·학생의 성적(exam_results) 기록이 있는지로 판단한다.
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (scripts/ 에서 그대로 쓰기 위해).

export type ExamAssignment = { id?: string; exam_id: string; student_id: string; absent: boolean }

// graded = 성적 있음 / absent = 결석 / waiting = 채점 대기 (시험일이 오늘이거나 지남, 또는 날짜 없음) / upcoming = 시험 전
export type AssignmentStatus = 'graded' | 'absent' | 'waiting' | 'upcoming'

export type ResultKeyRow = { exam_id: string | null; student_id: string | null }

export function resultKey(examId: string, studentId: string): string {
  return `${examId}:${studentId}`
}

export function gradedKeys(results: ResultKeyRow[]): Set<string> {
  const keys = new Set<string>()
  for (const r of results) if (r.exam_id && r.student_id) keys.add(resultKey(r.exam_id, r.student_id))
  return keys
}

export function assignmentStatus(a: ExamAssignment, examDate: string | null, graded: Set<string>, today: string): AssignmentStatus {
  if (graded.has(resultKey(a.exam_id, a.student_id))) return 'graded'
  if (a.absent) return 'absent'
  if (examDate && examDate > today) return 'upcoming'
  return 'waiting'
}

export type ExamProgress = { total: number; graded: number; waiting: number; absent: number; upcoming: number }

export function examProgress(assignments: ExamAssignment[], examDate: string | null, graded: Set<string>, today: string): ExamProgress {
  const p: ExamProgress = { total: assignments.length, graded: 0, waiting: 0, absent: 0, upcoming: 0 }
  for (const a of assignments) p[assignmentStatus(a, examDate, graded, today)]++
  return p
}

// 대시보드 "채점 대기" = 모든 시험의 채점 대기 학생 수 (한 학생이 두 시험이면 2)
export function waitingCount(
  assignments: ExamAssignment[],
  examDates: Map<string, string | null>,
  graded: Set<string>,
  today: string,
): number {
  return assignments.filter((a) => examDates.has(a.exam_id) && assignmentStatus(a, examDates.get(a.exam_id) ?? null, graded, today) === 'waiting').length
}

// 응시 대상 다시 고르기: 새로 넣을 학생 / 뺄 학생
export function diffAssignees(current: string[], next: string[]): { add: string[]; remove: string[] } {
  const cur = new Set(current)
  const nxt = new Set(next)
  return { add: [...nxt].filter((id) => !cur.has(id)), remove: [...cur].filter((id) => !nxt.has(id)) }
}

export function isTableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || (error.message ?? '').includes('exam_assignments')
}
