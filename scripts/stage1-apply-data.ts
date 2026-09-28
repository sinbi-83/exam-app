// 학업관리 개편 1단계 데이터 바로잡기 (소유자 승인 2026-09-28, docs/stage0-academic-restructure-audit.md 6장)
//   1) 사용 중단(archived) 28개 → 사용 중(approved). 승인 경로 'owner_approval' + 이력 행(owner-approval:) "학년 범위 필터 도입에 따른 복원"
//   2) 스크립트 일괄 승인(batch) 73개 → 승인 경로 'legacy_review'(기존 검수 인정) + 이력 행
//   3) exam_type 이 빈 기존 시험 → 문항 구성으로 추론해 채움 (problem / word)
// 교사 확인 시각(teacher_reviewed_at)·검수 완료 기록은 만들지 않는다 (교사가 한 단어씩 확인한 것이 아니므로).
//
// 실행: node scripts/stage1-apply-data.ts            → 미리보기 (DB 변경 없음)
//       node scripts/stage1-apply-data.ts --apply    → 백업 파일을 먼저 쓰고 실제 변경
// 되돌리기: node scripts/stage1-rollback-data.ts backups/<이 스크립트가 쓴 백업 파일> [--apply]

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { inferExamType } from '../lib/examType.ts'
import { selectAllPages } from '../lib/supabasePaging.ts'
import { OWNER_APPROVAL_REF_PREFIX } from '../lib/vocabularyCalibration.ts'

const APPLY = process.argv.includes('--apply')
const EXPECTED = { restore: 28, legacy: 73, exams: 16 }
const RESTORE_REASON = '소유자 명시 승인 · 학년 범위 필터 도입에 따른 복원 (2026-09-28, 1단계 일괄 처리)'
const LEGACY_REASON = '기존 검수 인정 · 스크립트 일괄 승인 + 교사 검수 완료 기록 (소유자 승인 2026-09-28, 1단계 일괄 처리)'

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

type Entry = {
  id: string
  expression: string
  status: string
  archived_at: string | null
  approval_origin: string | null
  deferred_at: string | null
  deleted_at: string | null
  base_difficulty: number | null
  teacher_reviewed_at: string | null
  updated_at: string
}

function countBy<T>(list: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const x of list) out[key(x)] = (out[key(x)] ?? 0) + 1
  return out
}

async function main() {
  const env = loadEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: login, error: loginError } = await supabase.auth.signInWithPassword({
    email: env.SUPABASE_LOGIN_EMAIL,
    password: env.SUPABASE_LOGIN_PASSWORD,
  })
  if (loginError || !login.user) throw new Error(`로그인 실패: ${loginError?.message}`)
  const userId = login.user.id

  const load = async () => {
    // 1,000행 제한 → 나눠 읽기 (lib/supabasePaging.ts)
    const entries = await selectAllPages((from, to) =>
      supabase
        .from('vocabulary_entries')
        .select('id, expression, status, archived_at, approval_origin, deferred_at, deleted_at, base_difficulty, teacher_reviewed_at, updated_at')
        .order('created_at')
        .order('id')
        .range(from, to),
    )
    if (entries.error) throw new Error(`단어 조회 실패 (migration 실행 전이면 deferred_at 칸이 없습니다): ${entries.error.message}`)
    const exams = await supabase.from('exams').select('id, title, exam_type').order('created_at')
    if (exams.error) throw new Error(`시험 조회 실패 (migration 실행 전이면 exam_type 칸이 없습니다): ${exams.error.message}`)
    return { entries: entries.data as Entry[], exams: exams.data as { id: string; title: string; exam_type: string | null }[] }
  }

  const before = await load()
  const active = before.entries.filter((e) => e.deleted_at === null)
  const restore = active.filter((e) => e.status === 'archived')
  const legacy = active.filter((e) => e.status === 'approved' && e.approval_origin === 'batch')
  const emptyExams = before.exams.filter((e) => e.exam_type === null)

  const eq = await supabase.from('exam_questions').select('exam_id, question_data->type')
  if (eq.error) throw new Error(eq.error.message)
  const byExam = new Map<string, { question_data: { type?: string } }[]>()
  for (const r of eq.data as { exam_id: string; type: string }[]) {
    const list = byExam.get(r.exam_id) ?? []
    list.push({ question_data: { type: r.type } })
    byExam.set(r.exam_id, list)
  }
  const examPlan = emptyExams.map((e) => ({ ...e, next: inferExamType(byExam.get(e.id) ?? []) }))

  console.log('── 변경 전 ──')
  console.log('단어 상태:', countBy(active, (e) => e.status), '/ 승인 경로:', countBy(active, (e) => e.approval_origin ?? '(없음)'))
  console.log('시험 종류:', countBy(before.exams, (e) => e.exam_type ?? '(빈 값)'))
  console.log('── 계획 ──')
  console.log(`사용 중단 → 사용 중: ${restore.length}개 (기대 ${EXPECTED.restore})`)
  console.log(`승인 경로 batch → 기존 검수 인정: ${legacy.length}개 (기대 ${EXPECTED.legacy})`)
  console.log(`시험 종류 채우기: ${examPlan.length}개 (기대 ${EXPECTED.exams}) →`, countBy(examPlan, (e) => e.next))

  if (restore.length !== EXPECTED.restore || legacy.length !== EXPECTED.legacy || examPlan.length !== EXPECTED.exams) {
    console.error('❌ 개수가 승인받은 값과 달라서 멈춥니다. 아무것도 바꾸지 않았습니다.')
    process.exit(1)
  }
  if (!APPLY) {
    console.log('\n(미리보기) 실제로 바꾸려면 --apply 를 붙여 다시 실행하세요.')
    return
  }

  // 변경 직전 백업 (되돌리기 기준)
  const runAt = new Date().toISOString()
  const backupFile = resolve(process.cwd(), 'backups', `stage1-apply-backup-${runAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(
    backupFile,
    JSON.stringify(
      {
        taken_at: runAt,
        owner_approval_source_ref: `${OWNER_APPROVAL_REF_PREFIX}${runAt}`,
        vocabulary_entries: before.entries.map(({ id, expression, status, archived_at, approval_origin, deferred_at }) => ({
          id, expression, status, archived_at, approval_origin, deferred_at,
        })),
        exams: before.exams,
      },
      null,
      2,
    ),
  )
  console.log(`\n백업 저장: ${backupFile}`)

  const sourceRef = `${OWNER_APPROVAL_REF_PREFIX}${runAt}`
  const record = (entry: Entry, rationale: string) =>
    supabase.from('vocabulary_sources').insert({
      user_id: userId,
      entry_id: entry.id,
      source_type: 'teacher',
      source_ref: sourceRef,
      suggested_difficulty: entry.base_difficulty,
      rationale,
      created_by: 'teacher',
    })

  let failed = 0
  for (const e of legacy) {
    const { error } = await supabase
      .from('vocabulary_entries')
      .update({ approval_origin: 'legacy_review' })
      .eq('id', e.id)
      .eq('status', 'approved')
      .eq('approval_origin', 'batch')
    const rec = error ? null : await record(e, LEGACY_REASON)
    if (error || rec?.error) { failed++; console.error(`❌ ${e.expression}: ${error?.message ?? rec?.error?.message}`) }
  }
  for (const e of restore) {
    const { error } = await supabase
      .from('vocabulary_entries')
      .update({ status: 'approved', archived_at: null, approval_origin: 'owner_approval' })
      .eq('id', e.id)
      .eq('status', 'archived')
    const rec = error ? null : await record(e, RESTORE_REASON)
    if (error || rec?.error) { failed++; console.error(`❌ ${e.expression}: ${error?.message ?? rec?.error?.message}`) }
  }
  for (const e of examPlan) {
    const { error } = await supabase.from('exams').update({ exam_type: e.next }).eq('id', e.id).is('exam_type', null)
    if (error) { failed++; console.error(`❌ 시험 ${e.title}: ${error.message}`) }
  }

  const after = await load()
  const activeAfter = after.entries.filter((e) => e.deleted_at === null)
  console.log('\n── 변경 후 ──')
  console.log('단어 상태:', countBy(activeAfter, (e) => e.status), '/ 승인 경로:', countBy(activeAfter, (e) => e.approval_origin ?? '(없음)'))
  console.log('나중에 결정 표시:', activeAfter.filter((e) => e.deferred_at !== null).length)
  console.log('교사 확인 시각 바뀐 항목:', activeAfter.filter((e) => before.entries.find((b) => b.id === e.id)?.teacher_reviewed_at !== e.teacher_reviewed_at).length)
  console.log('시험 종류:', countBy(after.exams, (e) => e.exam_type ?? '(빈 값)'))
  console.log(failed === 0 ? '✅ 실패 0건' : `❌ 실패 ${failed}건`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
