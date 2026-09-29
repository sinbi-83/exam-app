// 5단계 일괄 사용하기: 공식 출처(kr-curriculum-2022) '확인 필요' 단어를 '사용 중'으로 (향미 선생님 결정, 2026-09-29).
// 근거: 검수 샘플 A·B 각 40개 모두 O (docs/review-sample-A.csv, -B.csv).
//
// - 제외(확인 필요로 남김): 제작 때 '애매' 표시(seed JSON ambiguity), 색 이름 9개, 검수 샘플 X 단어(CSV 에서 읽음),
//   '나중에 결정'(교사 결정). 사용 중단·영구 제외는 애초에 확인 필요가 아니라 대상이 아니다.
// - 승인 규칙은 기존 그대로: lib/vocabulary.ts planBulkApprove + 화면 일괄 사용하기와 같은 값
//   (status 'approved', approval_origin 'batch', deferred/reject 비움, teacher_reviewed_at = 이번 승인 시각)
// - 1,000행 제한 → 나눠 읽기(lib/supabasePaging.ts), 승인은 200개씩 나눠서.
// - 미리보기 대상이 2,700~2,950개를 벗어나면 적용하지 않는다.
// - --apply 때: 먼저 백업(backups/stage5-bulk-approve-backup-<시각>.json) → 적용 → 확인.
//
// 실행: node scripts/stage5-bulk-approve.ts            → 미리보기만 (DB 변경 없음)
//       node scripts/stage5-bulk-approve.ts --apply    → 미리보기 → (범위 안이면) 백업 → 적용 → 확인
// 되돌리기: node scripts/stage5-rollback-bulk-approve.ts <백업 파일> [--apply]

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chunk, selectAllPages } from '../lib/supabasePaging.ts'
import { parseCsv } from '../lib/officialVocabulary.ts'
import { decodeReviewFile, normalizeVerdict, tabbedToCsv } from '../lib/reviewSample.ts'
import { POS_LABELS_KO } from '../lib/wordTest.ts'
import {
  inExpectedRange,
  planStage5,
  STAGE5_EXCLUDE_LABELS,
  STAGE5_EXPECTED_RANGE,
  STAGE5_TIER_LABELS,
  type Stage5BackupEntry,
  type Stage5ExcludeReason,
  type Stage5Row,
  type Stage5Tier,
} from '../lib/stage5BulkApprove.ts'

const APPLY = process.argv.includes('--apply')
const ID_CHUNK = 200
const ROOT = process.cwd()

// 제작 때 '애매' 표시 (표현|품사)
const ambiguousKeys = new Set<string>()
for (const f of readdirSync(resolve(ROOT, 'data/vocabulary')).filter((x) => /^kr-curriculum-2022-.+-\d\d\.json$/.test(x))) {
  for (const e of JSON.parse(readFileSync(resolve(ROOT, 'data/vocabulary', f), 'utf-8')).entries) {
    if (e.ambiguity) ambiguousKeys.add(`${e.expression}|${e.pos}`)
  }
}

// 검수 샘플 X 단어 (표현|품사). CSV 의 품사는 한글 약칭 → 영문으로 되돌린다
const posFromKo = new Map(Object.entries(POS_LABELS_KO).map(([en, ko]) => [ko, en]))
const xKeys = new Set<string>()
for (const f of ['docs/review-sample-A.csv', 'docs/review-sample-B.csv']) {
  const rows = parseCsv(tabbedToCsv(decodeReviewFile(readFileSync(resolve(ROOT, f))).replace(/^﻿/, '')))
  const h = rows[0].map((x) => x.trim())
  const [cWord, cPos, cVerdict] = [h.indexOf('단어'), h.indexOf('품사'), h.indexOf('판정')]
  if (cWord < 0 || cPos < 0 || cVerdict < 0) throw new Error(`${f}: 단어·품사·판정 칸을 찾을 수 없습니다.`)
  for (const r of rows.slice(1)) {
    const v = normalizeVerdict(r[cVerdict])
    if (v === null || v === '') throw new Error(`${f}: 판정이 비었거나 알아볼 수 없는 줄이 있습니다 (${r[cWord]}). 검수를 마친 뒤 실행하세요.`)
    if (v === 'X') xKeys.add(`${r[cWord].trim()}|${posFromKo.get(r[cPos].trim()) ?? r[cPos].trim()}`)
  }
}

const env: Record<string, string> = {}
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf-8').split('\n')) {
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

type FullRow = Stage5Row & Omit<Stage5BackupEntry, 'status'> & { approval_origin: string | null }
async function readAll(): Promise<FullRow[]> {
  const { data, error } = await selectAllPages<FullRow>((from, to) =>
    supabase
      .from('vocabulary_entries')
      .select('id, expression, pos, status, base_difficulty, deleted_at, deferred_at, approval_origin, reject_reason, reject_note, teacher_reviewed_at, vocabulary_sources(source_type, source_ref, official_grade)')
      .eq('user_id', userId)
      .order('id')
      .range(from, to),
  )
  if (error) throw new Error(error.message)
  return data
}

const count = (rows: FullRow[], s: string) => rows.filter((r) => r.deleted_at === null && r.status === s).length

// ── 1. 미리보기 ──
const before = await readAll()
const plan = planStage5(before, { ambiguousKeys, xKeys })
const byReason = (reason: Stage5ExcludeReason) => plan.excluded.filter((e) => e.reason === reason)
console.log('■ 미리보기 (DB 변경 없음)')
console.log(`  지금: 사용 중 ${count(before, 'approved')} / 확인 필요 ${count(before, 'pending')} (삭제 제외)`)
console.log(`  공식 출처 · 확인 필요 · 삭제 안 됨: ${plan.candidates}개`)
console.log(`  제외 ${plan.excluded.length}개:`)
for (const reason of Object.keys(STAGE5_EXCLUDE_LABELS) as Stage5ExcludeReason[]) {
  const list = byReason(reason)
  console.log(`    - ${STAGE5_EXCLUDE_LABELS[reason]} ${list.length}개${list.length && list.length <= 40 ? `: ${list.map((e) => e.expression).join(', ')}` : ''}`)
}
console.log(`  기존 규칙(planBulkApprove)에서 건너뜀 ${plan.skipped.length}개${plan.skipped.length ? ` (${[...new Set(plan.skipped.map((s) => s.reason))].join(', ')})` : ''}`)
console.log(`  → 사용하기 대상 ${plan.approve.length}개: ${(Object.keys(plan.byTier) as Stage5Tier[]).map((t) => `${STAGE5_TIER_LABELS[t]} ${plan.byTier[t]}`).join(' · ')}`)

if (!inExpectedRange(plan.approve.length)) {
  console.log(`\n⛔ 대상 ${plan.approve.length}개가 예상 범위(${STAGE5_EXPECTED_RANGE.min}~${STAGE5_EXPECTED_RANGE.max})를 벗어나 적용하지 않습니다.`)
  process.exit(2)
}
if (!APPLY) {
  console.log('\n(미리보기) 실제로 바꾸려면 --apply 를 붙여 다시 실행하세요.')
  process.exit(0)
}

// ── 2. 백업 (바꾸기 전 값) ──
const approvedAt = new Date().toISOString()
const approveSet = new Set(plan.approve)
const backupEntries: Stage5BackupEntry[] = before
  .filter((r) => approveSet.has(r.id))
  .map((r) => ({
    id: r.id,
    expression: r.expression,
    status: 'pending',
    approval_origin: r.approval_origin,
    deferred_at: r.deferred_at,
    reject_reason: r.reject_reason,
    reject_note: r.reject_note,
    teacher_reviewed_at: r.teacher_reviewed_at,
  }))
const backupPath = resolve(ROOT, `backups/stage5-bulk-approve-backup-${approvedAt.replace(/[:.]/g, '-')}.json`)
writeFileSync(
  backupPath,
  JSON.stringify(
    {
      note: '5단계 일괄 사용하기 전 값. 되돌리기: node scripts/stage5-rollback-bulk-approve.ts <이 파일> --apply',
      approved_at: approvedAt,
      counts_before: { approved: count(before, 'approved'), pending: count(before, 'pending') },
      excluded: plan.excluded,
      entries: backupEntries,
    },
    null,
    2,
  ),
)
console.log(`\n■ 백업 저장: ${backupPath} (${backupEntries.length}개)`)

// ── 3. 적용 (200개씩) — 화면 일괄 사용하기와 같은 값, 지금도 확인 필요·나중에 결정 아님일 때만 ──
let changed = 0
for (const part of chunk(plan.approve, ID_CHUNK)) {
  const { data, error } = await supabase
    .from('vocabulary_entries')
    .update({ status: 'approved', approval_origin: 'batch', deferred_at: null, reject_reason: null, reject_note: null, teacher_reviewed_at: approvedAt })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .is('deferred_at', null)
    .is('deleted_at', null)
    .in('id', part)
    .select('id')
  if (error) {
    console.error(`❌ ${changed}개까지 바꾼 뒤 실패: ${error.message}\n   되돌리기: node scripts/stage5-rollback-bulk-approve.ts ${backupPath} --apply`)
    process.exit(1)
  }
  changed += data?.length ?? 0
  process.stdout.write(`  적용 ${changed}/${plan.approve.length}\r`)
}
console.log(`\n■ 적용: ${changed}개를 사용 중으로 (승인 경로 일괄 승인, 승인 시각 ${approvedAt})`)

// ── 4. 확인 ──
const after = await readAll()
const byId = new Map(after.map((r) => [r.id, r]))
const stillPending = plan.excluded.filter((e) => byId.get(e.id)?.status === 'pending').length
const notApproved = plan.approve.filter((id) => byId.get(id)?.status !== 'approved').length
console.log(`■ 확인: 사용 중 ${count(after, 'approved')} / 확인 필요 ${count(after, 'pending')}`)
console.log(`  제외한 ${plan.excluded.length}개 중 확인 필요로 남음 ${stillPending}개 ${stillPending === plan.excluded.length ? '✅' : '❌'}`)
console.log(`  대상 ${plan.approve.length}개 중 사용 중이 아닌 것 ${notApproved}개 ${notApproved === 0 ? '✅' : '❌'}`)
console.log(`  되돌리기: node scripts/stage5-rollback-bulk-approve.ts ${backupPath} --apply`)
