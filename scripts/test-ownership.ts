// 소유 확인 (docs/class-management-review.md 부록 B 의 API 11개). DB·서버 접속 없음.
// 실제 API 함수를 가짜 DB 로 실행해서 확인한다:
//   내 것 → 저장됨 / 남의 것·없는 것 → 403 이고 저장 시도 0건 / 비로그인 → 401 / DB 오류 → 500 이고 저장 0건
// 실행: npm run test-ownership

import assert from 'node:assert/strict'
import { FakeDb, installRouteHooks, request } from './support/routeHarness.ts'
import { checkOwnedIds, checkStudentsOwnership } from '../lib/ownership.ts'

installRouteHooks()

const attendance = await import('../app/api/attendance/route.ts')
const assignments = await import('../app/api/exam-assignments/route.ts')
const results = await import('../app/api/exam-results/route.ts')
const exams = await import('../app/api/exams/route.ts')
const homework = await import('../app/api/homework/route.ts')
const levelResults = await import('../app/api/level-tests/results/route.ts')
const levelResultOne = await import('../app/api/level-tests/results/[id]/route.ts')
const notifications = await import('../app/api/notifications/route.ts')
const reports = await import('../app/api/reports/route.ts')
const tuition = await import('../app/api/tuition/route.ts')
const wrongAnswers = await import('../app/api/wrong-answers/route.ts')
const wordTest = await import('../app/api/vocabulary/word-test/route.ts')
const { findLevelTest } = await import('../lib/levelTest.ts')
const LEVEL_TEST_ID = findLevelTest('중2', 'A')!.id

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`✅ ${name}`)
  } catch (err) {
    console.error(`❌ ${name}`)
    throw err
  }
}

function seed() {
  return new FakeDb({
    students: [{ id: 'my-student', user_id: 'me' }, { id: 'my-student-2', user_id: 'me' }, { id: 'their-student', user_id: 'other' }],
    exams: [{ id: 'my-exam', user_id: 'me' }, { id: 'their-exam', user_id: 'other' }],
    question_sets: [{ id: 'my-set', user_id: 'me' }, { id: 'their-set', user_id: 'other' }],
    vocabulary_entries: [{ id: 'my-word', user_id: 'me' }, { id: 'their-word', user_id: 'other' }],
    level_test_results: [{ id: 'my-result', user_id: 'me', test_id: LEVEL_TEST_ID, answers: {}, overrides: {} }],
  }).use()
}

const SAVE_TABLES = ['attendance', 'exam_assignments', 'exam_results', 'exams', 'exam_questions', 'homework', 'level_test_results', 'parent_notifications', 'reports', 'tuition_records', 'wrong_answer_records']

function assertNoWrites(db: FakeDb) {
  for (const table of SAVE_TABLES) assert.deepEqual(db.writesTo(table), [], `${table} 에 저장하면 안 됨`)
}

const wordQuestion = (id: string) => ({
  type: 'word', source: 'vocabulary_bank', source_vocabulary_entry_id: id, direction: 'en_ko',
  question: 'apple', answer: '사과', accepted_answers: ['사과'], expression: 'apple', meaning_ko: '사과', entry_type: 'word',
})

type Case = {
  name: string
  table: string
  mine: () => Promise<Response>
  theirs: Record<string, () => Promise<Response>>
  anonymous: () => Promise<Response>
}

const cases: Case[] = [
  {
    name: 'POST /api/attendance', table: 'attendance',
    mine: () => attendance.POST(request('POST', '/api/attendance', { records: [{ student_id: 'my-student', date: '2026-11-01', status: 'present' }, { student_id: 'my-student-2', date: '2026-11-01', status: 'late' }] }) as never),
    theirs: {
      '남의 학생': () => attendance.POST(request('POST', '/api/attendance', { records: [{ student_id: 'their-student', date: '2026-11-01', status: 'present' }] }) as never),
      '내 학생에 남의 학생 한 명 섞음': () => attendance.POST(request('POST', '/api/attendance', { records: [{ student_id: 'my-student', date: '2026-11-01', status: 'present' }, { student_id: 'their-student', date: '2026-11-01', status: 'present' }] }) as never),
      '학생 칸 없음': () => attendance.POST(request('POST', '/api/attendance', { records: [{ date: '2026-11-01', status: 'present' }] }) as never),
    },
    anonymous: () => attendance.POST(request('POST', '/api/attendance', { records: [] }) as never),
  },
  {
    name: 'PUT /api/exam-assignments', table: 'exam_assignments',
    mine: () => assignments.PUT(request('PUT', '/api/exam-assignments', { exam_id: 'my-exam', student_ids: ['my-student', 'my-student-2'] }) as never),
    theirs: {
      '남의 학생': () => assignments.PUT(request('PUT', '/api/exam-assignments', { exam_id: 'my-exam', student_ids: ['my-student', 'their-student'] }) as never),
      '남의 시험': () => assignments.PUT(request('PUT', '/api/exam-assignments', { exam_id: 'their-exam', student_ids: ['my-student'] }) as never),
    },
    anonymous: () => assignments.PUT(request('PUT', '/api/exam-assignments', {}) as never),
  },
  {
    name: 'POST /api/exam-results', table: 'exam_results',
    mine: () => results.POST(request('POST', '/api/exam-results', { student_id: 'my-student', exam_id: 'my-exam', exam_title: '시험', score: 90 }) as never),
    theirs: {
      '남의 학생': () => results.POST(request('POST', '/api/exam-results', { student_id: 'their-student', exam_title: '시험', score: 90 }) as never),
      '남의 시험': () => results.POST(request('POST', '/api/exam-results', { student_id: 'my-student', exam_id: 'their-exam', exam_title: '시험', score: 90 }) as never),
    },
    anonymous: () => results.POST(request('POST', '/api/exam-results', {}) as never),
  },
  {
    name: 'POST /api/exams', table: 'exams',
    mine: () => exams.POST(request('POST', '/api/exams', { title: '시험', question_set_id: 'my-set' }) as never),
    theirs: { '남의 문제 세트': () => exams.POST(request('POST', '/api/exams', { title: '시험', question_set_id: 'their-set' }) as never) },
    anonymous: () => exams.POST(request('POST', '/api/exams', {}) as never),
  },
  {
    name: 'POST /api/homework', table: 'homework',
    mine: () => homework.POST(request('POST', '/api/homework', { student_id: 'my-student', title: '워크북' }) as never),
    theirs: { '남의 학생': () => homework.POST(request('POST', '/api/homework', { student_id: 'their-student', title: '워크북' }) as never) },
    anonymous: () => homework.POST(request('POST', '/api/homework', {}) as never),
  },
  {
    name: 'POST /api/level-tests/results', table: 'level_test_results',
    mine: () => levelResults.POST(request('POST', '/api/level-tests/results', { test_id: LEVEL_TEST_ID, student_name: '응시생', student_id: 'my-student', answers: {} }) as never),
    theirs: { '남의 학생': () => levelResults.POST(request('POST', '/api/level-tests/results', { test_id: LEVEL_TEST_ID, student_name: '응시생', student_id: 'their-student', answers: {} }) as never) },
    anonymous: () => levelResults.POST(request('POST', '/api/level-tests/results', {}) as never),
  },
  {
    name: 'PATCH /api/level-tests/results/[id]', table: 'level_test_results',
    mine: () => levelResultOne.PATCH(request('PATCH', '/api/level-tests/results/my-result', { student_id: 'my-student' }) as never, { params: { id: 'my-result' } }),
    theirs: { '남의 학생': () => levelResultOne.PATCH(request('PATCH', '/api/level-tests/results/my-result', { student_id: 'their-student' }) as never, { params: { id: 'my-result' } }) },
    anonymous: () => levelResultOne.PATCH(request('PATCH', '/api/level-tests/results/my-result', {}) as never, { params: { id: 'my-result' } }),
  },
  {
    name: 'POST /api/notifications', table: 'parent_notifications',
    mine: () => notifications.POST(request('POST', '/api/notifications', { student_ids: ['my-student'], title: '안내', message: '내용' }) as never),
    theirs: { '남의 학생': () => notifications.POST(request('POST', '/api/notifications', { student_ids: ['my-student', 'their-student'], title: '안내', message: '내용' }) as never) },
    anonymous: () => notifications.POST(request('POST', '/api/notifications', {}) as never),
  },
  {
    name: 'POST /api/reports', table: 'reports',
    mine: () => reports.POST(request('POST', '/api/reports', { student_id: 'my-student', exam_id: 'my-exam', student_name: '학생', score: 80 }) as never),
    theirs: {
      '남의 학생': () => reports.POST(request('POST', '/api/reports', { student_id: 'their-student', student_name: '학생', score: 80 }) as never),
      '남의 시험': () => reports.POST(request('POST', '/api/reports', { student_id: 'my-student', exam_id: 'their-exam', student_name: '학생', score: 80 }) as never),
    },
    anonymous: () => reports.POST(request('POST', '/api/reports', {}) as never),
  },
  {
    name: 'POST /api/tuition', table: 'tuition_records',
    mine: () => tuition.POST(request('POST', '/api/tuition', { student_id: 'my-student', month_name: '2026-11' }) as never),
    theirs: { '남의 학생': () => tuition.POST(request('POST', '/api/tuition', { student_id: 'their-student', month_name: '2026-11' }) as never) },
    anonymous: () => tuition.POST(request('POST', '/api/tuition', {}) as never),
  },
  {
    name: 'POST /api/wrong-answers', table: 'wrong_answer_records',
    mine: () => wrongAnswers.POST(request('POST', '/api/wrong-answers', { exam_id: 'my-exam', student_id: 'my-student', wrong_question_ids: [] }) as never),
    theirs: {
      '남의 학생': () => wrongAnswers.POST(request('POST', '/api/wrong-answers', { exam_id: 'my-exam', student_id: 'their-student' }) as never),
      '남의 시험': () => wrongAnswers.POST(request('POST', '/api/wrong-answers', { exam_id: 'their-exam', student_id: 'my-student' }) as never),
    },
    anonymous: () => wrongAnswers.POST(request('POST', '/api/wrong-answers', {}) as never),
  },
  {
    name: 'POST /api/vocabulary/word-test', table: 'exams',
    mine: () => wordTest.POST(request('POST', '/api/vocabulary/word-test', { title: '단어', points_per_question: 5, questions: [wordQuestion('my-word'), wordQuestion('my-word')] }) as never),
    theirs: { '남의 단어': () => wordTest.POST(request('POST', '/api/vocabulary/word-test', { title: '단어', points_per_question: 5, questions: [wordQuestion('my-word'), wordQuestion('their-word')] }) as never) },
    anonymous: () => wordTest.POST(request('POST', '/api/vocabulary/word-test', {}) as never),
  },
]

for (const c of cases) {
  await test(`${c.name}: 내 것이면 정상 저장`, async () => {
    const db = seed()
    const res = await c.mine()
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()))
    assert.ok(db.writesTo(c.table).length >= 1, '저장이 일어나야 함')
  })
  for (const [label, call] of Object.entries(c.theirs)) {
    await test(`${c.name}: ${label} → 403, 저장 없음`, async () => {
      const db = seed()
      const res = await call()
      assert.equal(res.status, 403)
      assertNoWrites(db)
    })
  }
  await test(`${c.name}: 비로그인 → 401, 저장 없음`, async () => {
    const db = seed()
    db.loggedIn = false
    assert.equal((await c.anonymous()).status, 401)
    assertNoWrites(db)
  })
}

await test('선택 칸을 비우면 기존처럼 저장된다 (시험 없는 성적·보고서, 세트 없는 시험, 전체 알림, 학생 연결 없는 레벨테스트)', async () => {
  let db = seed()
  assert.equal((await results.POST(request('POST', '/api/exam-results', { student_id: 'my-student', exam_title: '시험', score: 90 }) as never)).status, 200)
  assert.equal(db.writesTo('exam_results').length, 1)
  db = seed()
  assert.equal((await reports.POST(request('POST', '/api/reports', { student_name: '학생', score: 80, student_id: '', exam_id: null }) as never)).status, 200)
  assert.equal(db.writesTo('reports').length, 1)
  db = seed()
  assert.equal((await exams.POST(request('POST', '/api/exams', { title: '시험' }) as never)).status, 200)
  assert.equal(db.writesTo('exams').length, 1)
  db = seed()
  assert.equal((await notifications.POST(request('POST', '/api/notifications', { title: '안내', message: '내용' }) as never)).status, 200)
  assert.equal(db.writesTo('parent_notifications')[0].rows[0].student_id, null)
  db = seed()
  assert.equal((await levelResults.POST(request('POST', '/api/level-tests/results', { test_id: LEVEL_TEST_ID, student_name: '응시생', answers: {} }) as never)).status, 200)
  assert.equal(db.writesTo('level_test_results')[0].rows[0].student_id, null)
})

await test('레벨테스트 PATCH: 확인 표시·학생 연결 끊기는 학생 확인 없이 그대로', async () => {
  let db = seed()
  assert.equal((await levelResultOne.PATCH(request('PATCH', '/api/level-tests/results/my-result', { reviewed: true }) as never, { params: { id: 'my-result' } })).status, 200)
  assert.ok(!db.reads.includes('students'))
  db = seed()
  assert.equal((await levelResultOne.PATCH(request('PATCH', '/api/level-tests/results/my-result', { student_id: null }) as never, { params: { id: 'my-result' } })).status, 200)
  assert.equal(db.writesTo('level_test_results')[0].rows[0].student_id, null)
})

await test('응시 대상: 빈 목록으로 맞추기(전원 빼기)는 그대로 된다', async () => {
  const db = seed()
  db.tables.exam_assignments = [{ id: 'a1', user_id: 'me', exam_id: 'my-exam', student_id: 'my-student' }]
  const res = await assignments.PUT(request('PUT', '/api/exam-assignments', { exam_id: 'my-exam', student_ids: [] }) as never)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, added: 0, removed: 1 })
})

await test('공용 함수: DB 오류는 500 이고 저장하지 않는다', async () => {
  const db = seed()
  db.failing.set('students', { code: 'XX000', message: 'db down' })
  const res = await homework.POST(request('POST', '/api/homework', { student_id: 'my-student', title: '워크북' }) as never)
  assert.equal(res.status, 500)
  assertNoWrites(db)
})

await test('공용 함수: uuid 형식 오류는 403', async () => {
  const db = new FakeDb({})
  db.failing.set('students', { code: '22P02', message: 'invalid uuid' })
  const r = await checkStudentsOwnership(db.client(), ['abc'], 'me')
  assert.equal(!r.ok && r.status, 403)
})

await test('공용 함수: 빈 목록은 통과(조회 없음), 중복은 한 번만, 문자가 아닌 값은 403', async () => {
  const db = new FakeDb({ students: [{ id: 'a', user_id: 'me' }] })
  assert.deepEqual(await checkStudentsOwnership(db.client(), [], 'me'), { ok: true })
  assert.deepEqual(db.reads, [])
  assert.deepEqual(await checkStudentsOwnership(db.client(), ['a', 'a'], 'me'), { ok: true })
  for (const bad of [null, undefined, '', 1, {}]) {
    const r = await checkStudentsOwnership(db.client(), [bad], 'me')
    assert.equal(!r.ok && r.status, 403)
  }
})

await test('공용 함수: 100개가 넘어도 나눠서 전부 확인한다', async () => {
  const ids = Array.from({ length: 250 }, (_, i) => `s${i}`)
  const db = new FakeDb({ students: ids.map((id) => ({ id, user_id: 'me' })) })
  assert.deepEqual(await checkOwnedIds(db.client(), 'students', ids, 'me', 'x'), { ok: true })
  assert.equal(db.reads.length, 3)
  db.tables.students[249].user_id = 'other'
  const r = await checkOwnedIds(db.client(), 'students', ids, 'me', 'x')
  assert.equal(!r.ok && r.status, 403)
})

console.log(`\n${passed}개 통과`)
