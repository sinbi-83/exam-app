// 반 관리 1단계: DB 를 읽고 쓰는 공용 함수 (규칙은 lib/classManagement.ts).
// 모든 함수는 로그인 확인을 마친 뒤 부른다. SQL 적용 전에도 앱이 깨지지 않도록 준비 여부를 먼저 확인한다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages } from '@/lib/supabasePaging'
import { checkOwnedIds, checkStudentsOwnership, type Ownership } from '@/lib/ownership'
import { gradeWarnings, type GradeWarningReason } from '@/lib/gradeNormalize'
import {
  buildClassOverview,
  isSchemaMissing,
  leaveDateProblem,
  planMemberAdds,
  STUDENT_RECORD_TABLES,
  studentStatusOf,
  type ClassOverview,
  type Membership,
  type RecordCount,
} from '@/lib/classManagement'

export type Readiness = { ready: true } | { ready: false; missing: boolean; error?: string }

// head 조회는 표가 없어도 오류가 없으므로 일반 조회로 확인한다
export async function checkClassManagementReady(supabase: SupabaseClient): Promise<Readiness> {
  const results = await Promise.all([
    supabase.from('students').select('status').limit(1),
    supabase.from('classes').select('id').limit(1),
    supabase.from('class_schedules').select('id').limit(1),
    supabase.from('class_students').select('id').limit(1),
  ])
  const errors = results.map((r) => r.error).filter((e) => !!e)
  if (errors.length === 0) return { ready: true }
  if (errors.some((e) => isSchemaMissing(e))) return { ready: false, missing: true }
  return { ready: false, missing: false, error: errors[0]?.message }
}

export function checkClassOwnership(supabase: SupabaseClient, classId: unknown, userId: string): Promise<Ownership> {
  return checkOwnedIds(supabase, 'classes', [classId], userId, '내 반이 아닙니다.')
}

export type MemberWarning = { student_id: string; name: string; grade: string; reason: GradeWarningReason }

export type AddMembersResult =
  | { ok: true; added: string[]; alreadyIn: string[]; warnings: MemberWarning[] }
  | { ok: false; status: number; error: string }

type ClassRow = { id: string; status: string; target_grades: string[] | null }

// 반에 학생 넣기. 소유 확인 → 퇴원 학생·종료된 반 막기 → 이미 있는 학생 건너뛰기 → 저장. 대상 학년이 아니면 막지 않고 경고만.
export async function addMembersToClass(supabase: SupabaseClient, userId: string, classId: string, studentIds: unknown[], joinedOn: string): Promise<AddMembersResult> {
  const ownership = await checkStudentsOwnership(supabase, studentIds, userId)
  if (!ownership.ok) return ownership
  const ids = [...new Set(studentIds as string[])]

  const { data: cls, error: classError } = await supabase.from('classes').select('id, status, target_grades').eq('id', classId).eq('user_id', userId).maybeSingle()
  if (classError) return { ok: false, status: 500, error: classError.message }
  if (!cls) return { ok: false, status: 403, error: '내 반이 아닙니다.' }
  const target = cls as ClassRow
  if (target.status !== 'active') return { ok: false, status: 409, error: '종료된 반에는 학생을 넣을 수 없습니다.' }

  const { data: studentRows, error: studentError } = await supabase.from('students').select('id, name, grade, status').eq('user_id', userId).in('id', ids)
  if (studentError) return { ok: false, status: 500, error: studentError.message }
  const students = (studentRows ?? []) as { id: string; name: string; grade: string | null; status?: string | null }[]
  if (students.some((s) => studentStatusOf(s) === 'withdrawn')) {
    return { ok: false, status: 409, error: '퇴원한 학생은 반에 넣을 수 없습니다. 먼저 재원으로 바꿔 주세요.' }
  }

  const { data: currentRows, error: currentError } = await supabase.from('class_students').select('student_id, left_on').eq('user_id', userId).eq('class_id', classId).is('left_on', null)
  if (currentError) return { ok: false, status: 500, error: currentError.message }
  const { add, alreadyIn } = planMemberAdds((currentRows ?? []) as Pick<Membership, 'student_id' | 'left_on'>[], ids)

  if (add.length > 0) {
    const { error } = await supabase.from('class_students').insert(add.map((student_id) => ({ user_id: userId, class_id: classId, student_id, joined_on: joinedOn })))
    if (error?.code === '23505') return { ok: false, status: 409, error: '이미 이 반에 들어 있는 학생이 있습니다. 새로고침한 뒤 다시 해 주세요.' }
    if (error) return { ok: false, status: 500, error: error.message }
  }

  const addedStudents = students.filter((s) => add.includes(s.id))
  const warnings = gradeWarnings(addedStudents, target.target_grades ?? []).map((w) => ({
    student_id: w.student.id,
    name: w.student.name,
    grade: w.student.grade ?? '',
    reason: w.reason,
  }))
  return { ok: true, added: add, alreadyIn, warnings }
}

export type CloseMembersResult = { ok: true; closed: number } | { ok: false; status: number; error: string }

// 반에서 빼기: 열려 있는 소속의 left_on 을 채운다 (행은 지우지 않음)
export async function closeMemberships(supabase: SupabaseClient, userId: string, classId: string, studentIds: string[], leftOn: string): Promise<CloseMembersResult> {
  const { data, error } = await supabase.from('class_students').select('id, joined_on').eq('user_id', userId).eq('class_id', classId).in('student_id', studentIds).is('left_on', null)
  if (error) return { ok: false, status: 500, error: error.message }
  const open = (data ?? []) as { id: string; joined_on: string }[]
  const problem = leaveDateProblem(leftOn, open)
  if (problem) return { ok: false, status: 400, error: problem }
  if (open.length === 0) return { ok: true, closed: 0 }
  const { error: updateError } = await supabase.from('class_students').update({ left_on: leftOn }).eq('user_id', userId).in('id', open.map((m) => m.id))
  if (updateError) return { ok: false, status: 500, error: updateError.message }
  return { ok: true, closed: open.length }
}

// 학생 삭제 전 연관 기록 세기. 표가 아직 없으면 0건 (기록이 있을 수 없다), 그 밖의 오류는 삭제하지 않도록 돌려준다.
// head 조회는 오류가 보이지 않으므로 일반 조회에 건수만 함께 받는다.
export async function countStudentRecords(supabase: SupabaseClient, studentId: string): Promise<{ records: RecordCount[]; error?: string }> {
  const results = await Promise.all(
    STUDENT_RECORD_TABLES.map(async ({ table, label }) => {
      const { count, data, error } = await supabase.from(table).select('id', { count: 'exact' }).eq('student_id', studentId).limit(1)
      if (error) return isSchemaMissing(error) ? { label, count: 0 } : { label, count: 0, error: error.message }
      return { label, count: count ?? data?.length ?? 0 }
    }),
  )
  const failed = results.find((r) => 'error' in r)
  return {
    records: results.filter((r) => r.count > 0).map(({ label, count }) => ({ label, count })),
    ...(failed && 'error' in failed ? { error: failed.error } : {}),
  }
}

export type ClassOverviewResult = { overview: ClassOverview | null; ready: boolean; error?: string }

// 대시보드: 반별 인원·반 없는 학생·휴원·퇴원 학생 수. SQL 적용 전이면 ready=false.
export async function loadClassOverview(supabase: SupabaseClient, userId: string): Promise<ClassOverviewResult> {
  const [students, classes, memberships] = await Promise.all([
    selectAllPages<{ id: string; status: string | null }>((from, to) => supabase.from('students').select('id, status').eq('user_id', userId).order('id').range(from, to)),
    selectAllPages<{ id: string; name: string; status: string }>((from, to) => supabase.from('classes').select('id, name, status').eq('user_id', userId).order('name').order('id').range(from, to)),
    selectAllPages<Pick<Membership, 'class_id' | 'student_id' | 'left_on'>>((from, to) =>
      supabase.from('class_students').select('class_id, student_id, left_on').eq('user_id', userId).is('left_on', null).order('id').range(from, to),
    ),
  ])
  const errors = [students.error, classes.error, memberships.error].filter((e) => !!e)
  if (errors.some((e) => isSchemaMissing(e))) return { overview: null, ready: false }
  if (errors.length > 0) return { overview: null, ready: true, error: '불러오지 못했어요' }
  return { overview: buildClassOverview(students.data, classes.data, memberships.data), ready: true }
}
