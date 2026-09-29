// 어법 문제 정답 노출 검사·새 형식·안전장치 점검 (DB 접속 없음). docs/grammar-leak-audit.md
// 실행: npm run test-grammar-leak

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildBlankStem,
  buildFindErrorStem,
  detectGrammarLeak,
  detectSnapshotLeak,
  grammarItemStem,
  isGrammarLeak,
  legacyGrammarStem,
  maskBlankAnswersInPassage,
  validateGrammarItem,
} from '../lib/grammarLeak.ts'
import { SAMPLE_PRINT_QUESTIONS } from '../lib/printSample.ts'

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
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const MC = (question_text: string, choices: string[], correct_answer: string) => ({ question_type: 'grammar', question_text, choices, correct_answer })
const five = ['goes', 'go', 'going', 'gone', 'to go']
const PASSAGE = 'Every morning, Mina walks her dog along the river. She goes to school by bus. There is a park near her house.'

test('예전 형식 "밑줄 친 (정답)" 은 정답 노출 (밑줄 대상 = 정답)', () => {
  assert.deepEqual(detectGrammarLeak(MC(legacyGrammarStem('goes'), five, 'goes')), ['target_is_answer'])
  assert.ok(isGrammarLeak(MC('밑줄 친 “Goes ”의 쓰임이 어법상 가장 적절한 것은?', five, 'goes'))) // 따옴표 모양·대소문자·공백 무시
  // 밑줄 대상이 정답이 아니면(오답 표현에 밑줄) 노출 아님
  assert.ok(!isGrammarLeak(MC(legacyGrammarStem('go'), five, 'goes')))
})

test('정답만 괄호·밑줄 표시, 정답이 문장에 그대로 → 노출', () => {
  assert.ok(detectGrammarLeak(MC('다음 중 어법상 알맞은 것은? She (goes) to school.', five, 'goes')).includes('answer_marked'))
  assert.ok(detectGrammarLeak(MC('다음 중 알맞은 것은? She <u>goes</u> to school.', five, 'goes')).includes('answer_marked'))
  assert.deepEqual(detectGrammarLeak(MC('다음 문장의 빈칸에 들어갈 말로 어법상 알맞은 것은?\n\n"She goes and _____ to school."', five, 'goes')), ['answer_in_stem'])
})

test('새 형식은 통과: (가) 빈칸형, (나) 밑줄 ①~⑤ 중 틀린 것', () => {
  const blank = buildBlankStem('She goes to school by bus.', 'goes')!
  assert.equal(blank, '다음 문장의 빈칸에 들어갈 말로 어법상 알맞은 것은?\n\n"She _____ to school by bus."')
  assert.deepEqual(detectGrammarLeak(MC(blank, five, 'goes')), [])
  const fe = buildFindErrorStem('The boy who live next door plays the piano very well.', ['who live', 'next door', 'plays', 'the piano', 'very well'])!
  assert.match(fe, /①"who live" ②"next door" ③"plays" ④"the piano" ⑤"very well"/)
  assert.deepEqual(detectGrammarLeak(MC(fe, ['who live', 'next door', 'plays', 'the piano', 'very well'], 'who live')), [])
})

test('빈칸형 만들기: 대상이 문장에 정확히 한 번(단어 경계), 틀린 것 찾기: 조각 5개가 순서대로', () => {
  assert.equal(buildBlankStem('She goes and goes.', 'goes'), null) // 두 번
  assert.equal(buildBlankStem('There is a park.', 'her'), null) // There 안의 her 는 아님
  assert.match(buildBlankStem('There is a park near her house.', 'her')!, /near _____ house/)
  assert.equal(buildFindErrorStem('A B C D E', ['A', 'C', 'B', 'D', 'E']), null) // 순서가 다름
  assert.equal(buildFindErrorStem('A B C D', ['A', 'B', 'C', 'D']), null) // 4개
})

test('서술형 어법고쳐쓰기: 틀린 곳 없는 문장 · 지시문이 답을 알려 줌 → 노출, 정상 문항 → 통과', () => {
  const ok = { question_type: 'essay_어법고쳐쓰기', question_text: '다음 문장에서 어법상 틀린 부분을 찾아 고쳐 쓰시오.\n\n"My father are tall."', correct_answer: 'My father is tall.' }
  assert.deepEqual(detectGrammarLeak(ok), [])
  const same = { ...ok, question_text: '다음 문장에서 틀린 부분을 고쳐 쓰시오.\n\n"My father is tall."' }
  assert.ok(detectGrammarLeak(same).includes('essay_already_correct'))
  const hinted = { ...ok, question_text: "다음 문장을 고쳐 쓰시오. 'are'를 'is'로 바꾸시오.\n\n\"My father are tall.\"" }
  assert.ok(detectGrammarLeak(hinted).includes('essay_fix_revealed'))
  assert.ok(isGrammarLeak({ ...ok, question_type: '어법고쳐쓰기', question_text: same.question_text })) // AI 생성 원래 이름도 같은 규칙
})

test('보기 오류는 따로 (노출 판정과 별개)', () => {
  assert.deepEqual(detectGrammarLeak(MC(buildBlankStem('She goes home.', 'goes')!, ['goes', 'go'], 'goes')), ['choices_broken'])
  assert.equal(isGrammarLeak(MC(buildBlankStem('She goes home.', 'goes')!, ['goes', 'go'], 'goes')), false)
  assert.deepEqual(detectSnapshotLeak({ type: 'grammar', question: legacyGrammarStem('goes'), options: five, answer: 'goes' }), ['target_is_answer'])
  assert.deepEqual(detectSnapshotLeak({ type: 'vocab', question: '"goes"의 의미', options: five, answer: 'goes' }), [])
})

test('AI 생성 직후 검증: 두 형식만 허용, 규칙 위반이면 문제 목록', () => {
  const blank = { type: 'grammar', grammarFormat: 'blank', targetText: 'goes', targetSentence: 'She goes to school by bus.', answer: 'goes', wrongAnswers: ['go', 'going', 'gone', 'to go'] }
  assert.deepEqual(validateGrammarItem(blank, PASSAGE), [])
  assert.ok(validateGrammarItem({ ...blank, grammarFormat: undefined }, PASSAGE).some((m) => m.includes('blank') && m.includes('find_error')))
  assert.ok(validateGrammarItem({ ...blank, answer: 'go' }, PASSAGE).length > 0) // 정답 ≠ 빈칸 자리 원래 표현
  assert.ok(validateGrammarItem({ ...blank, wrongAnswers: ['go', 'go', 'gone', 'to go'] }, PASSAGE).length > 0) // 보기 겹침
  const fe = {
    type: 'grammar', grammarFormat: 'find_error', errorSentence: 'The boy who live next door plays the piano very well.',
    segments: ['who live', 'next door', 'plays', 'the piano', 'very well'], wrongIndex: 0, correction: 'who lives',
  }
  assert.deepEqual(validateGrammarItem(fe, PASSAGE), [])
  // 지문 문장을 거의 그대로 쓰면 → 지문과 비교해 답이 보임
  const copied = { ...fe, errorSentence: 'She go to school by bus.', segments: ['She', 'go', 'to school', 'by', 'bus'], wrongIndex: 1, correction: 'goes' }
  assert.ok(validateGrammarItem(copied, PASSAGE).some((m) => m.includes('지문 문장')))
  assert.ok(validateGrammarItem({ ...fe, wrongIndex: 7 }, PASSAGE).length > 0)
  assert.deepEqual(validateGrammarItem({ type: 'vocab' }, PASSAGE), []) // 어휘는 대상 아님
})

test('시험지 인쇄: 빈칸형 정답이 같은 지문에서도 가려진다 (화면·인쇄만)', () => {
  const stem = buildBlankStem('She goes to school by bus.', 'goes')!
  assert.equal(maskBlankAnswersInPassage(PASSAGE, [stem]), 'Every morning, Mina walks her dog along the river. She _____ to school by bus. There is a park near her house.')
  assert.equal(maskBlankAnswersInPassage(PASSAGE, [legacyGrammarStem('goes')]), PASSAGE) // 다른 형식은 그대로
  const print = read('../app/tests/[id]/print/ExamSheetPrint.tsx')
  assert.match(print, /maskBlankAnswersInPassage\(\s*rawPassage,/)
})

test('저장·화면 문장: 새 문항은 stem, 예전 세트만 예전 문장 (새로 만들지 않음)', () => {
  assert.equal(grammarItemStem({ targetText: 'goes', stem: 'S' }), 'S')
  assert.equal(grammarItemStem({ targetText: 'goes' }), legacyGrammarStem('goes'))
  assert.match(read('../app/api/save-question-set/route.ts'), /return grammarItemStem\(q\)/)
  const b = read('../lib/buildMultipleChoice.ts')
  assert.match(b, /if \(item\.grammarFormat !== "blank"\) return null;/) // 형식 없는 어법 문항은 만들지 않는다
  assert.doesNotMatch(b, /`밑줄 친 "\$\{/) // 예전 문장을 만드는 코드 없음 (주석 설명만)
})

test('AI 생성: 프롬프트가 두 형식만 허용하고, 검증에 걸리면 다시 만들고, 끝까지 걸리면 버린다', () => {
  const prompt = read('../lib/aiPassagePromptBuilder.ts')
  assert.match(prompt, /허용 형식은 딱 두 가지/)
  assert.match(prompt, /"blank"/)
  assert.match(prompt, /"find_error"/)
  assert.match(prompt, /절대 금지: 문제 문장에 정답을 그대로 쓰기, 정답만 밑줄·괄호·따옴표로 표시하기/)
  const route = read('../app/api/generate-ai-passage/route.ts')
  assert.match(route, /const MAX_ATTEMPTS = 3/)
  assert.match(route, /const problems = grammarProblems\(candidate\)/)
  assert.match(route, /if \(problems\.length === 0\) break/)
  assert.match(route, /이전 응답의 어법 문항 문제/)
  assert.match(route, /items: \(parsed\.items \?\? \[\]\)\.filter\(\(it\) => validateGrammarItem\(it, parsed!\.passage \?\? ""\)\.length === 0\)/)
})

test('안전장치: 혼합 시험 후보에서 제외, 문제은행 목록·세트 상세에 배지', () => {
  const cand = read('../app/api/mixed-test/candidates/route.ts')
  assert.match(cand, /const safe = data\.filter\(\s*\(q\) => !isGrammarLeak\(/)
  assert.match(cand, /excluded_leak: excludedLeak/)
  assert.match(read('../app/create/mixed/page.tsx'), /정답 노출 의심/)
  assert.match(read('../app/api/question-sets/route.ts'), /grammar_leak_count: leakBySet\.get\(s\.id\) \?\? 0/)
  assert.match(read('../app/materials/questions/page.tsx'), /정답 노출 의심 \{item\.grammar_leak_count\}/)
  assert.match(read('../app/materials/questions/[id]/page.tsx'), /정답 노출 의심/)
})

test('문항 검색: API 가 화면이 읽는 원래 칸 이름도 돌려주고(검색 오류 수정), 결과에 정답 노출 배지', () => {
  const api = read('../app/api/questions/search/route.ts')
  for (const f of ['question_type: q.question_type', 'question_text: q.question_text', 'choices: q.choices', 'correct_answer: q.correct_answer', 'essay_meta: q.essay_meta']) {
    assert.ok(api.includes(f), f)
  }
  // 다른 화면이 쓰는 이름(type·question·options·answer)도 그대로
  assert.match(api, /type: \(q\.question_type \?\? ''\)\.replace/)
  assert.match(api, /options: q\.choices \?\? \[\]/)
  const page = read('../app/materials/questions/search/page.tsx')
  assert.match(page, /matchesCategory\(q\.question_type, categories\)/)
  assert.match(page, /\{isGrammarLeak\(q\) && \(/)
})

test('검사·수정 스크립트: 검사는 읽기만, 수정안 적용은 승인(O) 줄만·--apply 때만·백업 먼저', () => {
  const audit = read('./grammar-leak-audit.ts')
  assert.doesNotMatch(audit, /\.(insert|update|delete|upsert)\(/)
  const apply = read('./apply-grammar-leak-fix.ts')
  assert.match(apply, /const APPLY = process\.argv\.includes\('--apply'\)/)
  assert.match(apply, /normalizeVerdict\(r\[cOk\]\) === 'O'/)
  assert.match(apply, /\.eq\('question_text', c\.from\)/) // 지금 글이 CSV 와 같을 때만
  assert.ok(apply.indexOf('writeFileSync(backupPath') < apply.indexOf('await applyChanges(changes)'), '백업이 먼저')
  assert.doesNotMatch(apply, /exam_questions/) // 이미 만든 시험 snapshot 은 건드리지 않는다
})

test('인쇄 샘플의 어법 문항도 새 형식 (정답 노출 없음)', () => {
  const g = SAMPLE_PRINT_QUESTIONS.filter((q) => q.question_data.type === 'grammar')
  assert.equal(g.length, 2)
  for (const q of g) assert.deepEqual(detectSnapshotLeak(q.question_data as never), [], String(q.id))
})

console.log(`\n모두 통과: ${passed}개`)
