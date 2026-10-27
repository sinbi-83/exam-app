// 대시보드 1단계: 서버에서 "오늘 할 일" 숫자를 한 번에 모아 읽는다 (모두 동시에, 읽기만).
// 건수는 head 조회(행을 가져오지 않음)로 세고, 학생 수를 세야 하는 곳만 student_id 한 칸을
// selectAllPages 로 나눠 읽는다 (1,000행 제한, lib/supabasePaging.ts).
// 새 표·마이그레이션 없음: schedule_events / homework / students / tuition_records / level_test_results.

import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages } from '@/lib/supabasePaging'
import {
  addDays,
  distinctCount,
  kstDateString,
  monthOf,
  unpaidStudentCount,
  type DashboardCounts,
  type DashboardErrors,
} from '@/lib/dashboard'

type StudentIdRow = { student_id: string | null }

export async function loadDashboardCounts(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ today: string; counts: DashboardCounts; errors: DashboardErrors }> {
  const today = kstDateString(now)
  const tomorrow = addDays(today, 1)
  const month = monthOf(today)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [classes, due, overdue, students, paid, levelTests] = await Promise.all([
    supabase
      .from('schedule_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_date', today)
      .eq('event_type', 'class'),
    selectAllPages<StudentIdRow>((from, to) =>
      supabase
        .from('homework')
        .select('student_id')
        .eq('user_id', userId)
        .eq('status', 'assigned')
        .gte('due_date', today)
        .lte('due_date', tomorrow)
        .order('id')
        .range(from, to),
    ),
    selectAllPages<StudentIdRow>((from, to) =>
      supabase
        .from('homework')
        .select('student_id')
        .eq('user_id', userId)
        .eq('status', 'assigned')
        .lt('due_date', today)
        .order('id')
        .range(from, to),
    ),
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    selectAllPages<StudentIdRow>((from, to) =>
      supabase
        .from('tuition_records')
        .select('student_id')
        .eq('user_id', userId)
        .eq('month_name', month)
        .eq('status', 'paid')
        .order('id')
        .range(from, to),
    ),
    supabase
      .from('level_test_results')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('taken_at', weekAgo),
  ])

  const errors: DashboardErrors = {}
  const fail = '불러오지 못했어요'
  if (classes.error) errors.todayClasses = fail
  if (due.error) errors.homeworkDueStudents = fail
  if (overdue.error) errors.homeworkOverdueStudents = fail
  if (students.error || paid.error) errors.tuitionUnpaidStudents = fail
  // 레벨테스트 표를 아직 만들지 않은 경우 (level-test-results-migration.sql 미실행)
  if (levelTests.error) errors.levelTestsLast7Days = fail

  return {
    today,
    counts: {
      todayClasses: classes.count ?? 0,
      homeworkDueStudents: distinctCount(due.data.map((r) => r.student_id)),
      homeworkOverdueStudents: distinctCount(overdue.data.map((r) => r.student_id)),
      tuitionUnpaidStudents: unpaidStudentCount(students.count ?? 0, paid.data.map((r) => r.student_id)),
      levelTestsLast7Days: levelTests.count ?? 0,
    },
    errors,
  }
}
