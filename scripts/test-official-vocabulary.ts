// 공식 기본어휘 기준표 + 난이도 재조정 제안 규칙 + 3단계 migration 정적 점검 (DB 접속 없음)
// 실행: npm run test-official-vocabulary

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildOfficialIndex,
  OFFICIAL_LIST_VERSION,
  officialMatchLabel,
  officialMatchOf,
  parseCsv,
  parseOfficialCsv,
  tierCounts,
} from '../lib/officialVocabulary.ts'
import { proposeReanchor } from '../lib/vocabularyReanchor.ts'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✅ ${name}`)
}

const csvText = readFileSync(resolve(process.cwd(), 'data/official/kr-curriculum-2022-basic-vocabulary-3000.csv'), 'utf-8')
const { rows, errors } = parseOfficialCsv(csvText)

test('원본 CSV: 3,000개, 초등 권장 800 / 중·고 공통 1,200 / 그 외 1,000, 버전 kr-curriculum-2022', () => {
  assert.deepEqual(errors, [])
  assert.equal(rows.length, 3000)
  assert.deepEqual(tierCounts(rows), { elementary: 800, common: 1200, elective: 1000 })
  assert.ok(rows.every((r) => r.list_version === OFFICIAL_LIST_VERSION))
  assert.deepEqual(rows.map((r) => r.list_no), Array.from({ length: 3000 }, (_, i) => i + 1))
})
test('원본 줄 그대로 보존: 첫 줄 a* (an), 다른 철자·파생어 분리', () => {
  assert.deepEqual(rows[0], {
    list_version: 'kr-curriculum-2022', list_no: 1, headword: 'a', variants: [], derivatives: ['an'],
    tier_code: 'elementary', tier_mark: '*', tier_label: '초등학교 권장(*)', source_raw: 'a* (an)',
  })
  const analyze = rows.find((r) => r.headword === 'analyze')!
  assert.deepEqual(analyze.variants, ['analyse'])
})
test('CSV 파서: 따옴표 안 쉼표, BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\n"x, y",z\n'), [['a', 'b'], ['x, y', 'z']])
})
test('머리글이 다르면 한 줄도 돌려주지 않는다', () => {
  const bad = parseOfficialCsv('no,word\n1,a\n')
  assert.equal(bad.rows.length, 0)
  assert.ok(bad.errors.length > 0)
})

const index = buildOfficialIndex(rows)
test('단어은행 대조: 표제어 / 다른 철자 / 괄호 안 파생어 (표제어가 파생어보다 우선)', () => {
  assert.deepEqual(officialMatchOf('Apple', index), { tier: 'elementary', via: 'headword', headword: 'apple' })
  assert.equal(officialMatchOf('analyse', index)?.via, 'variant')
  assert.deepEqual(officialMatchOf('enjoy', index), { tier: 'common', via: 'derivative', headword: 'joy' })
  assert.equal(officialMatchOf('account for', index), null)
  assert.equal(officialMatchLabel(officialMatchOf('enjoy', index)), '중·고 공통(**) · joy의 파생어')
  assert.equal(officialMatchLabel(null), '-')
})

test('재조정 제안: 하한 기준점 1~10 → 1~15', () => {
  assert.equal(proposeReanchor({ current: 1, group: 'floor', official: null }).proposed, 1)
  assert.equal(proposeReanchor({ current: 10, group: 'floor', official: null }).proposed, 15)
})
test('재조정 제안: 상한 기준점은 유지 (공식 등급이 낮으면 확인 필요 표시)', () => {
  const p = proposeReanchor({ current: 91, group: 'ceiling', official: { tier: 'common', via: 'headword', headword: 'address' } })
  assert.equal(p.proposed, 91)
  assert.match(p.reason, /확인 필요/)
})
test('재조정 제안: 중1 기초 단어는 15~58 로 옮기고 공식 등급 구간 안으로', () => {
  assert.equal(proposeReanchor({ current: 1, group: 'middle', official: null }).proposed, 15)
  assert.equal(proposeReanchor({ current: 75, group: 'middle', official: null }).proposed, 58)
  // 초등 권장은 30 이하
  const el = proposeReanchor({ current: 60, group: 'middle', official: { tier: 'elementary', via: 'headword', headword: 'x' } })
  assert.equal(el.proposed, 30)
  assert.match(el.reason, /초등 권장이라 30 이하로/)
  // 중·고 공통은 25 이상
  assert.equal(proposeReanchor({ current: 3, group: 'middle', official: { tier: 'common', via: 'headword', headword: 'x' } }).proposed, 25)
  // 파생어는 자르지 않는다
  const d = proposeReanchor({ current: 3, group: 'middle', official: { tier: 'common', via: 'derivative', headword: 'joy' } })
  assert.equal(d.proposed, 16)
  assert.match(d.reason, /joy의 파생어/)
})

const sql = readFileSync(resolve(process.cwd(), 'stage3-official-vocabulary-migration.sql'), 'utf-8')
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').toLowerCase()
test('3단계 migration: 새 표 official_vocabulary 만 만든다 (기존 표 변경 0, 데이터 변경 0, 수정 정책 없음)', () => {
  const touched = Array.from(code.matchAll(/(?:create table if not exists|alter table|\bon)\s+([a-z_.]+)/g))
    .map((m) => m[1])
    .filter((t) => t !== 'delete' && t !== 'update')
  assert.deepEqual([...new Set(touched)], ['official_vocabulary'])
  assert.ok(!/^\s*(update|insert|delete|truncate|drop table)\b/m.test(code))
  assert.ok(!/for update|for all/.test(code))
  assert.match(code, /tier_code in \('elementary', 'common', 'elective'\)/)
  assert.match(code, /enable row level security/)
})

console.log(`\n모두 통과: ${passed}개`)
