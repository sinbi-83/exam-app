// 반 관리 0단계 점검 (DB·서버 접속 없음).
//   1) 출석 화면: 한국 날짜 기본값, 월 말일이 월간 요약 범위에 들어가는지
//   2) /api/generate: 로그인 검사가 AI 호출보다 먼저, 401
//   3) POST /api/exam-questions: 시험 소유 확인이 저장보다 먼저, 내 시험이 아니면 403
// 실행: npm run test-class-stage0

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { kstDateString, monthRange } from '../lib/dashboard.ts'
import { checkExamOwnership } from '../lib/examOwnership.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf-8')

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  await fn()
  passed++
  console.log(`✅ ${name}`)
}

// 월간 요약과 같은 조건: /api/attendance 의 gte(from), lte(to)
const inRange = (date: string, range: { from: string; to: string }) => date >= range.from && date <= range.to

// supabase 흉내: exams 표에서 id·user_id 가 모두 맞는 행만 돌려준다
function fakeSupabase(rows: { id: string; user_id: string }[], failure?: { code: string; message: string }) {
  const filters: Record<string, unknown> = {}
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters[column] = value
      return query
    },
    maybeSingle: async () => {
      if (failure) return { data: null, error: failure }
      const row = rows.find((r) => r.id === filters.id && r.user_id === filters.user_id)
      return { data: row ? { id: row.id } : null, error: null }
    },
  }
  return {
    from: (table: string) => {
      assert.equal(table, 'exams')
      return query
    },
  } as unknown as SupabaseClient
}

await test('한국 날짜: UTC 로 전날 저녁이어도 한국 아침이면 오늘', () => {
  assert.equal(kstDateString(new Date('2026-10-31T23:30:00Z')), '2026-11-01') // 한국 11/1 오전 8:30
  assert.equal(kstDateString(new Date('2026-11-01T14:59:00Z')), '2026-11-01') // 한국 11/1 오후 11:59
  assert.equal(kstDateString(new Date('2026-11-01T15:00:00Z')), '2026-11-02') // 한국 11/2 0시
})

await test('월 범위: 달마다 첫날·말일이 맞다 (윤년 포함)', () => {
  assert.deepEqual(monthRange('2026-11-15'), { from: '2026-11-01', to: '2026-11-30' })
  assert.deepEqual(monthRange('2026-12-01'), { from: '2026-12-01', to: '2026-12-31' })
  assert.deepEqual(monthRange('2027-01-31'), { from: '2027-01-01', to: '2027-01-31' })
  assert.deepEqual(monthRange('2026-02-10'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(monthRange('2028-02-10'), { from: '2028-02-01', to: '2028-02-29' })
})

await test('월간 요약: 말일 출석은 포함, 다음 달 1일과 지난달 말일은 제외', () => {
  const range = monthRange('2026-11-15')
  assert.ok(inRange('2026-11-30', range))
  assert.ok(inRange('2026-11-01', range))
  assert.ok(!inRange('2026-12-01', range))
  assert.ok(!inRange('2026-10-31', range))
})

await test('예전 계산은 한국 시간대에서 말일을 뺐다 (고친 이유 기록)', () => {
  // 한국 11/30 0시 = UTC 11/29 15시 → toISOString 날짜는 11/29
  const koreanMidnight = new Date('2026-11-30T00:00:00+09:00')
  assert.equal(koreanMidnight.toISOString().slice(0, 10), '2026-11-29')
  assert.equal(monthRange('2026-11-15').to, '2026-11-30')
})

await test('출석 화면과 API: 공용 함수를 쓰고, 범위 양끝을 포함한다', () => {
  const page = read('app/attendance/page.tsx')
  assert.match(page, /const today = kstDateString\(new Date\(\)\)/)
  assert.match(page, /const \{ from, to \} = monthRange\(date\)/)
  assert.doesNotMatch(page, /toISOString/)
  const api = read('app/api/attendance/route.ts')
  assert.match(api, /gte\('date', from\)/)
  assert.match(api, /lte\('date', to\)/)
})

await test('/api/generate: 로그인 없으면 401, AI 호출보다 먼저 검사', () => {
  const route = read('app/api/generate/route.ts')
  assert.match(route, /status: 401/)
  const authAt = route.indexOf('auth.getUser()')
  assert.ok(authAt > -1)
  assert.ok(authAt < route.indexOf('req.json()'))
  assert.ok(authAt < route.indexOf('generateExamQuestions(systemPrompt'))
})

await test('시험 소유: 내 시험만 통과', async () => {
  const supabase = fakeSupabase([{ id: 'mine', user_id: 'me' }, { id: 'theirs', user_id: 'other' }])
  assert.deepEqual(await checkExamOwnership(supabase, 'mine', 'me'), { ok: true })
})

await test('시험 소유: 남의 시험·없는 시험은 403', async () => {
  const supabase = fakeSupabase([{ id: 'theirs', user_id: 'other' }])
  for (const examId of ['theirs', 'missing']) {
    const result = await checkExamOwnership(supabase, examId, 'me')
    assert.equal(result.ok, false)
    assert.equal(!result.ok && result.status, 403)
  }
})

await test('시험 소유: uuid 형식 오류는 403, 그 밖의 DB 오류는 500', async () => {
  const badId = await checkExamOwnership(fakeSupabase([], { code: '22P02', message: 'invalid uuid' }), 'abc', 'me')
  assert.equal(!badId.ok && badId.status, 403)
  const down = await checkExamOwnership(fakeSupabase([], { code: 'XX000', message: 'db down' }), 'mine', 'me')
  assert.equal(!down.ok && down.status, 500)
})

await test('POST /api/exam-questions: 소유 확인이 저장보다 먼저', () => {
  const route = read('app/api/exam-questions/route.ts')
  const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function DELETE'))
  const checkAt = post.indexOf('checkExamOwnership(supabase, exam_id, user.id)')
  assert.ok(checkAt > -1)
  assert.ok(post.indexOf('auth.getUser()') < checkAt)
  assert.ok(checkAt < post.indexOf('.insert('))
  assert.match(post, /status: ownership\.status/)
})

console.log(`\n${passed}개 통과`)
