// 단어은행 자동 단어시험 규칙 검사 (DB 접속 없음).
// 실행: npm run test-word-test

import assert from 'node:assert/strict'
import {
  convertWordTest,
  generateWordTest,
  isEligible,
  isWordTestExam,
  pickReplacement,
  studySheetRows,
  studySheetTitle,
  toWordQuestionData,
} from '../lib/wordTest.ts'
import type { WordTestEntry } from '../lib/wordTest.ts'

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

let n = 0
function e(expression: string, meaning: string, diff: number | null, extra: Partial<WordTestEntry> = {}): WordTestEntry {
  n++
  return {
    id: `id-${n}`,
    expression,
    expression_key: expression.toLowerCase(),
    meaning_ko: meaning,
    meaning_key: meaning,
    accepted_meanings: [],
    pos: 'noun',
    entry_type: 'word',
    base_difficulty: diff,
    ko_en_difficulty: null,
    ko_en_allowed: true,
    status: 'approved',
    deleted_at: null,
    ...extra,
  }
}
const band = { min: 10, max: 30 }
// 고정 난수 (매번 같은 결과)
function seeded(seed = 1) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

test('승인·미삭제·범위 안만 출제 (1~3)', () => {
  assert.equal(isEligible(e('a', '가', 20), 'en_ko', band), true)
  assert.equal(isEligible(e('a', '가', 20, { status: 'pending' }), 'en_ko', band), false)
  assert.equal(isEligible(e('a', '가', 20, { deleted_at: '2026-01-01' }), 'en_ko', band), false)
  assert.equal(isEligible(e('a', '가', 31), 'en_ko', band), false)
  assert.equal(isEligible(e('a', '가', 9), 'en_ko', band), false)
  assert.equal(isEligible(e('a', '가', null), 'en_ko', band), false)
})
test('한→영은 ko_en_allowed 인 것만, 예외 난이도 우선 (4)', () => {
  assert.equal(isEligible(e('a', '가', 20, { ko_en_allowed: false }), 'ko_en', band), false)
  assert.equal(isEligible(e('a', '가', 20, { ko_en_allowed: false }), 'en_ko', band), true)
  assert.equal(isEligible(e('a', '가', 20, { ko_en_difficulty: 50 }), 'ko_en', band), false)
})
test('같은 표현의 다른 뜻은 한 시험에 하나만 (5)', () => {
  const list = [e('interest', '흥미', 20), e('interest', '이자', 25)]
  for (let s = 1; s < 20; s++) assert.equal(generateWordTest(list, band, 'en_ko', 2, seeded(s)).items.length, 1)
})
test('한→영에서 같은 한국어 뜻의 다른 영어 답은 하나만 (6)', () => {
  const list = [e('glad', '기쁜', 20), e('pleased', '기쁜', 20)]
  assert.equal(generateWordTest(list, band, 'ko_en', 2, seeded()).items.length, 1)
  // 영→한이면 둘 다 가능 (제시어가 서로 다르다)
  assert.equal(generateWordTest(list, band, 'en_ko', 2, seeded()).items.length, 2)
})
test('후보 부족 시 다른 범위에서 채우지 않고 부족을 알린다 (7)', () => {
  const list = [e('a', '가', 20), e('b', '나', 25), e('c', '다', 50), e('d', '라', 5)]
  const r = generateWordTest(list, band, 'en_ko', 10, seeded())
  assert.equal(r.items.length, 2)
  assert.equal(r.shortage, true)
  assert.ok(r.items.every((i) => ['a', 'b'].includes(i.entry.expression)))
})
test('혼합: 한→영은 절반까지, 영→한 먼저 정렬', () => {
  const list = Array.from({ length: 12 }, (_, i) => e(`w${i}`, `뜻${i}`, 20))
  const r = generateWordTest(list, band, 'mixed', 10, seeded())
  assert.equal(r.items.length, 10)
  assert.equal(r.items.filter((i) => i.direction === 'ko_en').length, 5)
  const firstKo = r.items.findIndex((i) => i.direction === 'ko_en')
  assert.ok(r.items.slice(firstKo).every((i) => i.direction === 'ko_en'))
  assert.equal(new Set(r.items.map((i) => i.entry.id)).size, 10)
})
test('혼합: 한→영 가능 단어가 없으면 전부 영→한', () => {
  const list = Array.from({ length: 6 }, (_, i) => e(`x${i}`, `뜻x${i}`, 20, { ko_en_allowed: false }))
  const r = generateWordTest(list, band, 'mixed', 6, seeded())
  assert.equal(r.items.length, 6)
  assert.ok(r.items.every((i) => i.direction === 'en_ko'))
})
test('교체: 같은 방향, 이미 뺀 단어·시험에 있는 단어·충돌 단어 제외', () => {
  const a = e('a', '가', 20), b = e('b', '나', 20), c = e('c', '다', 20), dup = e('A', '가2', 20), removed = e('r', '라', 20)
  const items = [{ entry: a, direction: 'en_ko' as const }, { entry: b, direction: 'en_ko' as const }]
  for (let s = 1; s < 20; s++) {
    const r = pickReplacement([a, b, c, dup, removed], band, items, 1, new Set([removed.id]), seeded(s))
    // dup(expression_key 'a')는 a 와 충돌 → c 만 가능
    assert.equal(r?.entry.id, c.id)
    assert.equal(r?.direction, 'en_ko')
  }
  assert.equal(pickReplacement([a, b], band, items, 1, new Set(), seeded()), null)
})
test('snapshot: 영→한/한→영 제시어·정답·인정답·출처', () => {
  const w = e('advice', '조언', 20, { accepted_meanings: ['충고'] })
  const en = toWordQuestionData({ entry: w, direction: 'en_ko' })
  assert.equal(en.type, 'word')
  assert.equal(en.question, 'advice')
  assert.equal(en.answer, '조언')
  assert.deepEqual(en.accepted_answers, ['조언', '충고'])
  assert.equal(en.source, 'vocabulary_bank')
  assert.equal(en.source_vocabulary_entry_id, w.id)
  const ko = toWordQuestionData({ entry: w, direction: 'ko_en' })
  assert.equal(ko.question, '조언')
  assert.equal(ko.answer, 'advice')
  assert.deepEqual(ko.accepted_answers, ['advice'])
  // snapshot 은 복사본: 원본을 바꿔도 그대로
  w.meaning_ko = '바뀜'
  assert.equal(en.answer, '조언')
})
test('단어시험 판정: 전부 word 일 때만', () => {
  assert.equal(isWordTestExam([{ question_data: { type: 'word' } }]), true)
  assert.equal(isWordTestExam([{ question_data: { type: 'word' } }, { question_data: { type: 'mc' } }]), false)
  assert.equal(isWordTestExam([]), false)
})
test('학습지: 영→한/한→영 문항 모두 철자+뜻, 알파벳순, 다른 뜻은 영→한 문항에서만', () => {
  const a = e('Zebra', '얼룩말', 20, { accepted_meanings: ['얼룩말 무늬'] })
  const b = e('apple', '사과', 20)
  const rows = studySheetRows([
    { id: 'q1', question_data: toWordQuestionData({ entry: a, direction: 'en_ko' }) },
    { id: 'q2', question_data: toWordQuestionData({ entry: b, direction: 'ko_en' }) },
  ])
  assert.deepEqual(rows.map((r) => r.expression), ['apple', 'Zebra'])
  assert.equal(rows[0].meaning, '사과')
  assert.deepEqual(rows[1].other_meanings, ['얼룩말 무늬'])
  assert.equal(rows[1].pos, 'noun')
})
test('학습지: snapshot 에 expression/meaning_ko 가 없어도 방향으로 복원', () => {
  const rows = studySheetRows([{ id: 'q', question_data: { direction: 'ko_en', question: '사과', answer: 'apple' } }])
  assert.equal(rows[0].expression, 'apple')
  assert.equal(rows[0].meaning, '사과')
})
test('학습지 제목', () => {
  assert.equal(studySheetTitle('중1 일반학원형 단어시험 (영→한)'), '중1 일반학원형 단어 학습지')
  assert.equal(studySheetTitle('3주차 테스트'), '3주차 테스트 — 단어 학습지')
})
test('형태 바꾸기: 같은 단어 그대로, 한→영 불가·뜻 겹침은 영→한 유지', () => {
  const words = [
    e('one', '하나', 20), e('two', '둘', 20), e('three', '셋', 20, { ko_en_allowed: false }),
    e('big', '큰', 20), e('large', '큰', 20),
  ]
  const src = words.map((w) => toWordQuestionData({ entry: w, direction: 'en_ko' }))
  const r = convertWordTest(src, words, 'ko_en', seeded(3))
  assert.equal(r.questions.length, 5)
  assert.deepEqual(new Set(r.questions.map((q) => q.source_vocabulary_entry_id)), new Set(words.map((w) => w.id)))
  assert.equal(r.koEnWanted, 5)
  assert.equal(r.koEnCount, 3) // three 불가, big/large 중 하나만
  assert.equal(r.questions.find((q) => q.expression === 'three')!.direction, 'en_ko')
  assert.equal(r.questions.filter((q) => q.direction === 'ko_en' && q.meaning_ko === '큰').length, 1)
  // 영→한 먼저
  assert.deepEqual(r.questions.map((q) => q.direction), ['en_ko', 'en_ko', 'ko_en', 'ko_en', 'ko_en'])
})
test('형태 바꾸기: 혼합은 절반까지, 영→한은 전부, 단어은행에 없는 단어는 영→한', () => {
  const words = [e('a1', '가1', 20), e('a2', '가2', 20), e('a3', '가3', 20), e('a4', '가4', 20)]
  const src = words.map((w) => toWordQuestionData({ entry: w, direction: 'ko_en' }))
  assert.equal(convertWordTest(src, words, 'mixed', seeded(5)).koEnCount, 2)
  const en = convertWordTest(src, words, 'en_ko', seeded(5))
  assert.ok(en.questions.every((q) => q.direction === 'en_ko' && q.question === q.expression))
  assert.equal(convertWordTest(src, [], 'ko_en', seeded(5)).koEnCount, 0)
})
test('형태 바꾸기: 한→영 → 영→한 으로 바꿀 때 단어은행의 인정 뜻을 가져온다', () => {
  const w = e('advice', '조언', 20, { accepted_meanings: ['충고'] })
  const r = convertWordTest([toWordQuestionData({ entry: w, direction: 'ko_en' })], [w], 'en_ko')
  assert.deepEqual(r.questions[0].accepted_answers, ['조언', '충고'])
})

console.log(`\n모두 통과: ${passed}개`)
