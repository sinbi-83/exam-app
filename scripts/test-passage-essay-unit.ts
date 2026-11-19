import assert from 'node:assert/strict'
import { passageEssayLimit } from '../lib/passageEssay.ts'
import { buildExternalExamQuestionData } from '../lib/externalPassageExam.ts'

assert.equal(passageEssayLimit({ wordLimit: 30 }), '30자 내외')
assert.equal(passageEssayLimit({ wordLimit: 30 }, '이내'), '30자 이내')
assert.equal(passageEssayLimit({ wordLimit: 30, wordLimitUnit: 'characters' }), '30자 내외')
assert.equal(passageEssayLimit({ wordLimit: 30, wordLimitUnit: 'words' }), '30단어 이내')
assert.equal(passageEssayLimit({ wordLimit: 0, wordLimitUnit: 'words' }), '')
const passage = { id: 'test-passage', body: 'A new school.' }
const essay = { qid: 'stable-qid', q: 'Explain.', wordLimit: 30, sampleAnswer: 'An answer.', rubric: 'Meaning.' }
const oldSnapshot = buildExternalExamQuestionData(passage, 'essay', 0, essay)
const newSnapshot = buildExternalExamQuestionData(passage, 'essay', 0, { ...essay, wordLimitUnit: 'words' })
assert.equal(oldSnapshot.question, 'Explain. (30자 이내)')
assert.equal(newSnapshot.question, 'Explain. (30단어 이내)')
assert.equal(newSnapshot.source_question_id, 'stable-qid')
assert.equal(oldSnapshot.source_question_id, 'stable-qid')
assert.equal(essay.q, 'Explain.')
console.log('서술형 단위: 기존 글자 수·새 단어 수·시험 담기·qid 보존 10개 검증 통과')
