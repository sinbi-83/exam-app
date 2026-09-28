// 1,000행 제한 나눠 읽기 검사 (DB 접속 없음, 가짜 데이터).
// 실행: npm run test-supabase-paging

import assert from 'node:assert/strict'
import { chunk, selectAllPages, SUPABASE_PAGE_SIZE } from '../lib/supabasePaging.ts'

let passed = 0
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`✅ ${name}`)
  } catch (err) {
    console.error(`❌ ${name}`)
    throw err
  }
}

// Supabase 처럼: range(from, to) 를 받아도 한 번에 최대 1,000행만 돌려준다
function fakeTable(total: number, serverMax = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: `id-${String(i).padStart(5, '0')}`, n: i }))
  const calls: [number, number][] = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    const end = Math.min(to + 1, from + serverMax)
    return { data: rows.slice(from, end), error: null }
  }
  return { rows, calls, page }
}

await test('가짜 2,500행을 전부 읽는다 (1,000 + 1,000 + 500)', async () => {
  const t = fakeTable(2500)
  const { data, error } = await selectAllPages(t.page)
  assert.equal(error, null)
  assert.equal(data.length, 2500)
  assert.equal(new Set(data.map((r) => r.id)).size, 2500) // 겹침 없음
  assert.deepEqual(data.map((r) => r.n), t.rows.map((r) => r.n)) // 빠짐·순서 바뀜 없음
  assert.deepEqual(t.calls, [[0, 999], [1000, 1999], [2000, 2999]])
})

await test('예전 방식(한 번만 읽기)은 1,000에서 잘린다 — 고치기 전 버그 재현', async () => {
  const t = fakeTable(2500)
  const once = await t.page(0, 4999)
  assert.equal(once.data.length, SUPABASE_PAGE_SIZE)
})

await test('정확히 1,000의 배수(2,000)면 빈 페이지 한 번 더 읽고 끝난다', async () => {
  const t = fakeTable(2000)
  const { data } = await selectAllPages(t.page)
  assert.equal(data.length, 2000)
  assert.equal(t.calls.length, 3)
})

await test('0행이면 빈 목록', async () => {
  const { data, error } = await selectAllPages(fakeTable(0).page)
  assert.equal(error, null)
  assert.equal(data.length, 0)
})

await test('중간 페이지 오류는 그대로 돌려준다 (조용히 일부만 쓰지 않게)', async () => {
  let call = 0
  const { error } = await selectAllPages(async (from, to) => {
    call++
    if (call === 2) return { data: null, error: { message: '연결 끊김' } }
    return { data: Array.from({ length: to - from + 1 }, (_, i) => from + i), error: null }
  })
  assert.equal(error?.message, '연결 끊김')
})

await test('chunk: 2,500개를 200개씩 → 13묶음, 합치면 원래 목록', () => {
  const ids = Array.from({ length: 2500 }, (_, i) => i)
  const parts = chunk(ids, 200)
  assert.equal(parts.length, 13)
  assert.ok(parts.every((p) => p.length <= 200))
  assert.deepEqual(parts.flat(), ids)
})

console.log(`\n모두 통과: ${passed}개`)
