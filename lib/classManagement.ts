// 반 관리 1단계 규칙 (class-management-migration.sql, docs/class-management-plan.md). DB 를 읽고 쓰는 쪽은 lib/classManagementData.ts.
// 이 파일은 gradeNormalize 외에 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 에서 그대로 쓰기 위해).

import { isGradeCode } from './gradeNormalize.ts'

export const NOT_READY_MESSAGE = '반 관리 준비 중(DB 적용 필요)'

export const STUDENT_STATUSES = ['active', 'paused', 'withdrawn'] as const
export type StudentStatus = (typeof STUDENT_STATUSES)[number]
export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = { active: '재원', paused: '휴원', withdrawn: '퇴원' }

export function isStudentStatus(value: unknown): value is StudentStatus {
  return typeof value === 'string' && (STUDENT_STATUSES as readonly string[]).includes(value)
}

// 상태 칸이 없을 때(SQL 적용 전) 읽은 학생은 지금까지처럼 모두 재원으로 본다
export function studentStatusOf(student: { status?: string | null }): StudentStatus {
  return isStudentStatus(student.status) ? student.status : 'active'
}

// SQL 적용 전에 Supabase 가 주는 오류: 표 없음 / 칸 없음 / 함수 없음.
// ⚠️ head 조회는 표가 없어도 오류가 없고(204), 칸이 없을 때는 코드가 비어 있다 (2026-11-01 실제 DB 로 확인) → 준비 여부는 일반 조회로 확인한다.
export function isSchemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (['42P01', 'PGRST205', '42703', 'PGRST204', '42883', 'PGRST202'].includes(error.code ?? '')) return true
  return /column .* does not exist|Could not find the .* column|Could not find the table|relation .* does not exist|Could not find the function/i.test(error.message ?? '')
}

// 실제로 있는 날짜인지까지 본다 ('2026-02-30' 은 거짓)
export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] // weekday 1=월 ~ 7=일

export type ScheduleInput = { weekday: number; start_time: string; end_time: string }

// '월 16:00~17:00'
export function formatSchedule(s: ScheduleInput): string {
  return `${WEEKDAY_LABELS[s.weekday - 1] ?? '?'} ${s.start_time.slice(0, 5)}~${s.end_time.slice(0, 5)}`
}

function parseTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

export function parseSchedules(value: unknown): { ok: true; schedules: ScheduleInput[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: '요일·시간 형식이 올바르지 않습니다.' }
  const schedules: ScheduleInput[] = []
  for (const row of value as { weekday?: unknown; start_time?: unknown; end_time?: unknown }[]) {
    const weekday = Number(row?.weekday)
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return { ok: false, error: '요일을 골라 주세요.' }
    const start = parseTime(row?.start_time)
    const end = parseTime(row?.end_time)
    if (!start || !end) return { ok: false, error: '시작·끝 시간을 입력해 주세요.' }
    if (end <= start) return { ok: false, error: '끝 시간은 시작 시간보다 늦어야 합니다.' }
    schedules.push({ weekday, start_time: start, end_time: end })
  }
  return { ok: true, schedules }
}

export type ClassFieldsInput = { name?: unknown; target_grades?: unknown; teacher_name?: unknown; note?: unknown }
export type ClassFields = { name?: string; target_grades?: string[]; teacher_name?: string | null; note?: string | null }

// partial = true 면 보낸 칸만 고친다 (수정), false 면 이름이 꼭 있어야 한다 (만들기)
export function parseClassFields(body: ClassFieldsInput, partial: boolean): { ok: true; fields: ClassFields } | { ok: false; error: string } {
  const fields: ClassFields = {}
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return { ok: false, error: '반 이름을 입력해 주세요.' }
    fields.name = name
  }
  if (!partial || body.target_grades !== undefined) {
    const grades = body.target_grades ?? []
    if (!Array.isArray(grades) || !grades.every(isGradeCode)) return { ok: false, error: '대상 학년은 초3~고3 중에서 골라 주세요.' }
    fields.target_grades = [...new Set(grades as string[])]
  }
  if (!partial || body.teacher_name !== undefined) fields.teacher_name = typeof body.teacher_name === 'string' && body.teacher_name.trim() ? body.teacher_name.trim() : null
  if (!partial || body.note !== undefined) fields.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
  return { ok: true, fields }
}

export type Membership = { id?: string; class_id: string; student_id: string; joined_on: string; left_on: string | null }

// 부분 고유 조건(class_students_one_open)과 같은 규칙: 같은 반에 left_on 이 빈 행은 학생당 하나.
// 이미 들어 있는 학생은 건너뛴다. 나갔던 학생은 새 행으로 다시 넣는다. 같은 학생을 두 번 보내도 한 번만.
export function planMemberAdds(current: Pick<Membership, 'student_id' | 'left_on'>[], studentIds: string[]): { add: string[]; alreadyIn: string[] } {
  const open = new Set(current.filter((m) => m.left_on === null).map((m) => m.student_id))
  const wanted = [...new Set(studentIds)]
  return { add: wanted.filter((id) => !open.has(id)), alreadyIn: wanted.filter((id) => open.has(id)) }
}

// 빼기·옮기기: 나간 날은 들어온 날보다 빠를 수 없다 (left_on >= joined_on 검사와 같은 규칙)
export function leaveDateProblem(leftOn: string, openMemberships: Pick<Membership, 'joined_on'>[]): string | null {
  const latest = openMemberships.reduce((max, m) => (m.joined_on > max ? m.joined_on : max), '')
  return latest && leftOn < latest ? `날짜는 들어온 날(${latest}) 이후여야 합니다.` : null
}

export type StudentForOverview = { id: string; status?: string | null }
export type ClassForOverview = { id: string; name: string; status: string }
export type ClassHeadcount = { id: string; name: string; active: number; paused: number }

export type ClassOverview = {
  activeStudents: number
  pausedStudents: number
  withdrawnStudents: number
  // 운영 중인 반에 소속이 없는 재원 학생
  studentsWithoutClass: number
  // 운영 중인 반만. 퇴원 학생은 세지 않는다.
  classes: ClassHeadcount[]
}

export function buildClassOverview(students: StudentForOverview[], classes: ClassForOverview[], memberships: Pick<Membership, 'class_id' | 'student_id' | 'left_on'>[]): ClassOverview {
  const statusById = new Map(students.map((s) => [s.id, studentStatusOf(s)]))
  const running = classes.filter((c) => c.status === 'active')
  const runningIds = new Set(running.map((c) => c.id))
  const open = memberships.filter((m) => m.left_on === null && runningIds.has(m.class_id))
  const inClass = new Set(open.map((m) => m.student_id))
  const countIn = (classId: string, status: StudentStatus) => new Set(open.filter((m) => m.class_id === classId && statusById.get(m.student_id) === status).map((m) => m.student_id)).size
  const statuses = [...statusById.values()]
  return {
    activeStudents: statuses.filter((s) => s === 'active').length,
    pausedStudents: statuses.filter((s) => s === 'paused').length,
    withdrawnStudents: statuses.filter((s) => s === 'withdrawn').length,
    studentsWithoutClass: [...statusById].filter(([id, status]) => status === 'active' && !inClass.has(id)).length,
    classes: running.map((c) => ({ id: c.id, name: c.name, active: countIn(c.id, 'active'), paused: countIn(c.id, 'paused') })),
  }
}

// 학생 삭제 전 확인할 표 (docs/class-management-review.md 3장). 기록이 하나라도 있으면 삭제하지 않고 퇴원 처리를 안내한다.
export const STUDENT_RECORD_TABLES: { table: string; label: string }[] = [
  { table: 'attendance', label: '출석' },
  { table: 'homework', label: '숙제' },
  { table: 'tuition_records', label: '원비' },
  { table: 'parent_notifications', label: '알림' },
  { table: 'exam_assignments', label: '응시 대상' },
  { table: 'exam_results', label: '성적' },
  { table: 'wrong_answer_records', label: '오답' },
  { table: 'reports', label: '보고서' },
  { table: 'level_test_results', label: '레벨테스트' },
  { table: 'class_students', label: '반 소속' },
]

export type RecordCount = { label: string; count: number }

export function studentDeleteBlockedMessage(records: RecordCount[], canWithdraw: boolean): string {
  const list = records.map((r) => `${r.label} ${r.count}건`).join(', ')
  return `연결된 기록이 있어 삭제할 수 없습니다 (${list}). ${canWithdraw ? '퇴원 처리를 해 주세요.' : '퇴원 처리는 반 관리 DB 적용 뒤에 쓸 수 있습니다.'}`
}
