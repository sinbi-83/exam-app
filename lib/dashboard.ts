// 대시보드 (1단계 2026-10-27, 1차 조정 2026-10-28): 상단 지표·처리할 일·오늘 시간표 계산 규칙. DB 를 읽는 쪽은 lib/dashboardData.ts.
// 보여주기만 한다 (자료를 고치지 않음). 금액은 다루지 않고 사람 수·건수만 센다.
// 날짜는 한국 시간 기준 (Vercel 서버는 UTC 라서 new Date() 그대로 쓰면 아침 9시 전에는 어제가 된다).
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 에서 그대로 쓰기 위해).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// 한국 날짜 'YYYY-MM-DD'
export function kstDateString(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

// 'YYYY-MM-DD' + n일
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// 원비 화면(app/tuition)의 month_name 형식 'YYYY-MM'
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function distinctCount(ids: (string | null | undefined)[]): number {
  return new Set(ids.filter((id): id is string => !!id)).size
}

// 원비 화면과 같은 규칙: 이번 달 기록이 없는 학생도 미납, 부분납부도 미납 → 전체 학생 − 완납 학생
export function unpaidStudentCount(totalStudents: number, paidStudentIds: (string | null | undefined)[]): number {
  return Math.max(0, totalStudents - distinctCount(paidStudentIds))
}

// 대시보드 숫자를 누르면 그 학생들만 골라 보이는 처리 화면 주소 (1차 조정, 2026-10-28)
// 숙제관리·원비관리 화면이 ?view= 를 읽는다 (lib/homeworkView.ts, app/tuition).
export const HOMEWORK_OVERDUE_HREF = '/homework?view=overdue'
export const HOMEWORK_DUE_HREF = '/homework?view=due'
export const HOMEWORK_PENDING_HREF = '/homework?view=pending'
export const TUITION_UNPAID_HREF = '/tuition?view=unpaid'
export const REPORTS_DRAFT_HREF = '/reports?view=draft'
export const REPORTS_TO_SEND_HREF = '/reports?view=checked'
export const LEVEL_TESTS_UNREVIEWED_HREF = '/materials/level-tests#unreviewed'
export const GRADING_WAITING_HREF = '/grading#waiting'

export type DashboardCounts = {
  todayClasses: number
  homeworkDueStudents: number
  homeworkOverdueStudents: number
  // 마감 지남 + 오늘·내일 마감 (두 쪽에 다 있는 학생은 1명)
  homeworkPendingStudents: number
  tuitionUnpaidStudents: number
  // 아래 셋은 report-status-level-test-review-migration.sql 실행 뒤에만 셀 수 있다 → 전에는 null (항목 숨김)
  reportsDraft: number | null
  reportsToSend: number | null
  levelTestsUnreviewed: number | null
  // 시험 응시 대상 중 성적이 아직 없는 학생 (exam-assignments-migration.sql 실행 전에는 null)
  gradingWaiting: number | null
}

export type DashboardErrors = Partial<Record<keyof DashboardCounts, string>>

// 상단 지표 3칸 (관심 학생 칸은 3차 전까지 없음)
export type SummaryTile = {
  key: 'classes' | 'homework' | 'tuition'
  label: string
  count: number
  unit: string
  href: string
  error?: string
}

export function buildSummaryTiles(c: DashboardCounts, errors: DashboardErrors = {}): SummaryTile[] {
  return [
    { key: 'classes', label: '오늘 수업', count: c.todayClasses, unit: '개', href: '/schedule', error: errors.todayClasses },
    { key: 'homework', label: '숙제 미완료 (마감 지남·임박)', count: c.homeworkPendingStudents, unit: '명', href: HOMEWORK_PENDING_HREF, error: errors.homeworkPendingStudents },
    { key: 'tuition', label: '이번 달 원비 미납', count: c.tuitionUnpaidStudents, unit: '명', href: TUITION_UNPAID_HREF, error: errors.tuitionUnpaidStudents },
  ]
}

// 처리할 일 색: 마감 지남 = 빨강, 임박 = 중립, 원비 = 회색
export type TaskTone = 'danger' | 'neutral' | 'muted'

export type TaskItem = {
  key: 'homework_overdue' | 'homework_due' | 'grading_waiting' | 'level_tests_unreviewed' | 'reports_to_send' | 'reports_draft' | 'tuition_unpaid'
  label: string
  count: number
  unit: string
  href: string
  tone: TaskTone
  note?: string
  error?: string
}

// 처리할 게 있는 항목(또는 읽기 실패 항목)만, 급한 순서로. 셀 수 없는 항목(null)은 뺀다.
export function buildTaskItems(c: DashboardCounts, errors: DashboardErrors = {}): TaskItem[] {
  const all: TaskItem[] = [
    { key: 'homework_overdue', label: '마감 지난 숙제 미완료', count: c.homeworkOverdueStudents, unit: '명', href: HOMEWORK_OVERDUE_HREF, tone: 'danger', error: errors.homeworkOverdueStudents },
    { key: 'homework_due', label: '오늘·내일 마감 숙제 미완료', count: c.homeworkDueStudents, unit: '명', href: HOMEWORK_DUE_HREF, tone: 'neutral', error: errors.homeworkDueStudents },
    ...(c.gradingWaiting === null ? [] : [
      { key: 'grading_waiting' as const, label: '채점 대기', count: c.gradingWaiting, unit: '명', href: GRADING_WAITING_HREF, tone: 'neutral' as const, note: '시험을 봤는데 성적 입력 전', error: errors.gradingWaiting },
    ]),
    ...(c.levelTestsUnreviewed === null ? [] : [
      { key: 'level_tests_unreviewed' as const, label: '확인 안 한 레벨테스트 결과', count: c.levelTestsUnreviewed, unit: '건', href: LEVEL_TESTS_UNREVIEWED_HREF, tone: 'neutral' as const, error: errors.levelTestsUnreviewed },
    ]),
    ...(c.reportsToSend === null ? [] : [
      { key: 'reports_to_send' as const, label: '보낼 보고서', count: c.reportsToSend, unit: '건', href: REPORTS_TO_SEND_HREF, tone: 'neutral' as const, note: '확인 완료, 아직 안 보냄', error: errors.reportsToSend },
    ]),
    ...(c.reportsDraft === null ? [] : [
      { key: 'reports_draft' as const, label: '확인 전 보고서', count: c.reportsDraft, unit: '건', href: REPORTS_DRAFT_HREF, tone: 'neutral' as const, error: errors.reportsDraft },
    ]),
    { key: 'tuition_unpaid', label: '이번 달 원비 미납', count: c.tuitionUnpaidStudents, unit: '명', href: TUITION_UNPAID_HREF, tone: 'muted', note: '등록한 학생 전체 기준', error: errors.tuitionUnpaidStudents },
  ]
  return all.filter((i) => i.error || i.count > 0)
}

export type TodayEvent = {
  id: string
  title: string
  start_time: string | null
  end_time: string | null
  event_type: string
}

// 시작 시각 순, 시각 없는 일정은 맨 뒤 (같으면 제목 순)
export function sortTodayEvents<T extends TodayEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    if (a.start_time && b.start_time && a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time)
    if (a.start_time && !b.start_time) return -1
    if (!a.start_time && b.start_time) return 1
    return a.title.localeCompare(b.title)
  })
}

// '14:00:00' → '14:00'
export function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}
