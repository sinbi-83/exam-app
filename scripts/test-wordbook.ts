// 지문 단어장 규칙 테스트 (lib/wordbook.ts). 실행: npm run test-wordbook
import assert from 'node:assert/strict'
import { buildTestItems, buildWordbookDraft, cleanWordbookWords, lemmaCandidates, sentenceAt, extractTaggedVocab, shuffledOrder, splitSentenceOn, wordbookCoverageProblems } from '../lib/wordbook.ts'

const body = 'Hanoi is the {{v:capital}} of Vietnam. There were thousands of {{v:motorbikes}} on the streets! ' +
  'Our guide {{g:told us to walk|tell + 목적어 + to부정사}} {{v:steadily}}.\nIt is {{v:grilled}} pork. Ha Long Bay is {{v:famous for}} its islands. The {{v:Capital}} again.'

const { plain, vocab } = extractTaggedVocab(body)
assert.equal(vocab.length, 6)
assert.ok(!plain.includes('{{'))
assert.equal(sentenceAt(plain, vocab[1].index), 'There were thousands of motorbikes on the streets!')
assert.equal(sentenceAt(plain, vocab[2].index), 'Our guide told us to walk steadily.')

assert.ok(lemmaCandidates('motorbikes').includes('motorbike'))
assert.ok(lemmaCandidates('grilled').includes('grill'))
assert.ok(!lemmaCandidates('steadily').includes('steady')) // 부사를 형용사 뜻으로 바꾸지 않는다
assert.ok(lemmaCandidates('hid').includes('hide'))
assert.ok(lemmaCandidates('came out').includes('come out'))
assert.ok(lemmaCandidates('stopped').includes('stop'))
assert.ok(lemmaCandidates('making').includes('make'))
assert.ok(lemmaCandidates('looked for').includes('look for'))

const bank = [
  { expression: 'capital', lemma: null, pos: 'noun', meaning_ko: '자본', status: 'pending' },
  { expression: 'capital', lemma: null, pos: 'noun', meaning_ko: '수도', status: 'approved' },
  { expression: 'motorbike', lemma: null, pos: 'noun', meaning_ko: '오토바이', status: 'approved' },
  { expression: 'grill', lemma: null, pos: 'verb', meaning_ko: '굽다', status: 'rejected' },
  { expression: 'famous for', lemma: null, pos: null, meaning_ko: '~로 유명한', status: 'pending' },
  { expression: 'steady', lemma: null, pos: 'adjective', meaning_ko: '꾸준한', status: 'approved' },
]
const draft = buildWordbookDraft(body, bank)
assert.deepEqual(draft.map((w) => w.word), ['capital', 'motorbike', 'steadily', 'grilled', 'famous for'])
assert.equal(draft[0].meaning, '수도') // 사용 중 먼저
assert.equal(draft[0].pos, '명')
assert.equal(draft[1].surface, 'motorbikes')
assert.equal(draft[3].meaning, '') // 사용 안 함은 쓰지 않음
assert.equal(draft[3].origin, 'none')
assert.equal(draft[4].meaning, '~로 유명한')

// planned → 명사 plan '계획' 은 붙이지 않는다 (동사일 때만)
const planDraft = buildWordbookDraft('It went as {{v:planned}}.', [{ expression: 'plan', lemma: null, pos: 'noun', meaning_ko: '계획', status: 'approved' }])
assert.equal(planDraft[0].meaning, '')
assert.equal(planDraft[0].word, 'planned')
const planVerb = buildWordbookDraft('It went as {{v:planned}}.', [
  { expression: 'plan', lemma: null, pos: 'noun', meaning_ko: '계획', status: 'approved' },
  { expression: 'plan', lemma: null, pos: 'verb', meaning_ko: '계획하다', status: 'pending' },
])
assert.equal(planVerb[0].meaning, '계획하다')

// 대사 문장의 한쪽 따옴표 정리
const q = extractTaggedVocab(`"I'm {{v:serious}}. You've looked {{v:unhappy}} for days."`)
assert.equal(sentenceAt(q.plain, q.vocab[0].index), "I'm serious.")
assert.equal(sentenceAt(q.plain, q.vocab[1].index), "You've looked unhappy for days.")

const clean = cleanWordbookWords([{ word: ' apple ', meaning: '사과' }, { word: 'Apple' }, { word: '  ' }])
assert.equal(clean.length, 1)
assert.equal(clean[0].surface, 'apple')

assert.deepEqual(splitSentenceOn('There were motorbikes.', 'Motorbikes'), ['There were ', 'motorbikes', '.'])
assert.deepEqual(splitSentenceOn('No match.', 'x'), ['No match.'])

const items = buildTestItems(draft, 'ko_en', null)
assert.equal(items[0].prompt, '수도')
assert.equal(items[3].showEn, true) // 뜻 없으면 영→한
const mixed = buildTestItems(draft, 'mixed', null)
assert.deepEqual(mixed.map((i) => i.showEn), [true, false, true, true, true])

const o1 = shuffledOrder(20, 42)
assert.deepEqual(o1, shuffledOrder(20, 42))
assert.deepEqual([...o1].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i))
assert.notDeepEqual(o1, shuffledOrder(20, 43))

// 지문과 같이 만든 단어장 검사: 🔵 단어 누락 / 뜻 빈칸 / 지문에 없는 예문
const cov = wordbookCoverageProblems(body, [
  { word: 'capital', surface: 'capital', pos: '명', meaning: '수도', sentence: 'Hanoi is the capital of Vietnam.' },
  { word: 'motorbike', surface: 'motorbikes', pos: '명', meaning: '오토바이', sentence: 'There were thousands of motorbikes on the streets!' },
  { word: 'steadily', surface: 'steadily', pos: '', meaning: '꾸준히', sentence: '' },
  { word: 'grill', surface: 'grilled', pos: '동', meaning: '', sentence: 'It is grilled beef.' },
])
assert.deepEqual(cov.errors, ['🔵 단어가 단어장에 없음: famous for', '뜻 빈칸: grill', '예문이 지문에 없음: grill — "It is grilled beef."'])
assert.deepEqual(cov.warnings, ['품사 빈칸: steadily'])

console.log('✅ test-wordbook 통과')
