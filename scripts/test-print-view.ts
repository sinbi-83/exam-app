// 시험 인쇄 출력 방식 규칙 테스트 (lib/printView.ts)
// 실행: npm run test-print-view

import assert from 'node:assert/strict'
import {
  formatAnswer,
  formatExplanation,
  includesAnswers,
  includesQuestions,
  parsePrintView,
  printFileName,
} from '../lib/printView.ts'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✅ ${name}`)
}

test('기본값은 학생용: 값 없음·모르는 값도 학생용', () => {
  assert.equal(parsePrintView(null), 'student')
  assert.equal(parsePrintView(undefined), 'student')
  assert.equal(parsePrintView(''), 'student')
  assert.equal(parsePrintView('TEACHER'), 'student')
  assert.equal(parsePrintView('study'), 'student')
  assert.equal(parsePrintView('teacher'), 'teacher')
  assert.equal(parsePrintView('answers'), 'answers')
})
test('학생용은 정답이 절대 포함되지 않는다', () => {
  assert.equal(includesAnswers('student'), false)
  assert.equal(includesQuestions('student'), true)
})
test('교사용 = 문제 + 정답, 답안지만 = 정답만', () => {
  assert.equal(includesQuestions('teacher'), true)
  assert.equal(includesAnswers('teacher'), true)
  assert.equal(includesQuestions('answers'), false)
  assert.equal(includesAnswers('answers'), true)
})
test('PDF 파일 이름', () => {
  assert.equal(printFileName('중3 테스트', 'student'), '중3 테스트')
  assert.equal(printFileName('중3 테스트', 'teacher'), '중3 테스트 (교사용)')
  assert.equal(printFileName('중3 테스트', 'answers'), '중3 테스트 (정답)')
})
test('정답: 객관식은 보기 번호, 주관식은 그대로, 빈 값은 -', () => {
  assert.equal(formatAnswer({ answer: 'apple', options: ['pear', 'apple'] }), '② apple')
  assert.equal(formatAnswer({ answer: '참', options: ['참', '거짓'] }), '① 참')
  assert.equal(formatAnswer({ answer: 'B → A → C' }), 'B → A → C')
  assert.equal(formatAnswer({ answer: 'x', options: ['a', 'b'] }), 'x')
  assert.equal(formatAnswer({ answer: '' }), '-')
  assert.equal(formatAnswer({}), '-')
})
test('해설: 비어 있으면 null', () => {
  assert.equal(formatExplanation({ explanation: '  ' }), null)
  assert.equal(formatExplanation({}), null)
  assert.equal(formatExplanation({ explanation: '주어가 복수' }), '주어가 복수')
})

console.log(`\n모두 통과: ${passed}개`)
