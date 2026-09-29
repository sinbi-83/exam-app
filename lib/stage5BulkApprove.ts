// 5단계 일괄 사용하기 (검수 샘플 A·B 결과로 향미 선생님이 결정, 2026-09-29) — 대상 고르기와 되돌리기 계획.
// 승인 규칙은 새로 만들지 않는다: 최종 승인 목록은 lib/vocabulary.ts planBulkApprove, 바꾸는 값은
// 화면의 일괄 사용하기(/api/vocabulary/bulk)와 같다 (status approved, approval_origin 'batch', 교사 확인 시각).
// DB 에 접속하지 않는다 (scripts/stage5-bulk-approve.ts, scripts/stage5-rollback-bulk-approve.ts 가 쓴다).

import { planBulkApprove, type BulkSkipReason } from './vocabulary.ts'

export const STAGE5_OFFICIAL_REF = 'kr-curriculum-2022'

// 공식 등급(vocabulary_sources.official_grade) → 묶음
export const STAGE5_TIERS: Record<string, 'elementary' | 'common' | 'elective'> = {
  '초등학교 권장(*)': 'elementary',
  '중학교·고등 공통과목 권장(**)': 'common',
  '그 외 과목': 'elective',
}
export const STAGE5_TIER_LABELS = { elementary: '초등 권장', common: '중·고 공통', elective: '그 외(고등 선택과목)' } as const
export type Stage5Tier = keyof typeof STAGE5_TIER_LABELS

// 색 이름 인정 뜻을 따로 결정할 9개 (scripts/restore-color-meanings.ts 와 같은 목록)
export const STAGE5_COLOR_WORDS = ['black', 'blue', 'brown', 'gray', 'green', 'pink', 'red', 'white', 'yellow'] as const

// 미리보기 대상 수가 이 범위를 벗어나면 적용하지 않는다
export const STAGE5_EXPECTED_RANGE = { min: 2700, max: 2950 } as const

export interface Stage5Row {
  id: string
  expression: string
  pos: string | null
  status: 'pending' | 'approved' | 'rejected' | 'archived'
  base_difficulty: number | null
  deleted_at: string | null
  deferred_at: string | null
  vocabulary_sources?: { source_type: string; source_ref: string; official_grade: string | null }[]
}

export type Stage5ExcludeReason = 'ambiguous' | 'color' | 'review_x' | 'deferred'
export const STAGE5_EXCLUDE_LABELS: Record<Stage5ExcludeReason, string> = {
  ambiguous: "제작 때 '애매' 표시",
  color: '색 이름',
  review_x: '검수 샘플 X',
  deferred: "나중에 결정 (교사 결정 — 건드리지 않음)",
}

export function officialTier(row: Stage5Row): Stage5Tier | null {
  for (const s of row.vocabulary_sources ?? []) {
    if (s.source_type === 'official' && s.source_ref === STAGE5_OFFICIAL_REF) {
      const t = STAGE5_TIERS[s.official_grade ?? '']
      if (t) return t
    }
  }
  return null
}

export interface Stage5Plan {
  approve: string[] // planBulkApprove 가 통과시킨 최종 승인 목록
  skipped: { id: string; reason: BulkSkipReason }[] // planBulkApprove 가 건너뛴 것 (난이도 없음 등)
  excluded: { id: string; expression: string; reason: Stage5ExcludeReason }[]
  candidates: number // 공식 출처 · 확인 필요 · 삭제 안 됨
  byTier: Record<Stage5Tier, number> // 승인 목록의 묶음별 개수
}

// ambiguousKeys / xKeys: "표현|품사(영문 pos)" — 품사까지 맞아야 제외 (같은 철자 다른 품사 항목은 따로 판단)
export function planStage5(
  rows: readonly Stage5Row[],
  opts: { ambiguousKeys: ReadonlySet<string>; xKeys: ReadonlySet<string>; colorWords?: readonly string[] },
): Stage5Plan {
  const colors = new Set(opts.colorWords ?? STAGE5_COLOR_WORDS)
  const candidates = rows.filter((r) => r.status === 'pending' && r.deleted_at === null && officialTier(r) !== null)
  const excluded: Stage5Plan['excluded'] = []
  const targets: Stage5Row[] = []
  for (const r of candidates) {
    const key = `${r.expression}|${r.pos}`
    const reason: Stage5ExcludeReason | null =
      r.deferred_at !== null ? 'deferred'
      : opts.ambiguousKeys.has(key) ? 'ambiguous'
      : colors.has(r.expression) ? 'color'
      : opts.xKeys.has(key) ? 'review_x'
      : null
    if (reason) excluded.push({ id: r.id, expression: r.expression, reason })
    else targets.push(r)
  }
  const plan = planBulkApprove(targets.map((r) => r.id), targets)
  const approved = new Set(plan.approve)
  const byTier: Record<Stage5Tier, number> = { elementary: 0, common: 0, elective: 0 }
  for (const r of targets) if (approved.has(r.id)) byTier[officialTier(r)!]++
  return { approve: plan.approve, skipped: plan.skipped, excluded, candidates: candidates.length, byTier }
}

export function inExpectedRange(n: number): boolean {
  return n >= STAGE5_EXPECTED_RANGE.min && n <= STAGE5_EXPECTED_RANGE.max
}

// ── 되돌리기 ──
// 백업에 남긴 "바꾸기 전 값"으로만 되돌린다. 이번 일괄 승인 뒤에 교사가 손댄 단어는 건드리지 않는다:
//   지금도 status 'approved' + approval_origin 'batch' + teacher_reviewed_at 이 이번 승인 시각과 같을 때만.
//   (교사가 이후 수정·사용 중단·다시 저장하면 teacher_reviewed_at 이 바뀌거나 상태가 달라진다)
export interface Stage5BackupEntry {
  id: string
  expression: string
  status: 'pending'
  approval_origin: string | null
  deferred_at: string | null
  reject_reason: string | null
  reject_note: string | null
  teacher_reviewed_at: string | null
}

export interface Stage5CurrentRow {
  id: string
  status: string
  approval_origin: string | null
  teacher_reviewed_at: string | null
  deleted_at: string | null
}

export type RollbackSkipReason = 'missing' | 'deleted' | 'not_approved' | 'not_batch' | 'touched_after'
export const ROLLBACK_SKIP_LABELS: Record<RollbackSkipReason, string> = {
  missing: '찾을 수 없음',
  deleted: '삭제됨',
  not_approved: '지금 사용 중이 아님 (교사가 상태를 바꿈)',
  not_batch: '승인 경로가 일괄 승인이 아님',
  touched_after: '일괄 승인 뒤 교사가 손댐',
}

const sameTime = (a: string | null, b: string | null) => a !== null && b !== null && Date.parse(a) === Date.parse(b)

export function planStage5Rollback(
  backup: readonly Stage5BackupEntry[],
  current: readonly Stage5CurrentRow[],
  approvedAt: string,
): { restore: Stage5BackupEntry[]; skipped: { id: string; expression: string; reason: RollbackSkipReason }[] } {
  const byId = new Map(current.map((r) => [r.id, r]))
  const restore: Stage5BackupEntry[] = []
  const skipped: { id: string; expression: string; reason: RollbackSkipReason }[] = []
  for (const b of backup) {
    const c = byId.get(b.id)
    const reason: RollbackSkipReason | null =
      !c ? 'missing'
      : c.deleted_at !== null ? 'deleted'
      : c.status !== 'approved' ? 'not_approved'
      : c.approval_origin !== 'batch' ? 'not_batch'
      : !sameTime(c.teacher_reviewed_at, approvedAt) ? 'touched_after'
      : null
    if (reason) skipped.push({ id: b.id, expression: b.expression, reason })
    else restore.push(b)
  }
  return { restore, skipped }
}
