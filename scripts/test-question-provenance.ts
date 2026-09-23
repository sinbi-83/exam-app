// STEP 3-B 검증: 문제 provenance + 외부지문 qid. DB에 접속하지 않는다 (로컬 fixture 만 사용).
//
// 실행: npm run test-question-provenance

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { inspectQids, isValidQid, qidErrors, withQids } from '../lib/passageQid.ts'
import {
  buildExternalExamQuestionData,
  externalAddedKeys,
  isExternalItemAdded,
  type ExamQuestionData,
} from '../lib/externalPassageExam.ts'
import { bankAddedIds, buildBankExamQuestionData } from '../lib/questionBankExam.ts'
import type { PassageEssay, PassageMultipleChoice, PassageQuestion } from '../types/passageBank'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✅ ${name}`)
  } catch (err) {
    console.log(`❌ ${name}`)
    throw err
  }
}

// ── fixture: 외부지문 (문제 4개 + 서술형 2개) ──
const legacyPassage: { id: string; body: string; questions: PassageQuestion[]; essays: PassageEssay[] } = {
  id: 'passage-1',
  body: 'Body text.',
  questions: [
    { type: 'mc', q: 'Q-A', choices: ['1', '2', '3', '4', '5'], answer: '1', explanation: 'A' },
    { type: 'blank', q: 'Q-B', answer: 'b', explanation: 'B' },
    { type: 'tf', q: 'Q-C', answer: true, explanation: 'C' },
    { type: 'mc', q: 'Q-D', choices: ['1', '2', '3', '4', '5'], answer: '2', explanation: 'D' },
  ],
  essays: [
    { q: 'E-1', wordLimit: 50, sampleAnswer: 's1', rubric: 'r1' },
    { q: 'E-2', wordLimit: 50, sampleAnswer: 's2', rubric: 'r2' },
  ],
}
const passage = {
  ...legacyPassage,
  questions: withQids(legacyPassage.questions).items,
  essays: withQids(legacyPassage.essays).items,
}
const rowsFrom = (datas: ExamQuestionData[]) => datas.map((question_data) => ({ question_data }))

test('A. 문제은행 문제 추가 → source=question_bank + source_question_id/source_question_set_id 명시, 기존 id 유지', () => {
  const q = { id: 'bank-q-1', type: 'vocab', question: '...', question_set_id: 'set-1' }
  const d = buildBankExamQuestionData(q, 'passage text')
  assert.equal(d.source, 'question_bank')
  assert.equal(d.source_question_id, 'bank-q-1')
  assert.equal(d.source_question_set_id, 'set-1')
  assert.equal(d.id, 'bank-q-1') // 호환용 기존 값 유지
  assert.equal(d.question_set_id, 'set-1')
  assert.equal(d.passage, 'passage text')
  // 중복 방지: 신규(명시 source) + legacy(id만) 모두 인식, 외부지문 qid 는 섞지 않음
  const ids = bankAddedIds([
    { question_data: d },
    { question_data: { id: 'legacy-bank-q' } },
    { question_data: { source: 'external_passage', source_question_id: 'some-qid' } },
  ])
  assert.deepEqual([...ids].sort(), ['bank-q-1', 'legacy-bank-q'])
})

test('B/C. 신규 외부지문 일반문제·서술형 모두 UUID qid 보유', () => {
  assert.ok(passage.questions.every((q) => isValidQid(q.qid)))
  assert.ok(passage.essays.every((e) => isValidQid(e.qid)))
  assert.deepEqual(qidErrors(inspectQids(passage.questions, passage.essays), true), [])
})

test('D. 같은 지문 안 qid 중복 없음 + 중복이 생기면 검출', () => {
  const r = inspectQids(passage.questions, passage.essays)
  assert.equal(r.duplicates.length, 0)
  const broken = [...passage.questions, { ...passage.questions[0] }]
  assert.equal(inspectQids(broken, passage.essays).duplicates.length, 1)
  assert.ok(qidErrors(inspectQids(broken, passage.essays), false).length > 0) // legacy 허용 모드에서도 중복은 오류
  // withQids 는 이미 있는 qid 를 절대 바꾸지 않는다 (재실행 안전)
  const again = withQids(passage.questions)
  assert.equal(again.added, 0)
  assert.deepEqual(again.items.map((q) => q.qid), passage.questions.map((q) => q.qid))
  // qid: undefined 가 명시된 항목에도 실제 qid 가 붙는다
  const explicitUndefined = withQids([{ qid: undefined, q: 'x' }])
  assert.ok(isValidQid(explicitUndefined.items[0].qid))
})

test('E. 외부지문 문제/서술형 시험 추가 → source + source_passage_id + source_question_id(qid) 저장', () => {
  const dq = buildExternalExamQuestionData(passage, 'question', 2, passage.questions[2])
  assert.equal(dq.source, 'external_passage')
  assert.equal(dq.source_passage_id, 'passage-1')
  assert.equal(dq.source_question_id, passage.questions[2].qid)
  assert.equal(dq.source_index, 2) // 기록용으로만 유지
  const de = buildExternalExamQuestionData(passage, 'essay', 1, passage.essays[1])
  assert.equal(de.source_question_id, passage.essays[1].qid)
  assert.equal(de.type, 'essay')
})

// 시험에 C(index 2) 와 서술형 E-2(index 1)를 담아 둔 상태
const examRows = rowsFrom([
  buildExternalExamQuestionData(passage, 'question', 2, passage.questions[2]),
  buildExternalExamQuestionData(passage, 'essay', 1, passage.essays[1]),
])
const addedFlags = (p: typeof passage) => {
  const keys = externalAddedKeys(examRows, p.id)
  return {
    questions: p.questions.map((q, i) => isExternalItemAdded(keys, p.id, 'question', i, q.qid)),
    essays: p.essays.map((e, i) => isExternalItemAdded(keys, p.id, 'essay', i, e.qid)),
  }
}

test('F. 문제 배열 순서 변경 → 같은 문제(C)를 계속 "추가됨"으로 인식', () => {
  assert.deepEqual(addedFlags(passage).questions, [false, false, true, false])
  const reordered = { ...passage, questions: [passage.questions[2], passage.questions[0], passage.questions[3], passage.questions[1]] }
  assert.deepEqual(addedFlags(reordered).questions, [true, false, false, false]) // C 는 0번으로 이동
})

test('G. 앞 문제(B) 삭제 → 뒤 문제 C 는 추가됨 유지, 당겨져 온 D 는 추가됨 아님', () => {
  const removed = { ...passage, questions: passage.questions.filter((_, i) => i !== 1) } // [A, C, D]
  assert.deepEqual(addedFlags(removed).questions, [false, true, false])
  const essayRemoved = { ...passage, essays: passage.essays.filter((_, i) => i !== 0) } // [E-2]
  assert.deepEqual(addedFlags(essayRemoved).essays, [true])
})

test('H. 문제 텍스트 수정 → qid 유지 (편집 화면과 같은 { ...q, 필드 } 방식)', () => {
  const before = passage.questions[0] as PassageMultipleChoice
  const edited: PassageMultipleChoice = { ...before, q: 'Q-A (수정됨)', choices: ['x', '2', '3', '4', '5'], answer: 'x' }
  assert.equal(edited.qid, before.qid)
  // 서버 PATCH 규칙: qid 가 있던 지문은 qid 가 빠지면 거부, 수정·삭제는 통과
  const storedHasQid = true
  const next = [edited, ...passage.questions.slice(2)] // 수정 + 1개 삭제
  assert.deepEqual(qidErrors(inspectQids(next, passage.essays), storedHasQid), [])
  const withoutQid: PassageMultipleChoice = { ...edited, qid: undefined } // 클라이언트 버그로 qid 가 빠진 상황
  assert.ok(qidErrors(inspectQids([withoutQid, ...passage.questions.slice(1)], passage.essays), storedHasQid).length > 0)
})

test('I. 원본 문제 수정/삭제 후에도 이미 만든 시험 snapshot 은 불변', () => {
  const snapshot = JSON.stringify(buildExternalExamQuestionData(passage, 'question', 0, passage.questions[0]))
  // 원본 수정·삭제·순서변경 (편집 화면처럼 새 배열/객체를 만든다)
  const editedPassage = {
    ...passage,
    body: 'Changed body.',
    questions: [{ ...passage.questions[0], q: 'CHANGED', choices: ['z', 'z', 'z', 'z', 'z'], answer: 'z' }, ...passage.questions.slice(2)].reverse(),
  }
  assert.ok(editedPassage.questions.length === 3)
  const stored = JSON.parse(snapshot) // exam_questions.question_data 에 저장된 값
  assert.equal(stored.question, 'Q-A')
  assert.deepEqual(stored.options, ['1', '2', '3', '4', '5'])
  assert.equal(stored.answer, '1')
  assert.equal(stored.explanation, 'A')
  assert.equal(stored.passage, 'Body text.')
  // 인쇄 화면은 question_data 만 읽는다(원본 JOIN 없음) → 다시 인쇄해도 같은 내용
  const bankSnap = JSON.stringify(buildBankExamQuestionData({ id: 'q9', question: '원래 문제', question_set_id: 's9' }, 'p'))
  assert.equal(JSON.parse(bankSnap).question, '원래 문제')
})

test('J. qid 없는 legacy 지문/legacy 시험문항 → 기존 index 방식 그대로 동작', () => {
  // legacy 지문에서 담기: source_question_id 가 없다 (index 로만 기록)
  const d = buildExternalExamQuestionData(legacyPassage, 'question', 1, legacyPassage.questions[1])
  assert.equal(d.source_question_id, undefined)
  assert.equal(d.source_index, 1)
  const keys = externalAddedKeys(rowsFrom([d]), legacyPassage.id)
  const flags = legacyPassage.questions.map((q, i) => isExternalItemAdded(keys, legacyPassage.id, 'question', i, undefined))
  assert.deepEqual(flags, [false, true, false, false])
  // 나중에 지문에 qid 가 backfill 되어도, legacy 시험문항은 index fallback 으로 계속 "추가됨" 인식
  const flagsAfterBackfill = passage.questions.map((q, i) => isExternalItemAdded(keys, passage.id, 'question', i, q.qid))
  assert.deepEqual(flagsAfterBackfill, [false, true, false, false])
  // 신규(qid) 시험문항은 index 키를 만들지 않는다 → index 방식으로 되돌아가지 않음
  const newKeys = externalAddedKeys(examRows, passage.id)
  assert.ok([...newKeys].every((k) => k.includes(':qid:')))
  // legacy 지문 저장(PATCH) 은 qid 없이도 통과
  assert.deepEqual(qidErrors(inspectQids(legacyPassage.questions, legacyPassage.essays), false), [])
})

test('CLI. assign-qids: 새 파일에 qid 부여·재실행 시 불변 / 검사기: qid 필수, --allow-legacy 는 통과', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qid-test-'))
  try {
    const content = join(dir, 'content.json')
    copyFileSync(resolve('data/passage-sets/uncle-rocket-launch.content.json'), content)
    const run = (script: string, args: string[]) =>
      execFileSync(process.execPath, [resolve('scripts', script), ...args], { encoding: 'utf-8', stdio: 'pipe' })
    const runFails = (script: string, args: string[]) => {
      try {
        run(script, args)
        return false
      } catch {
        return true
      }
    }
    // 검사기: legacy content 는 기본 모드에서 실패, --allow-legacy 에서 통과
    assert.ok(runFails('check-passage-questions.ts', [content, 'data/passage-sets/uncle-rocket-launch.json']))
    run('check-passage-questions.ts', [content, 'data/passage-sets/uncle-rocket-launch.json', '--allow-legacy'])
    // assign-qids → 4단계 × (20+5) = 100개 부여, 검사기 기본 모드 통과
    run('assign-qids.ts', [content])
    const once = JSON.parse(readFileSync(content, 'utf-8'))
    const all = ['school', 'academy', 'advanced', 'prestudy'].flatMap((v) => [...once[v].questions, ...once[v].essays])
    assert.equal(all.length, 100)
    assert.ok(all.every((i: { qid?: string }) => isValidQid(i.qid)))
    assert.equal(new Set(all.map((i: { qid: string }) => i.qid)).size, 100)
    run('check-passage-questions.ts', [content, 'data/passage-sets/uncle-rocket-launch.json'])
    // 재실행해도 qid 가 바뀌지 않음
    run('assign-qids.ts', [content])
    assert.equal(readFileSync(content, 'utf-8'), JSON.stringify(once, null, 2) + '\n')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

console.log(`\n모든 테스트 통과 (${passed}개). DB 접속 없음.`)
