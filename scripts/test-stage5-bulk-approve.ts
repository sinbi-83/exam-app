// 5단계 일괄 사용하기 계획·되돌리기 규칙 검사 (DB 접속 없음).
// 실행: npm run test-stage5-bulk-approve

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  inExpectedRange,
  officialTier,
  planStage5,
  planStage5Rollback,
  STAGE5_COLOR_WORDS,
  type Stage5BackupEntry,
  type Stage5Row,
} from '../lib/stage5BulkApprove.ts'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✅ ${name}`)
  } catch (err) {
    console.error(`❌ ${name}`)
    throw err
  }
}

const off = (grade: string) => [{ source_type: 'official', source_ref: 'kr-curriculum-2022', official_grade: grade }]
const row = (id: string, over: Partial<Stage5Row> = {}): Stage5Row => ({
  id, expression: id, pos: 'noun', status: 'pending', base_difficulty: 30, deleted_at: null, deferred_at: null,
  vocabulary_sources: off('중학교·고등 공통과목 권장(**)'), ...over,
})

const rows: Stage5Row[] = [
  row('e1', { vocabulary_sources: off('초등학교 권장(*)') }),
  row('c1'),
  row('g1', { vocabulary_sources: off('그 외 과목') }),
  row('amb', { expression: 'back', pos: 'noun' }),
  row('amb-other-pos', { expression: 'back', pos: 'adverb' }), // 품사가 다르면 애매 표시 대상 아님
  row('red', { expression: 'red', pos: 'adjective', vocabulary_sources: off('초등학교 권장(*)') }),
  row('xw', { expression: 'behalf', pos: 'noun', vocabulary_sources: off('그 외 과목') }),
  row('def', { deferred_at: '2026-09-28T00:00:00Z' }),
  row('app', { status: 'approved' }),
  row('rej', { status: 'rejected' }),
  row('arc', { status: 'archived' }),
  row('del', { deleted_at: '2026-09-28T00:00:00Z' }),
  row('teacher', { vocabulary_sources: [{ source_type: 'teacher', source_ref: 'bostons-teacher-seed-v1', official_grade: null }] }),
  row('nodiff', { base_difficulty: null }),
]

test('대상: 공식 출처 · 확인 필요 · 삭제 안 됨만. 사용 중·영구 제외·사용 중단·삭제·교사 seed 는 대상 아님', () => {
  const p = planStage5(rows, { ambiguousKeys: new Set(['back|noun']), xKeys: new Set(['behalf|noun']) })
  assert.equal(p.candidates, 9) // e1 c1 g1 amb amb-other-pos red xw def nodiff
  assert.deepEqual(p.approve.sort(), ['amb-other-pos', 'c1', 'e1', 'g1'])
  assert.deepEqual(p.byTier, { elementary: 1, common: 2, elective: 1 })
})

test("제외: 애매 표시(표현+품사) · 색 이름 · 검수 X · 나중에 결정(교사 결정) — 확인 필요로 남긴다", () => {
  const p = planStage5(rows, { ambiguousKeys: new Set(['back|noun']), xKeys: new Set(['behalf|noun']) })
  assert.deepEqual(
    p.excluded.map((e) => [e.id, e.reason]).sort(),
    [['amb', 'ambiguous'], ['def', 'deferred'], ['red', 'color'], ['xw', 'review_x']],
  )
  assert.deepEqual([...STAGE5_COLOR_WORDS], ['black', 'blue', 'brown', 'gray', 'green', 'pink', 'red', 'white', 'yellow'])
})

test('기존 규칙 그대로: 난이도 없는 단어는 planBulkApprove 가 건너뛴다', () => {
  const p = planStage5(rows, { ambiguousKeys: new Set(), xKeys: new Set() })
  assert.deepEqual(p.skipped, [{ id: 'nodiff', reason: 'no_difficulty' }])
})

test('묶음 판별과 예상 범위(2,700~2,950)', () => {
  assert.equal(officialTier(row('x', { vocabulary_sources: off('그 외 과목') })), 'elective')
  assert.equal(officialTier(row('x', { vocabulary_sources: [] })), null)
  assert.ok(inExpectedRange(2700) && inExpectedRange(2950) && !inExpectedRange(2699) && !inExpectedRange(2951))
})

test('되돌리기: 이번 일괄 승인 그대로인 단어만, 교사가 뒤에 손댄 단어는 남긴다', () => {
  const at = '2026-09-29T12:00:00.000Z'
  const b = (id: string, prevReviewed: string | null = null): Stage5BackupEntry => ({
    id, expression: id, status: 'pending', approval_origin: null, deferred_at: null, reject_reason: null, reject_note: null, teacher_reviewed_at: prevReviewed,
  })
  const backup = [b('ok'), b('ok-prev', '2026-09-20T00:00:00Z'), b('touched'), b('archived'), b('indiv'), b('gone'), b('deleted')]
  const current = [
    { id: 'ok', status: 'approved', approval_origin: 'batch', teacher_reviewed_at: '2026-09-29T12:00:00+00:00', deleted_at: null },
    { id: 'ok-prev', status: 'approved', approval_origin: 'batch', teacher_reviewed_at: at, deleted_at: null },
    { id: 'touched', status: 'approved', approval_origin: 'batch', teacher_reviewed_at: '2026-09-30T08:00:00Z', deleted_at: null },
    { id: 'archived', status: 'archived', approval_origin: 'batch', teacher_reviewed_at: '2026-09-30T08:00:00Z', deleted_at: null },
    { id: 'indiv', status: 'approved', approval_origin: 'individual', teacher_reviewed_at: at, deleted_at: null },
    { id: 'deleted', status: 'approved', approval_origin: 'batch', teacher_reviewed_at: at, deleted_at: '2026-09-30T00:00:00Z' },
  ]
  const p = planStage5Rollback(backup, current, at)
  assert.deepEqual(p.restore.map((e) => e.id), ['ok', 'ok-prev'])
  assert.equal(p.restore[1].teacher_reviewed_at, '2026-09-20T00:00:00Z') // 바꾸기 전 교사 확인 시각으로 되돌린다
  assert.deepEqual(
    p.skipped.map((s) => [s.id, s.reason]),
    [['touched', 'touched_after'], ['archived', 'not_approved'], ['indiv', 'not_batch'], ['gone', 'missing'], ['deleted', 'deleted']],
  )
})

test('스크립트: 미리보기 기본, 범위 밖이면 멈춤, 백업 먼저, 200개씩, 기존 일괄 승인 값, 나중에 결정은 건드리지 않음', () => {
  const s = readFileSync(new URL('./stage5-bulk-approve.ts', import.meta.url), 'utf8')
  assert.match(s, /const APPLY = process\.argv\.includes\('--apply'\)/)
  assert.match(s, /if \(!inExpectedRange\(plan\.approve\.length\)\) \{[\s\S]*?process\.exit\(2\)/)
  assert.ok(s.indexOf('writeFileSync(\n  backupPath') < s.indexOf(".update({ status: 'approved'"), '백업이 적용보다 먼저')
  assert.match(s, /\.update\(\{ status: 'approved', approval_origin: 'batch', deferred_at: null, reject_reason: null, reject_note: null, teacher_reviewed_at: approvedAt \}\)/)
  assert.match(s, /\.eq\('status', 'pending'\)\s*\.is\('deferred_at', null\)/)
  assert.match(s, /selectAllPages</)
  assert.match(s, /chunk\(plan\.approve, ID_CHUNK\)/)
  const api = readFileSync(new URL('../app/api/vocabulary/bulk/route.ts', import.meta.url), 'utf8')
  assert.match(api, /approval_origin: 'batch'/) // 화면 일괄 사용하기와 같은 승인 경로
  const r = readFileSync(new URL('./stage5-rollback-bulk-approve.ts', import.meta.url), 'utf8')
  assert.match(r, /\.eq\('status', 'approved'\)\s*\.eq\('approval_origin', 'batch'\)\s*\.eq\('teacher_reviewed_at', backup\.approved_at\)/)
})

console.log(`\n모두 통과: ${passed}개`)
