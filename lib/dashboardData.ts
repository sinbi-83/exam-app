// 대시보드: 서버에서 상단 지표·처리할 일 숫자와 오늘 시간표를 한 번에 모아 읽는다 (모두 동시에, 읽기만).
// 건수는 head 조회(행을 가져오지 않음)로 세고, 학생 수를 세야 하는 곳만 student_id 한 칸을
// selectAllPages 로 나눠 읽는다 (1,000행 제한, lib/supabasePaging.ts).
// 읽는 표: schedule_events / homework / students / tuition_records / reports / level_test_results / exam_assignments·exams·exam_results.
// 보고서 상태·레벨테스트 확인 칸은 report-status-level-test-review-migration.sql 실행 뒤에만 있다 → 없으면 그 항목만 숨김.
// (최근 7일 레벨테스트 건수는 1차 조정에서 뺐다, 2026-10-28)

import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages } from '@/lib/supabasePaging'
import { isColumnMissing } from '@/lib/reportStatus'
import { gradedKeys, isTableMissing as isAssignTableMissing, waitingCount, type ExamAssignment, type ResultKeyRow } from '@/lib/examAssignments'
import {
  addDays,
  distinctCount,
  kstDateString,
  monthOf,
  sortTodayEvents,
  unpaidStudentCount,
  type DashboardCounts,
  type DashboardErrors,
  type TodayEvent,
} from '@/lib/dashboard'

type StudentIdRow = { student_id: string | null }

export async function loadDashboardCounts(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<{
  today: string
  counts: DashboardCounts
  errors: DashboardErrors
  events: TodayEvent[]
  eventsError?: string
}> {
  const today = kstDateString(now)
  const tomorrow = addDays(today, 1)
  const month = monthOf(today)

  const [events, due, overdue, students, paid, reportsDraft, reportsToSend, levelUnreviewed, assigns, examRows, resultRows] = await Promise.all([
    // 오늘 일정 전부 (시간표용) — 하루치라 몇 줄 안 된다
    supabase
      .from('schedule_events')
      .select('id, title, start_time, end_time, event_type')
      .eq('user_id', userId)
      .eq('event_date', today),
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
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'draft'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'checked'),
    supabase.from('level_test_results').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('reviewed_at', null),
    selectAllPages<ExamAssignment>((from, to) =>
      supabase.from('exam_assignments').select('exam_id, student_id, absent').eq('user_id', userId).order('id').range(from, to),
    ),
    selectAllPages<{ id: string; exam_date: string | null }>((from, to) =>
      supabase.from('exams').select('id, exam_date').eq('user_id', userId).order('id').range(from, to),
    ),
    selectAllPages<ResultKeyRow>((from, to) =>
      supabase.from('exam_results').select('exam_id, student_id').eq('user_id', userId).not('exam_id', 'is', null).order('id').range(from, to),
    ),
  ])

  const errors: DashboardErrors = {}
  const fail = '불러오지 못했어요'
  if (events.error) errors.todayClasses = fail
  if (due.error) errors.homeworkDueStudents = fail
  if (overdue.error) errors.homeworkOverdueStudents = fail
  if (due.error || overdue.error) errors.homeworkPendingStudents = fail
  if (students.error || paid.error) errors.tuitionUnpaidStudents = fail

  // 칸이 없거나(SQL 실행 전) 표가 없으면 null → 항목 숨김, 그 밖의 오류는 안내
  type CountResult = { count: number | null; error: { code?: string; message?: string } | null }
  const optionalCount = (r: CountResult, key: 'reportsDraft' | 'reportsToSend' | 'levelTestsUnreviewed'): number | null => {
    if (!r.error) return r.count ?? 0
    if (isColumnMissing(r.error) || r.error.code === '42P01' || r.error.code === 'PGRST205') return null
    errors[key] = fail
    return 0
  }

  // 채점 대기: 응시 대상 표가 없으면(SQL 실행 전) null → 항목 숨김
  let gradingWaiting: number | null = null
  if (!assigns.error) {
    if (examRows.error || resultRows.error) {
      errors.gradingWaiting = fail
      gradingWaiting = 0
    } else {
      const examDates = new Map(examRows.data.map((e) => [e.id, e.exam_date]))
      gradingWaiting = waitingCount(assigns.data, examDates, gradedKeys(resultRows.data), today)
    }
  } else if (!isAssignTableMissing(assigns.error)) {
    errors.gradingWaiting = fail
    gradingWaiting = 0
  }

  const todayEvents = sortTodayEvents((events.data ?? []) as TodayEvent[])
  const dueIds = due.data.map((r) => r.student_id)
  const overdueIds = overdue.data.map((r) => r.student_id)

  return {
    today,
    counts: {
      todayClasses: todayEvents.filter((e) => e.event_type === 'class').length,
      homeworkDueStudents: distinctCount(dueIds),
      homeworkOverdueStudents: distinctCount(overdueIds),
      homeworkPendingStudents: distinctCount([...dueIds, ...overdueIds]),
      tuitionUnpaidStudents: unpaidStudentCount(students.count ?? 0, paid.data.map((r) => r.student_id)),
      reportsDraft: optionalCount(reportsDraft, 'reportsDraft'),
      reportsToSend: optionalCount(reportsToSend, 'reportsToSend'),
      levelTestsUnreviewed: optionalCount(levelUnreviewed, 'levelTestsUnreviewed'),
      gradingWaiting,
    },
    errors,
    events: todayEvents,
    eventsError: events.error ? fail : undefined,
  }
}
