// 학년 표기 통일: "중2", "중학교 2학년", "중등 2" 같은 글자를 학년 코드(초3~고3)로 바꾼다.
// students.grade 는 자유 글자라 반의 대상 학년(classes.target_grades)과 맞춰 볼 때 쓴다. 저장된 글자는 바꾸지 않는다.
// 코드로 바꿀 수 없으면 null ("2학년"처럼 학교급이 없는 표기, "예비 중1", 초1·초2 등). 추측하지 않는다.
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 에서 그대로 쓰기 위해).

export const GRADE_CODES = ['초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3'] as const
export type GradeCode = (typeof GRADE_CODES)[number]

const SCHOOL_LEVELS: Record<string, '초' | '중' | '고'> = {
  초: '초', 초등: '초', 초등학교: '초', 초등학생: '초',
  중: '중', 중등: '중', 중학: '중', 중학교: '중', 중학생: '중',
  고: '고', 고등: '고', 고교: '고', 고등학교: '고', 고등학생: '고',
}
const KOREAN_NUMBERS: Record<string, string> = { 일: '1', 이: '2', 삼: '3', 사: '4', 오: '5', 육: '6' }

export function isGradeCode(value: unknown): value is GradeCode {
  return typeof value === 'string' && (GRADE_CODES as readonly string[]).includes(value)
}

export function normalizeGrade(raw: string | null | undefined): GradeCode | null {
  if (!raw) return null
  const text = raw.normalize('NFKC').replace(/\s+/g, '')
  const match = /^([가-힣]+?)([1-6일이삼사오육])(?:학년)?$/.exec(text)
  if (!match) return null
  const level = SCHOOL_LEVELS[match[1]]
  if (!level) return null
  const code = `${level}${KOREAN_NUMBERS[match[2]] ?? match[2]}`
  return isGradeCode(code) ? code : null
}

export type GradeWarningReason = 'not_target' | 'unknown_grade'
export type GradeWarning<T> = { student: T; reason: GradeWarningReason }

// 반에 넣을 학생 중 대상 학년이 아닌 학생 (막지 않고 경고만). 대상 학년을 정하지 않은 반은 경고 없음.
export function gradeWarnings<T extends { grade?: string | null }>(students: T[], targetGrades: readonly string[]): GradeWarning<T>[] {
  if (targetGrades.length === 0) return []
  const warnings: GradeWarning<T>[] = []
  for (const student of students) {
    const code = normalizeGrade(student.grade)
    if (!code) warnings.push({ student, reason: 'unknown_grade' })
    else if (!targetGrades.includes(code)) warnings.push({ student, reason: 'not_target' })
  }
  return warnings
}
