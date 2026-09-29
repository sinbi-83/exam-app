// 탭 옆 개수 = 실제로 보이는 목록 개수 점검 (DB 접속 없음, 파일만 본다).
//   시험지 보관함(/tests): 전체/문제/단어 개수와 목록이 모두 검색어로 거른 같은 목록에서 나온다
//   외부지문저장소: 전체 자료/보관함 개수가 검색·필터를 반영한 줄(rows)에서 나온다 (4단계 세트는 1줄)
// 실행: npm run test-tab-counts

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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

test('시험지 보관함: 개수와 목록이 같은 검색 결과(searched)에서 나온다', () => {
  const code = readFileSync(new URL('../app/tests/page.tsx', import.meta.url), 'utf8')
  assert.match(code, /all: searched\.length/)
  assert.match(code, /problem: searched\.filter\(\(e\) => e\.exam_type === 'problem'\)\.length/)
  assert.match(code, /word: searched\.filter\(\(e\) => e\.exam_type === 'word'\)\.length/)
  assert.match(code, /const shown = useMemo\(\s*\(\) => searched\.filter\(\(e\) => typeFilter === 'all' \|\| e\.exam_type === typeFilter\)/)
  assert.doesNotMatch(code, /exams\.filter\(\(e\) => e\.exam_type ===/) // 전체 목록으로 세지 않는다
})

test('외부지문저장소: 탭 개수는 검색·필터가 반영된 rows 로, 보이는 목록과 같은 기준(archived)으로 센다', () => {
  const code = readFileSync(new URL('../app/materials/passages/external/page.tsx', import.meta.url), 'utf8')
  assert.match(code, /active: rows\.filter\(\(row\) => !row\.archived\)\.length, archived: rows\.filter\(\(row\) => row\.archived\)\.length/)
  assert.match(code, /const visibleRows = useMemo\(\(\) => rows\.filter\(\(row\) => row\.archived === \(tab === 'archived'\)\)/)
  assert.match(code, /for \(const item of filtered\)/) // rows 는 검색·필터 결과로 만든다
  assert.ok(code.indexOf('const counts') > code.indexOf('const rows'), 'counts 는 rows 다음에 계산')
})

console.log(`\n모두 통과: ${passed}개`)
