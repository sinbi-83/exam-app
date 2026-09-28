// 시험 종류(exam_type) 규칙 + 1단계 migration 파일 정적 점검
// 실행: npm run test-exam-type

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inferExamType, isExamType, resolveExamType } from '../lib/examType.ts'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✅ ${name}`)
}

const word = { question_data: { type: 'word' } }
const mc = { question_data: { type: 'mc' } }

test('시험 종류는 problem / word 두 값만', () => {
  assert.ok(isExamType('problem'))
  assert.ok(isExamType('word'))
  assert.ok(!isExamType('placement'))
  assert.ok(!isExamType(null))
})
test('추론: 전부 word 면 단어 시험, 섞였거나 비었으면 문제 시험', () => {
  assert.equal(inferExamType([word, word]), 'word')
  assert.equal(inferExamType([word, mc]), 'problem')
  assert.equal(inferExamType([]), 'problem')
})
test('저장된 값이 있으면 저장된 값이 우선, 없으면 추론 (fallback)', () => {
  assert.equal(resolveExamType('word', [word, mc]), 'word')
  assert.equal(resolveExamType('problem', [word]), 'problem')
  assert.equal(resolveExamType(null, [word]), 'word')
  assert.equal(resolveExamType(undefined, [mc]), 'problem')
  assert.equal(resolveExamType('placement', [word]), 'word')
})

const sql = readFileSync(resolve(process.cwd(), 'stage1-vocabulary-exam-type-migration.sql'), 'utf-8')
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').toLowerCase()
test('1단계 migration: 칸 추가만, 데이터 변경 문장 없음, transaction', () => {
  assert.match(code, /alter table vocabulary_entries add column if not exists deferred_at timestamptz;/)
  assert.match(code, /alter table exams add column if not exists exam_type text;/)
  assert.match(code, /check \(exam_type is null or exam_type in \('problem', 'word'\)\)/)
  assert.match(code, /check \(deferred_at is null or status = 'pending'\)/)
  assert.match(code, /'legacy_review', 'owner_approval'/)
  assert.ok(!/^\s*(update|insert|delete|truncate|drop table)\b/m.test(code))
  assert.ok(!/drop column|rename/.test(code))
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean)
  assert.equal(lines[0], 'begin;')
  assert.ok(lines.includes('commit;'))
})

console.log(`\n모두 통과: ${passed}개`)
