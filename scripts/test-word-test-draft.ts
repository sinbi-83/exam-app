// 단어시험 만들기 화면: 학년·레벨·방향을 바꾼 뒤 다시 만들면 새 기준으로만 만들어지는지 (DB 접속 없음).
// 2026-09-28 버그 재현 테스트 (lib/wordTestDraft.ts 머리말 참고).
// 실행: npm run test-word-test-draft

import assert from 'node:assert/strict'
import { generateWordTest, isEligible } from '../lib/wordTest.ts'
import type { WordTestEntry } from '../lib/wordTest.ts'
import {
  draftIsCurrent,
  initialWordTestDraft,
  wordTestDraftReducer as reduce,
  type WordTestConditions,
  type WordTestDraft,
} from '../lib/wordTestDraft.ts'

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

// 중3 기준표 (config/vocabularyLevels.ts 와 같은 값). config 는 '@/' 경로를 써서 여기서 직접 import 하지 않는다.
const BANDS: Record<string, { min: number; max: number }> = {
  academy: { min: 38, max: 58 },
  prestudy: { min: 52, max: 72 },
}

// 난이도 30~80 단어 51개 (겹치는 구간 52~58 포함)
const entries: WordTestEntry[] = []
for (let d = 30; d <= 80; d++) {
  entries.push({
    id: `w${d}`,
    expression: `word${d}`,
    expression_key: `word${d}`,
    meaning_ko: `뜻${d}`,
    meaning_key: `뜻${d}`,
    accepted_meanings: [],
    pos: 'noun',
    entry_type: 'word',
    base_difficulty: d,
    ko_en_difficulty: null,
    ko_en_allowed: true,
    status: 'approved',
    deleted_at: null,
  })
}
function seeded(seed = 7) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

// 화면의 "단어 자동 선택" 버튼과 같은 순서로 초안을 만든다
function clickGenerate(state: WordTestDraft, count = 10): WordTestDraft {
  const conditions = state.conditions
  const s1 = reduce(state, { type: 'generateStart' })
  const items = generateWordTest(entries, BANDS[conditions.level], conditions.mode, count, seeded()).items
  return reduce(s1, { type: 'generateDone', seq: s1.seq, conditions, items })
}

const start: WordTestConditions = { grade: '중3', level: 'academy', mode: 'en_ko' }

test('레벨 A 생성 → B 로 변경 → 다시 생성: 결과가 B 기준과 정확히 일치', () => {
  let s = initialWordTestDraft(start)
  s = clickGenerate(s)
  assert.equal(s.items.length, 10)
  assert.ok(s.items.every((it) => isEligible(it.entry, 'en_ko', BANDS.academy)))

  s = reduce(s, { type: 'setConditions', patch: { level: 'prestudy' } })
  s = clickGenerate(s)
  assert.deepEqual(s.generatedFor, { grade: '중3', level: 'prestudy', mode: 'en_ko' })
  assert.equal(s.items.length, 10)
  for (const it of s.items) {
    const d = it.entry.base_difficulty!
    assert.ok(d >= 52 && d <= 72, `선행형 범위 밖 단어: ${it.entry.expression} (${d})`)
  }
  assert.equal(draftIsCurrent(s), true)
})

test('조건을 바꾸면 이전 미리보기가 즉시 지워져 저장할 수 없다', () => {
  let s = clickGenerate(initialWordTestDraft(start))
  assert.equal(draftIsCurrent(s), true)
  s = reduce(s, { type: 'setConditions', patch: { level: 'prestudy' } })
  assert.equal(s.items.length, 0)
  assert.equal(s.generatedFor, null)
  assert.equal(draftIsCurrent(s), false)
})

test('방향만 바꿔도(영→한 → 한→영) 초기화되고 새 방향으로 만들어진다', () => {
  let s = clickGenerate(initialWordTestDraft(start))
  s = reduce(s, { type: 'setConditions', patch: { mode: 'ko_en' } })
  assert.equal(s.items.length, 0)
  s = clickGenerate(s)
  assert.ok(s.items.length > 0 && s.items.every((it) => it.direction === 'ko_en'))
})

test('학년을 바꿔도 초기화된다', () => {
  let s = clickGenerate(initialWordTestDraft(start))
  s = reduce(s, { type: 'setConditions', patch: { grade: '중1' } })
  assert.equal(s.items.length, 0)
  assert.equal(s.conditions.grade, '중1')
})

test('같은 값을 다시 눌러도 미리보기는 유지된다', () => {
  const s = clickGenerate(initialWordTestDraft(start))
  const s2 = reduce(s, { type: 'setConditions', patch: { level: 'academy' } })
  assert.equal(s2, s)
})

test('불러오는 동안 레벨을 바꾸면 늦게 도착한 옛 결과는 버린다', () => {
  let s = initialWordTestDraft(start)
  s = reduce(s, { type: 'generateStart' })
  const pendingSeq = s.seq
  const oldItems = generateWordTest(entries, BANDS.academy, 'en_ko', 10, seeded()).items
  s = reduce(s, { type: 'setConditions', patch: { level: 'prestudy' } }) // 기다리는 중에 변경
  s = reduce(s, { type: 'generateDone', seq: pendingSeq, conditions: start, items: oldItems })
  assert.equal(s.items.length, 0)
  assert.equal(s.generatedFor, null)
})

test('A→B→A 로 여러 번 바꿔 만들어도 매번 마지막 기준과 일치', () => {
  let s = initialWordTestDraft(start)
  for (const level of ['academy', 'prestudy', 'academy', 'prestudy', 'prestudy', 'academy']) {
    s = reduce(s, { type: 'setConditions', patch: { level } })
    s = clickGenerate(s)
    assert.equal(s.generatedFor?.level, level)
    assert.ok(s.items.every((it) => isEligible(it.entry, 'en_ko', BANDS[level])))
  }
})

test('빼기·교체는 이번 초안의 제외 목록에 쌓이고, 조건 변경 시 함께 지워진다', () => {
  let s = clickGenerate(initialWordTestDraft(start))
  const firstId = s.items[0].entry.id
  s = reduce(s, { type: 'remove', index: 0 })
  assert.deepEqual(s.excluded, [firstId])
  s = reduce(s, { type: 'setConditions', patch: { level: 'prestudy' } })
  assert.deepEqual(s.excluded, [])
})

console.log(`\n모두 통과: ${passed}개`)
