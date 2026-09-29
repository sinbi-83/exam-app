// 6단계 B 지문 통합 목록 규칙 검사 (DB 접속 없음).
// 학년 표기 맞추기 / 난이도 한 눈금 환산 / 필터 / 읽기 전용(쓰기 API 없음) / 1,000행 나눠 읽기 / 옛 화면 유지
// 실행: npm run test-passage-unified

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  aiSetDifficulty,
  aiSetToRow,
  externalDifficulty,
  externalRows,
  externalToRow,
  filterUnifiedRows,
  normalizeGrade,
  sortUnifiedRows,
  UNIFIED_DIFFICULTY_LABELS,
} from '../lib/passageUnified.ts'

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

test('학년: "중학교 1학년" · "중1" · "고등학교 3학년" · "초등학교 4학년" → 한 가지 표기', () => {
  assert.equal(normalizeGrade('중학교 1학년'), '중1')
  assert.equal(normalizeGrade('중1'), '중1')
  assert.equal(normalizeGrade('중등 2학년'), '중2')
  assert.equal(normalizeGrade('고등학교 3학년'), '고3')
  assert.equal(normalizeGrade('고1'), '고1')
  assert.equal(normalizeGrade('초등학교 4학년'), '초4')
  assert.equal(normalizeGrade(' 초6 '), '초6')
  // 알아볼 수 없으면 null (화면에는 원래 글자)
  assert.equal(normalizeGrade('중학교 4학년'), null)
  assert.equal(normalizeGrade('성인'), null)
  assert.equal(normalizeGrade(''), null)
  assert.equal(normalizeGrade(null), null)
})

test('난이도 환산: 외부 4단계 → 1~4, AI beginner/intermediate/advanced(숫자 2/3/4) → 1~3', () => {
  assert.deepEqual(['school', 'academy', 'advanced', 'prestudy'].map(externalDifficulty), [1, 2, 3, 4])
  assert.equal(externalDifficulty(null), null)
  assert.equal(aiSetDifficulty(['beginner']), 1)
  assert.equal(aiSetDifficulty([3, '3']), 2)
  assert.equal(aiSetDifficulty(['advanced', 4]), 3)
  assert.deepEqual(UNIFIED_DIFFICULTY_LABELS, { 1: '기초', 2: '표준', 3: '심화', 4: '선행' })
})

test('AI 세트 난이도: 가장 많은 난이도, 같은 수면 높은 쪽, 문항 없으면 미정', () => {
  assert.equal(aiSetDifficulty(['beginner', 'beginner', 'advanced']), 1)
  assert.equal(aiSetDifficulty(['beginner', 'advanced']), 3)
  assert.equal(aiSetDifficulty(['intermediate', 'beginner', 'intermediate', 'advanced', 'advanced']), 3)
  assert.equal(aiSetDifficulty([]), null)
  assert.equal(aiSetDifficulty(['???', null]), null)
})

const ai = aiSetToRow({
  id: 'a1', grade: '중학교 1학년', topic: '우정', created_at: '2026-09-01T00:00:00Z',
  questions: [{ difficulty: 'intermediate' }, { difficulty: 'intermediate' }],
  summary_questions: [{ difficulty: 'beginner' }],
  reading_questions: null,
  essay_questions: [{ level: 'advanced' }],
})
const ext = externalToRow({
  id: 'e1', title: 'My Best Friend', level: '중1', variant_level: 'advanced', archived: false, group_archived: null,
  created_at: '2026-09-02T00:00:00Z', question_count: 20, essay_count: 5,
})
const extArchivedByGroup = externalToRow({
  id: 'e2', title: 'Old', level: '고2', variant_level: 'prestudy', archived: false, group_archived: true,
  created_at: '2026-08-01T00:00:00Z', question_count: 3, essay_count: 0,
})

test('한 줄 모양: 종류·학년·난이도·문항 수·원래 화면 링크', () => {
  assert.deepEqual(
    { kind: ai.kind, grade: ai.grade, gradeRaw: ai.gradeRaw, difficulty: ai.difficulty, count: ai.questionCount, archived: ai.archived, href: ai.href },
    { kind: 'ai', grade: '중1', gradeRaw: '중학교 1학년', difficulty: 2, count: 4, archived: false, href: '/materials/questions/a1' },
  )
  assert.deepEqual(
    { kind: ext.kind, grade: ext.grade, difficulty: ext.difficulty, raw: ext.difficultyRaw, count: ext.questionCount, href: ext.href },
    { kind: 'external', grade: '중1', difficulty: 3, raw: '상위학원형', count: 25, href: '/materials/passages/external/e1' },
  )
  // 그룹 소속 지문은 그룹 보관 여부를 따른다
  assert.equal(extArchivedByGroup.archived, true)
})

test('필터: 종류 · 학년 · 난이도 · 보관 포함', () => {
  const rows = sortUnifiedRows([ai, ext, extArchivedByGroup])
  assert.deepEqual(rows.map((r) => r.id), ['e1', 'a1', 'e2'])
  const base = { kind: 'all', grade: 'all', difficulty: 'all', includeArchived: false } as const
  assert.deepEqual(filterUnifiedRows(rows, base).map((r) => r.id), ['e1', 'a1'])
  assert.deepEqual(filterUnifiedRows(rows, { ...base, includeArchived: true }).map((r) => r.id), ['e1', 'a1', 'e2'])
  assert.deepEqual(filterUnifiedRows(rows, { ...base, kind: 'ai' }).map((r) => r.id), ['a1'])
  assert.deepEqual(filterUnifiedRows(rows, { ...base, grade: '중1' }).map((r) => r.id), ['e1', 'a1'])
  assert.deepEqual(filterUnifiedRows(rows, { ...base, difficulty: 3 }).map((r) => r.id), ['e1'])
  const unknown = aiSetToRow({ id: 'a2', grade: '기타', topic: null, created_at: '2026-07-01T00:00:00Z', questions: [] })
  assert.deepEqual(filterUnifiedRows([unknown], { ...base, grade: 'unknown', difficulty: 'unknown' }).map((r) => r.id), ['a2'])
})

test('외부지문 4단계 세트는 한 줄: 단계 배지·열기·문항 수 합계·난이도 필터(하나라도 맞으면)', () => {
  const member = (id: string, v: string | null, extra: object = {}) => ({
    id, group_id: 'g1', group_title: '로켓 삼촌', title: `로켓 삼촌 (${v})`, level: '초6', variant_level: v, archived: false,
    group_archived: false, created_at: `2026-09-0${id.slice(-1)}T00:00:00Z`, question_count: 10, essay_count: 2, ...extra,
  })
  const rows = externalRows([
    member('p3', 'advanced'),
    member('p1', 'school'),
    member('p2', 'academy'),
    { id: 's1', title: '단독 지문', level: '중1', variant_level: null, archived: false, created_at: '2026-09-05T00:00:00Z', question_count: 5, essay_count: 0 },
  ])
  assert.equal(rows.length, 2)
  const g = rows.find((r) => r.isGroup)!
  assert.equal(g.id, 'g1')
  assert.equal(g.title, '로켓 삼촌')
  assert.equal(g.grade, '초6')
  assert.deepEqual(g.levels.map((l) => [l.label, l.href]), [
    ['학교형', '/materials/passages/external/p1'],
    ['일반학원형', '/materials/passages/external/p2'],
    ['상위학원형', '/materials/passages/external/p3'],
  ])
  assert.deepEqual(g.difficulties, [1, 2, 3])
  assert.equal(g.href, '/materials/passages/external/p1') // 열기 = 가장 쉬운 단계 지문
  assert.equal(g.questionCount, 36)
  assert.equal(g.createdAt, '2026-09-01T00:00:00Z')
  const single = rows.find((r) => !r.isGroup)!
  assert.deepEqual([single.id, single.difficulties, single.levels], ['s1', [], []])

  const base = { kind: 'all', grade: 'all', difficulty: 'all', includeArchived: false } as const
  assert.deepEqual(filterUnifiedRows(rows, { ...base, difficulty: 2 }).map((r) => r.id), ['g1']) // 가진 단계 중 하나
  assert.deepEqual(filterUnifiedRows(rows, { ...base, difficulty: 4 }).map((r) => r.id), [])
  assert.deepEqual(filterUnifiedRows(rows, { ...base, difficulty: 'unknown' }).map((r) => r.id), ['s1'])
  // 묶음이 보관되면 한 줄 전체가 보관
  const archived = externalRows([member('p1', 'school', { group_archived: true }), member('p2', 'academy', { group_archived: true })])
  assert.equal(archived[0].archived, true)
  assert.deepEqual(filterUnifiedRows(archived, base), [])
})

test('읽기 전용: 통합 API 는 GET 만, 두 표를 1,000행씩 나눠 읽는다. 옛 화면은 그대로 있다', () => {
  const api = readFileSync(new URL('../app/api/passages-unified/route.ts', import.meta.url), 'utf8')
  assert.match(api, /export async function GET/)
  assert.doesNotMatch(api, /export async function (POST|PATCH|PUT|DELETE)/)
  assert.doesNotMatch(api, /\.(insert|update|delete|upsert)\(/)
  assert.equal((api.match(/selectAllPages</g) ?? []).length, 2)
  assert.match(api, /from\('question_sets'\)/)
  assert.match(api, /from\('passages'\)/)
  const page = readFileSync(new URL('../app/materials/passages/all/page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /method: '(DELETE|PATCH|POST)'/)
  for (const p of ['../app/materials/passages/ai/page.tsx', '../app/materials/passages/external/page.tsx', '../app/materials/passages/page.tsx']) {
    assert.ok(existsSync(new URL(p, import.meta.url)), p)
  }
})

console.log(`\n모두 통과: ${passed}개`)
