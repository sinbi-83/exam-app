// 5단계 일괄 사용하기 되돌리기: 백업 파일에 남긴 "바꾸기 전 값"으로 확인 필요로 돌린다.
// 이번 일괄 승인 뒤에 교사가 손댄 단어는 건드리지 않는다 — 지금도 사용 중 + 승인 경로 일괄 승인 +
// 교사 확인 시각이 이번 승인 시각과 같을 때만 (lib/stage5BulkApprove.ts planStage5Rollback).
//
// 실행: node scripts/stage5-rollback-bulk-approve.ts backups/stage5-bulk-approve-backup-....json          → 미리보기
//       node scripts/stage5-rollback-bulk-approve.ts backups/stage5-bulk-approve-backup-....json --apply  → 되돌리기

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chunk } from '../lib/supabasePaging.ts'
import { planStage5Rollback, ROLLBACK_SKIP_LABELS, type Stage5BackupEntry, type Stage5CurrentRow } from '../lib/stage5BulkApprove.ts'

const APPLY = process.argv.includes('--apply')
const file = process.argv.slice(2).find((a) => !a.startsWith('-'))
if (!file) {
  console.error('백업 파일을 주세요: node scripts/stage5-rollback-bulk-approve.ts backups/stage5-bulk-approve-backup-....json [--apply]')
  process.exit(1)
}
const backup = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf-8')) as { approved_at: string; entries: Stage5BackupEntry[] }
if (!backup.approved_at || !Array.isArray(backup.entries)) throw new Error('5단계 일괄 사용하기 백업 파일이 아닙니다.')

const env: Record<string, string> = {}
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { data: auth, error: loginError } = await supabase.auth.signInWithPassword({ email: env.SUPABASE_LOGIN_EMAIL, password: env.SUPABASE_LOGIN_PASSWORD })
if (loginError || !auth.user) throw new Error(`로그인 실패: ${loginError?.message}`)
const userId = auth.user.id

// 지금 값 (id 200개씩)
const current: Stage5CurrentRow[] = []
for (const part of chunk(backup.entries.map((e) => e.id), 200)) {
  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('id, status, approval_origin, teacher_reviewed_at, deleted_at')
    .eq('user_id', userId)
    .in('id', part)
  if (error) throw new Error(error.message)
  current.push(...((data ?? []) as Stage5CurrentRow[]))
}

const plan = planStage5Rollback(backup.entries, current, backup.approved_at)
console.log(`백업 ${backup.entries.length}개 (승인 시각 ${backup.approved_at}) → 되돌릴 대상 ${plan.restore.length}개 / 남김 ${plan.skipped.length}개`)
for (const reason of Object.keys(ROLLBACK_SKIP_LABELS) as (keyof typeof ROLLBACK_SKIP_LABELS)[]) {
  const list = plan.skipped.filter((s) => s.reason === reason)
  if (list.length) console.log(`  남김 - ${ROLLBACK_SKIP_LABELS[reason]} ${list.length}개: ${list.slice(0, 30).map((s) => s.expression).join(', ')}${list.length > 30 ? ' …' : ''}`)
}
if (!APPLY) {
  console.log('(미리보기) 실제로 되돌리려면 --apply 를 붙여 다시 실행하세요.')
  process.exit(0)
}

// 바꾸기 전 값이 같은 것끼리 묶어서 200개씩 되돌린다. 지금도 이번 일괄 승인 그대로인 것만 (안전장치 한 번 더)
const groups = new Map<string, Stage5BackupEntry[]>()
for (const e of plan.restore) {
  const key = JSON.stringify([e.approval_origin, e.deferred_at, e.reject_reason, e.reject_note, e.teacher_reviewed_at])
  groups.set(key, [...(groups.get(key) ?? []), e])
}
let restored = 0
for (const list of groups.values()) {
  const e0 = list[0]
  for (const part of chunk(list.map((e) => e.id), 200)) {
    const { data, error } = await supabase
      .from('vocabulary_entries')
      .update({
        status: 'pending',
        approval_origin: e0.approval_origin,
        deferred_at: e0.deferred_at,
        reject_reason: e0.reject_reason,
        reject_note: e0.reject_note,
        teacher_reviewed_at: e0.teacher_reviewed_at,
      })
      .eq('user_id', userId)
      .eq('status', 'approved')
      .eq('approval_origin', 'batch')
      .eq('teacher_reviewed_at', backup.approved_at)
      .in('id', part)
      .select('id')
    if (error) {
      console.error(`❌ ${restored}개까지 되돌린 뒤 실패: ${error.message} (다시 실행하면 남은 것만 되돌립니다)`)
      process.exit(1)
    }
    restored += data?.length ?? 0
  }
}
console.log(`✅ ${restored}개를 확인 필요로 되돌렸습니다.`)
