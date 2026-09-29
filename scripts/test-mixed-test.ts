// 7단계 혼합 출제 검사 (DB 접속 없음).
// 유형 나누기 / 문항 수 배분(레벨 우선) / 부족할 때 / 확인 필요 단어 제외 / 오래된 결과 무시 / 인쇄 학생용 정답 미노출 / 옛 시험 영향 없음
// 실행: npm run test-mixed-test

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aiCategory,
  availability,
  expectedShortages,
  externalCategory,
  externalItemKey,
  pickPassageReplacement,
  resolvePassageSource,
  selectPassageItems,
  type MixedCandidate,
} from '../lib/mixedTest.ts'
import { initialMixedDraft, mixedDraftIsCurrent, mixedDraftReducer, type MixedConditions } from '../lib/mixedTestDraft.ts'
import { generateWordTest, isWordTestExam, toWordQuestionData, type WordTestEntry } from '../lib/wordTest.ts'
import { inferExamType, resolveExamType } from '../lib/examType.ts'
import { includesAnswers, includesQuestions, parsePrintView } from '../lib/printView.ts'
import type { UnifiedDifficulty } from '../lib/passageUnified.ts'

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

// 고정 난수
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const cand = (key: string, category: MixedCandidate['category'], difficulty: UnifiedDifficulty | null): MixedCandidate => ({
  key, category, difficulty, preview: key, question_data: { type: category === 'mc' ? 'mc' : 'essay', question: key, source: 'external_passage' },
})

test('유형 나누기: AI(어법·어법고쳐쓰기 → 문법, 어휘·독해·요약 → 객관식, 서술형 → 주관식), 외부(mc·tf → 객관식, 나머지 → 주관식)', () => {
  assert.equal(aiCategory('grammar', true), 'grammar')
  assert.equal(aiCategory('essay_어법고쳐쓰기', false), 'grammar')
  assert.equal(aiCategory('essay_조건영작', false), 'subjective')
  assert.equal(aiCategory('vocab', true), 'mc')
  assert.equal(aiCategory('reading_주제', true), 'mc')
  assert.equal(aiCategory('summary', true), 'mc')
  assert.equal(externalCategory('question', 'mc'), 'mc')
  assert.equal(externalCategory('question', 'tf'), 'mc')
  for (const t of ['blank', 'order', 'match']) assert.equal(externalCategory('question', t), 'subjective')
  assert.equal(externalCategory('essay', undefined), 'subjective')
})

test('qid 없는 외부지문 문항: 위치 기반 임시 키 (qid 를 지어내지 않음), qid 있으면 qid 키', () => {
  assert.equal(externalItemKey('p1', 'question', 3, undefined), 'ext:p1:questions:3')
  assert.equal(externalItemKey('p1', 'essay', 0, undefined), 'ext:p1:essays:0')
  assert.equal(externalItemKey('p1', 'question', 3, 'q-uuid'), 'ext:p1:qid:q-uuid')
  const api = readFileSync(new URL('../app/api/mixed-test/candidates/route.ts', import.meta.url), 'utf8')
  assert.match(api, /item\.qid \? \{ \.\.\.snapshot \} : \{ \.\.\.snapshot, source_legacy_key: key \}/)
  assert.doesNotMatch(api, /source_question_id:/) // qid 칸은 기존 변환 함수만 채운다 (qid 있을 때만)
  assert.doesNotMatch(api, /\.(insert|update|delete|upsert)\(/) // 읽기 전용
})

const pool: MixedCandidate[] = [
  cand('mc-1a', 'mc', 1), cand('mc-1b', 'mc', 1),
  cand('mc-2a', 'mc', 2), cand('mc-2b', 'mc', 2), cand('mc-2c', 'mc', 2),
  cand('mc-3a', 'mc', 3), cand('mc-na', 'mc', null),
  cand('sub-2a', 'subjective', 2), cand('sub-3a', 'subjective', 3),
  cand('gr-2a', 'grammar', 2),
]

test('문항 수 배분: 유형별 개수대로, 고른 레벨 먼저 → 가까운 레벨(같은 거리면 낮은 쪽) → 난이도 없음', () => {
  const r = selectPassageItems(pool, { mc: 5, subjective: 1, grammar: 1 }, 2, seeded(1))
  const keys = r.items.map((c) => c.key)
  assert.equal(r.items.length, 7)
  assert.deepEqual(r.items.map((c) => c.category), ['mc', 'mc', 'mc', 'mc', 'mc', 'subjective', 'grammar'])
  // 객관식: 표준(2) 3개 먼저, 그다음 거리 1 중 낮은 쪽(기초 1) 2개 — 심화(3)·미정은 아직
  assert.deepEqual(new Set(keys.slice(0, 3)), new Set(['mc-2a', 'mc-2b', 'mc-2c']))
  assert.deepEqual(new Set(keys.slice(3, 5)), new Set(['mc-1a', 'mc-1b']))
  assert.equal(keys[5], 'sub-2a')
  assert.equal(r.offLevel, 2)
  assert.deepEqual(r.shortages, [])
  // 레벨 심화(3): 심화 먼저
  const hi = selectPassageItems(pool, { mc: 2, subjective: 1, grammar: 0 }, 3, seeded(2))
  assert.equal(hi.items[0].key, 'mc-3a')
  assert.equal(hi.items[2].key, 'sub-3a')
})

test('부족할 때: 있는 만큼만, 부족을 알려 주고 다른 지문(후보 밖) 문항은 절대 쓰지 않는다', () => {
  const r = selectPassageItems(pool, { mc: 20, subjective: 5, grammar: 3 }, 2, seeded(3))
  assert.equal(r.items.length, 10)
  assert.ok(r.items.every((c) => pool.includes(c)))
  assert.deepEqual(r.shortages, [
    { category: 'mc', requested: 20, picked: 7 },
    { category: 'subjective', requested: 5, picked: 2 },
    { category: 'grammar', requested: 3, picked: 1 },
  ])
  // 뽑기 전에 미리 알리는 부족
  assert.deepEqual(expectedShortages(pool, { mc: 5, subjective: 5, grammar: 0 }), [{ category: 'subjective', requested: 5, picked: 2 }])
  assert.deepEqual(availability(pool, 2), { total: { mc: 7, subjective: 2, grammar: 1 }, atLevel: { mc: 3, subjective: 1, grammar: 1 } })
  // 문법 0개인 외부지문 → 문법 요청은 전부 부족
  const ext = [cand('e1', 'mc', 3), cand('e2', 'subjective', 3)]
  assert.deepEqual(selectPassageItems(ext, { mc: 1, subjective: 1, grammar: 2 }, 3).shortages, [{ category: 'grammar', requested: 2, picked: 0 }])
})

test('교체: 같은 유형·같은 지문 안에서, 이미 뽑은/뺀 문항 제외, 없으면 null', () => {
  const picked = [pool[2], pool[3]] // mc-2a, mc-2b
  const next = pickPassageReplacement(pool, picked, pool[2], 2, new Set(['mc-2c']), seeded(4))!
  assert.equal(next.category, 'mc')
  assert.ok(!['mc-2a', 'mc-2b', 'mc-2c'].includes(next.key))
  assert.ok(['mc-1a', 'mc-1b'].includes(next.key)) // 남은 것 중 가까운 레벨(같은 거리 낮은 쪽)
  assert.equal(pickPassageReplacement(pool, [pool[9]], pool[9], 2, new Set()), null) // 문법은 1개뿐
})

test('외부지문 4단계 세트: 고른 레벨의 단계 지문, 없으면 가장 가까운 단계', () => {
  const row = {
    kind: 'external' as const, id: 'g1', isGroup: true,
    levels: [
      { difficulty: 1 as const, label: '학교형', href: '', passageId: 'p1' },
      { difficulty: 3 as const, label: '상위학원형', href: '', passageId: 'p3' },
    ],
  }
  assert.deepEqual(resolvePassageSource(row, 3), { kind: 'external', id: 'p3', levelLabel: '상위학원형' })
  assert.deepEqual(resolvePassageSource(row, 2), { kind: 'external', id: 'p1', levelLabel: '학교형' }) // 같은 거리 → 낮은 쪽
  assert.deepEqual(resolvePassageSource(row, 4), { kind: 'external', id: 'p3', levelLabel: '상위학원형' })
  assert.deepEqual(resolvePassageSource({ kind: 'ai', id: 'a1', isGroup: false, levels: [] }, 4), { kind: 'ai', id: 'a1', levelLabel: null })
})

test('확인 필요 단어 제외: 뽑기는 사용 중(approved)만, 저장 API 도 DB 로 approved·삭제 안 됨을 다시 확인', () => {
  const entry = (id: string, status: WordTestEntry['status'], d = 30): WordTestEntry => ({
    id, expression: id, expression_key: id, meaning_ko: `뜻${id}`, meaning_key: `뜻${id}`, accepted_meanings: [], pos: 'noun',
    entry_type: 'word', base_difficulty: d, ko_en_difficulty: null, ko_en_allowed: true, status, deleted_at: null,
  })
  const entries = [entry('a1', 'approved'), entry('a2', 'approved'), entry('p1', 'pending'), entry('p2', 'pending'), entry('d1', 'deferred' as WordTestEntry['status'])]
  const r = generateWordTest(entries, { min: 1, max: 100 }, 'en_ko', 10, seeded(5))
  assert.deepEqual(r.items.map((i) => i.entry.id).sort(), ['a1', 'a2'])
  assert.equal(r.shortage, true)
  const api = readFileSync(new URL('../app/api/exams/mixed/route.ts', import.meta.url), 'utf8')
  assert.match(api, /\.eq\('status', 'approved'\)/)
  assert.match(api, /\.is\('deleted_at', null\)/)
  assert.match(api, /'사용 중'이 아닌 단어가/)
  const page = readFileSync(new URL('../app/create/mixed/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /\/api\/vocabulary\?status=approved/)
})

const conditions: MixedConditions = {
  passageKey: 'ai:a1', level: 2, counts: { mc: 3, subjective: 1, grammar: 1 },
  word: { count: 5, grade: '중1', level: 'academy', direction: 'en_ko' },
}

test('오래된 결과 무시: 조건을 바꾸면 미리보기 비움, 늦게 온 결과·옛 조건 결과는 버림', () => {
  let s = initialMixedDraft(conditions)
  s = mixedDraftReducer(s, { type: 'generateStart' })
  const seq = s.seq
  s = mixedDraftReducer(s, { type: 'generateDone', seq, conditions, items: [{ source: 'passage', candidate: pool[0] }] })
  assert.equal(s.items.length, 1)
  assert.ok(mixedDraftIsCurrent(s))
  // 개수·단어 조건·지문을 바꾸면 비운다
  for (const patch of [{ counts: { mc: 4 } }, { word: { direction: 'ko_en' as const } }, { passageKey: 'external:p9' }, { level: 3 as const }]) {
    const t = mixedDraftReducer(s, { type: 'setConditions', patch })
    assert.equal(t.items.length, 0, JSON.stringify(patch))
    assert.equal(t.generatedFor, null)
    assert.ok(!mixedDraftIsCurrent(t))
  }
  // 같은 값으로 바꾸면 그대로
  assert.equal(mixedDraftReducer(s, { type: 'setConditions', patch: { counts: { mc: 3 } } }), s)
  // 뽑는 동안 조건이 바뀌면 늦게 온 결과는 버린다
  let u = mixedDraftReducer(initialMixedDraft(conditions), { type: 'generateStart' })
  const oldSeq = u.seq
  u = mixedDraftReducer(u, { type: 'setConditions', patch: { level: 4 } })
  u = mixedDraftReducer(u, { type: 'generateDone', seq: oldSeq, conditions, items: [{ source: 'passage', candidate: pool[0] }] })
  assert.equal(u.items.length, 0)
  // 삭제·교체한 문항은 다시 뽑지 않도록 기록
  const v = mixedDraftReducer(s, { type: 'remove', index: 0 })
  assert.deepEqual(v.excluded, ['mc-1a'])
  const page = readFileSync(new URL('../app/create/mixed/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /if \(seqRef\.current !== seq\) return/)
  assert.match(page, /if \(seq !== candSeq\.current\) return/)
})

test('혼합 시험 인쇄: 일반 인쇄로 가고, 학생용에는 정답이 없다 (단어 문항은 안내만)', () => {
  const word = toWordQuestionData({
    entry: {
      id: 'w1', expression: 'abandon', expression_key: 'abandon', meaning_ko: '버리다', meaning_key: '버리다', accepted_meanings: ['포기하다'],
      pos: 'verb', entry_type: 'word', base_difficulty: 62, ko_en_difficulty: null, ko_en_allowed: false, status: 'approved', deleted_at: null,
    },
    direction: 'en_ko',
  })
  const mixed = [{ question_data: { type: 'mc' } }, { question_data: word }]
  assert.equal(isWordTestExam(mixed), false) // → 일반 인쇄 레이아웃
  assert.equal(parsePrintView(null), 'student')
  assert.equal(includesAnswers('student'), false)
  assert.equal(includesQuestions('student'), true)
  const print = readFileSync(new URL('../app/tests/[id]/print/page.tsx', import.meta.url), 'utf8')
  // 단어 안내는 방향만 보고 정답을 쓰지 않는다
  const hint = print.slice(print.indexOf("q.type === 'word' && ("), print.indexOf("q.type === 'word' && (") + 300)
  assert.match(hint, /영어로 쓰시오/)
  assert.doesNotMatch(hint, /answer/)
  // 정답(formatAnswer)은 정답 장(AnswerPage)에서만, 정답 장은 includesAnswers 일 때만
  const firstAnswer = print.indexOf('formatAnswer(q)')
  assert.ok(firstAnswer > print.indexOf('function AnswerPage'))
  assert.match(print, /\{includesAnswers\(view\) && <AnswerPage/)
  // 저장 후 인쇄 화면은 view 없이(학생용) 연다
  const page = readFileSync(new URL('../app/create/mixed/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /router\.push\(`\/tests\/\$\{id\}\/print\?exam_id=\$\{id\}&title=[^`]*&date=[^`]*`\)/)
  assert.doesNotMatch(page, /view=teacher|view=answers/)
})

test('옛 시험 영향 없음: exam_type 은 새 값 없이 추론값과 같게, 문제/단어 시험 판단 그대로', () => {
  assert.equal(inferExamType([{ question_data: { type: 'mc' } }, { question_data: { type: 'word' } }]), 'problem')
  assert.equal(inferExamType([{ question_data: { type: 'word' } }]), 'word')
  assert.equal(inferExamType([{ question_data: { type: 'vocab' } }]), 'problem')
  assert.equal(inferExamType([]), 'problem')
  assert.equal(resolveExamType('word', [{ question_data: { type: 'mc' } }]), 'word') // 저장값 우선 (옛 규칙 그대로)
  assert.equal(isWordTestExam([{ question_data: { type: 'word' } }]), true) // 단어시험 전용 인쇄 그대로
  const api = readFileSync(new URL('../app/api/exams/mixed/route.ts', import.meta.url), 'utf8')
  assert.match(api, /const examType = inferExamType\(/)
  assert.match(api, /exam_type: examType/)
  assert.doesNotMatch(api, /'mixed'/)
  // 기존 저장 API 는 그대로
  assert.match(readFileSync(new URL('../app/api/exams/route.ts', import.meta.url), 'utf8'), /exam_type: 'problem'/)
  assert.match(readFileSync(new URL('../app/api/vocabulary/word-test/route.ts', import.meta.url), 'utf8'), /exam_type: 'word'/)
})

console.log(`\n모두 통과: ${passed}개`)
