// 대시보드 1단계 (2026-10-27): "오늘 할 일" 계산 규칙. DB 를 읽는 쪽은 lib/dashboardData.ts.
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

export type DashboardItem = {
  key: 'classes' | 'homework_due' | 'homework_overdue' | 'tuition_unpaid' | 'level_tests'
  label: string
  count: number
  unit: string
  href: string
  // 숫자가 있으면 눈에 띄게 보여줄지 (참고 정보는 false)
  urgent: boolean
  note?: string
  // 표가 없거나 읽기에 실패하면 숫자 대신 안내
  error?: string
}

export type DashboardCounts = {
  todayClasses: number
  homeworkDueStudents: number
  homeworkOverdueStudents: number
  tuitionUnpaidStudents: number
  levelTestsLast7Days: number
}

export type DashboardErrors = Partial<Record<keyof DashboardCounts, string>>

export function buildDashboardItems(c: DashboardCounts, errors: DashboardErrors = {}): DashboardItem[] {
  return [
    { key: 'classes', label: '오늘 수업', count: c.todayClasses, unit: '개', href: '/schedule', urgent: true, error: errors.todayClasses },
    { key: 'homework_due', label: '오늘·내일 마감 숙제 미완료', count: c.homeworkDueStudents, unit: '명', href: '/homework', urgent: true, error: errors.homeworkDueStudents },
    { key: 'homework_overdue', label: '마감 지난 숙제 미완료', count: c.homeworkOverdueStudents, unit: '명', href: '/homework', urgent: true, error: errors.homeworkOverdueStudents },
    { key: 'tuition_unpaid', label: '이번 달 원비 미납', count: c.tuitionUnpaidStudents, unit: '명', href: '/tuition', urgent: true, note: '등록한 학생 전체 기준', error: errors.tuitionUnpaidStudents },
    { key: 'level_tests', label: '최근 7일 레벨테스트 응시', count: c.levelTestsLast7Days, unit: '건', href: '/materials/level-tests', urgent: false, note: '참고', error: errors.levelTestsLast7Days },
  ]
}

// 처리할 게 있는 급한 항목 → 위에 크게, 0건·참고 항목 → 아래에 작게
export function splitByAttention(items: DashboardItem[]): { attention: DashboardItem[]; quiet: DashboardItem[] } {
  const needs = (i: DashboardItem) => !i.error && i.count > 0 && i.urgent
  return { attention: items.filter(needs), quiet: items.filter((i) => !needs(i)) }
}
