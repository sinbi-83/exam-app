// 반 관리 1단계 점검 (DB·서버 접속 없음). 실제 API 함수와 대시보드 집계를 가짜 DB 로 실행한다.
//   1) 학년 표기 변환  2) 부분 고유 조건과 같은 규칙  3) 퇴원 시 집계 제외  4) 칸·표가 없을 때의 대비  5) 소유 확인
// SQL 자체는 메모리 Postgres 로 따로 실행해 확인했다 (docs/class-management-plan.md). 여기서는 파일 내용만 검사한다.
// 실행: npm run test-class-management

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FakeDb, installRouteHooks, request } from './support/routeHarness.ts'
import { GRADE_CODES, gradeWarnings, normalizeGrade } from '../lib/gradeNormalize.ts'
import {
  buildClassOverview,
  isDateString,
  isSchemaMissing,
  leaveDateProblem,
  NOT_READY_MESSAGE,
  parseClassFields,
  parseSchedules,
  planMemberAdds,
  studentStatusOf,
} from '../lib/classManagement.ts'
import { buildTaskItems } from '../lib/dashboard.ts'
import { NAV_GROUPS } from '../config/navigation.ts'

installRouteHooks()

const classesRoute = await import('../app/api/classes/route.ts')
const classRoute = await import('../app/api/classes/[id]/route.ts')
const membersRoute = await import('../app/api/classes/[id]/students/route.ts')
const moveRoute = await import('../app/api/classes/[id]/students/move/route.ts')
const studentsRoute = await import('../app/api/students/route.ts')
const studentRoute = await import('../app/api/students/[id]/route.ts')
const statusRoute = await import('../app/api/students/[id]/status/route.ts')
const { loadDashboardCounts } = await import('../lib/dashboardData.ts')

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf-8')

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

const NEW_TABLES = ['classes', 'class_schedules', 'class_students']
const STATUS_COLUMNS = ['students.status', 'students.withdrawn_on', 'students.withdraw_note']

// SQL 적용 뒤
function readyDb() {
  return new FakeDb({
    students: [
      { id: 'a', user_id: 'me', name: '가', grade: '중2', status: 'active', created_at: '1' },
      { id: 'b', user_id: 'me', name: '나', grade: '중학교 2학년', status: 'active', created_at: '2' },
      { id: 'c', user_id: 'me', name: '다', grade: '고1', status: 'active', created_at: '3' },
      { id: 'p', user_id: 'me', name: '라', grade: '중2', status: 'paused', created_at: '4' },
      { id: 'w', user_id: 'me', name: '마', grade: '중2', status: 'withdrawn', created_at: '5' },
      { id: 'theirs', user_id: 'other', name: '바', grade: '중2', status: 'active', created_at: '6' },
    ],
    classes: [
      { id: 'c1', user_id: 'me', name: '중2 A', target_grades: ['중2'], status: 'active' },
      { id: 'c2', user_id: 'me', name: '중2 B', target_grades: ['중2'], status: 'active' },
      { id: 'closed', user_id: 'me', name: '끝난 반', target_grades: [], status: 'closed', closed_on: '2026-01-01' },
      { id: 'their-class', user_id: 'other', name: '남의 반', target_grades: [], status: 'active' },
    ],
    class_schedules: [],
    class_students: [{ id: 'm1', user_id: 'me', class_id: 'c1', student_id: 'a', joined_on: '2026-10-01', left_on: null }],
  }).use()
}

// SQL 적용 전: 새 표·칸이 없다 (학생 상태 칸 없음)
function notReadyDb() {
  const db = new FakeDb({ students: [{ id: 'a', user_id: 'me', name: '가', grade: '중2', created_at: '1' }, { id: 'b', user_id: 'me', name: '나', grade: '중1', created_at: '2' }] }).use()
  for (const t of NEW_TABLES) db.missingTables.add(t)
  for (const c of STATUS_COLUMNS) db.missingColumns.add(c)
  return db
}

const post = (url: string, body: unknown) => request('POST', url, body) as never
const patch = (url: string, body: unknown) => request('PATCH', url, body) as never
const params = (id: string) => ({ params: { id } })

// ---------- 1) 학년 표기 ----------

await test('학년 변환: 여러 표기가 같은 코드로', () => {
  const cases: [string, string][] = [
    ['중2', '중2'], ['중 2', '중2'], ['중학교 2학년', '중2'], ['중학교2학년', '중2'], ['중등2', '중2'], ['중등 2학년', '중2'], ['중학 2', '중2'], ['중2학년', '중2'],
    ['중학교 이학년', '중2'], ['중학생 2', '중2'],
    ['초3', '초3'], ['초등학교 6학년', '초6'], ['초등 4', '초4'], ['초등학교 삼학년', '초3'],
    ['고1', '고1'], ['고등학교 3학년', '고3'], ['고등 2학년', '고2'], ['고교 1', '고1'],
    ['  중２ ', '중2'], // 전각 숫자, 앞뒤 빈칸
  ]
  for (const [raw, code] of cases) assert.equal(normalizeGrade(raw), code, raw)
})

await test('학년 변환: 초3~고3 밖이거나 모호하면 null (추측 안 함)', () => {
  for (const raw of ['', '   ', '2학년', '중', '중4', '고4', '초1', '초2', '초등학교 2학년', '초7', '예비 중1', '중2-1', '재수', 'N수', '대1', '중2 고1']) {
    assert.equal(normalizeGrade(raw), null, raw)
  }
  assert.equal(normalizeGrade(null), null)
  assert.equal(normalizeGrade(undefined), null)
})

await test('학년 코드 목록: 10개, 마이그레이션 SQL 의 허용 목록과 같다', () => {
  assert.equal(GRADE_CODES.length, 10)
  const list = GRADE_CODES.map((g) => `'${g}'`).join(', ')
  assert.ok(read('class-management-migration.sql').includes(`array[${list}]::text[]`))
})

await test('대상 학년 경고: 다른 학년·알 수 없는 학년만, 대상 학년이 없는 반은 경고 없음', () => {
  const list = [{ grade: '중학교 2학년' }, { grade: '고1' }, { grade: '' }, { grade: null }]
  assert.deepEqual(gradeWarnings(list, ['중2']).map((w) => [w.student.grade, w.reason]), [['고1', 'not_target'], ['', 'unknown_grade'], [null, 'unknown_grade']])
  assert.deepEqual(gradeWarnings(list, []), [])
})

// ---------- 2) 부분 고유 조건 ----------

await test('넣기 계획: 지금 소속이면 건너뜀, 나간 학생은 다시 넣음, 중복 요청은 하나로', () => {
  const current = [{ student_id: 'open', left_on: null }, { student_id: 'left', left_on: '2026-10-01' }]
  assert.deepEqual(planMemberAdds(current, ['open', 'left', 'new', 'new']), { add: ['left', 'new'], alreadyIn: ['open'] })
  assert.deepEqual(planMemberAdds([], []), { add: [], alreadyIn: [] })
})

await test('넣기 API: 이미 소속인 학생은 행을 더 만들지 않는다', async () => {
  const db = readyDb()
  const res = await membersRoute.POST(post('/x', { student_ids: ['a', 'b', 'b'] }), params('c1'))
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.added, 1)
  assert.equal(json.alreadyIn, 1)
  assert.equal(db.tables.class_students.filter((m) => m.student_id === 'b').length, 1)
  assert.equal(db.tables.class_students.filter((m) => m.student_id === 'a' && m.left_on === null).length, 1)
})

await test('넣기 API: 나갔던 학생은 새 행으로 다시 들어가고 지난 기록은 남는다', async () => {
  const db = readyDb()
  await membersRoute.PATCH(patch('/x', { student_ids: ['a'], left_on: '2026-10-10' }), params('c1'))
  const res = await membersRoute.POST(post('/x', { student_ids: ['a'], joined_on: '2026-10-10' }), params('c1'))
  assert.equal(res.status, 200)
  const rows = db.tables.class_students.filter((m) => m.student_id === 'a')
  assert.deepEqual(rows.map((m) => m.left_on ?? null), ['2026-10-10', null])
})

await test('넣기 API: 다른 곳에서 먼저 넣어 고유 조건(23505)에 걸리면 409', async () => {
  const db = readyDb()
  const original = db.client() as unknown as { from: (t: string) => { insert: (r: unknown) => unknown } }
  ;(globalThis as unknown as { __fakeSupabase: unknown }).__fakeSupabase = {
    ...original,
    from: (t: string) => {
      const q = original.from(t)
      if (t === 'class_students') q.insert = () => ({ then: (ok: (v: unknown) => unknown) => Promise.resolve(ok({ error: { code: '23505', message: 'duplicate' } })) })
      return q
    },
  }
  const res = await membersRoute.POST(post('/x', { student_ids: ['b'] }), params('c1'))
  assert.equal(res.status, 409)
})

await test('빼기 API: 행을 지우지 않고 left_on 만 채운다, 입반일보다 빠른 날짜는 400', async () => {
  const db = readyDb()
  const early = await membersRoute.PATCH(patch('/x', { student_ids: ['a'], left_on: '2026-09-01' }), params('c1'))
  assert.equal(early.status, 400)
  assert.equal(db.tables.class_students[0].left_on, null)
  const res = await membersRoute.PATCH(patch('/x', { student_ids: ['a'], left_on: '2026-10-01' }), params('c1'))
  assert.equal(res.status, 200)
  assert.equal(db.tables.class_students.length, 1)
  assert.equal(db.tables.class_students[0].left_on, '2026-10-01')
  assert.deepEqual(db.writesTo('class_students').filter((w) => w.op === 'delete'), [])
})

await test('날짜 규칙', () => {
  assert.equal(leaveDateProblem('2026-10-01', [{ joined_on: '2026-10-01' }]), null)
  assert.ok(leaveDateProblem('2026-09-30', [{ joined_on: '2026-10-01' }]))
  assert.equal(leaveDateProblem('2026-01-01', []), null)
  assert.ok(isDateString('2028-02-29'))
  for (const bad of ['2026-02-30', '2026-13-01', '20261101', '', null, 5]) assert.ok(!isDateString(bad))
})

await test('옮기기 API: 새 반에 들어가고 이 반에서 빠진다', async () => {
  const db = readyDb()
  const res = await moveRoute.POST(post('/x', { student_ids: ['a'], to_class_id: 'c2', moved_on: '2026-11-01' }), params('c1'))
  assert.equal(res.status, 200)
  const rows = db.tables.class_students.filter((m) => m.student_id === 'a')
  assert.deepEqual(rows.map((m) => [m.class_id, m.left_on ?? null]), [['c1', '2026-11-01'], ['c2', null]])
})

await test('옮기기 API: 잘못된 요청은 아무것도 바꾸지 않는다', async () => {
  const cases: [unknown, number][] = [
    [{ student_ids: ['b'], to_class_id: 'c2' }, 409], // 이 반에 없는 학생
    [{ student_ids: ['a'], to_class_id: 'c1' }, 400], // 같은 반
    [{ student_ids: ['a'], to_class_id: 'closed' }, 409], // 종료된 반
    [{ student_ids: ['a'], to_class_id: 'c2', moved_on: '2026-09-01' }, 400], // 입반일보다 빠름
    [{ student_ids: ['a'], to_class_id: 'their-class' }, 403],
    [{ student_ids: ['theirs'], to_class_id: 'c2' }, 403],
  ]
  for (const [body, status] of cases) {
    const db = readyDb()
    assert.equal((await moveRoute.POST(post('/x', body), params('c1'))).status, status, JSON.stringify(body))
    assert.deepEqual(db.writesTo('class_students'), [], JSON.stringify(body))
  }
})

// ---------- 반 만들기·수정·종료 ----------

await test('입력 검사: 반 이름·학년 코드·요일·시간', () => {
  assert.equal(parseClassFields({ name: ' ' }, false).ok, false)
  assert.equal(parseClassFields({ name: 'A', target_grades: ['초1'] }, false).ok, false)
  assert.deepEqual(parseClassFields({ name: ' A ', target_grades: ['중2', '중2'], teacher_name: ' ' }, false), { ok: true, fields: { name: 'A', target_grades: ['중2'], teacher_name: null, note: null } })
  assert.deepEqual(parseClassFields({ note: '메모' }, true), { ok: true, fields: { note: '메모' } })
  assert.deepEqual(parseSchedules([{ weekday: 7, start_time: '9:30', end_time: '10:00:00' }]), { ok: true, schedules: [{ weekday: 7, start_time: '09:30', end_time: '10:00' }] })
  for (const bad of [[{ weekday: 0, start_time: '09:00', end_time: '10:00' }], [{ weekday: 8, start_time: '09:00', end_time: '10:00' }], [{ weekday: 1, start_time: '10:00', end_time: '10:00' }], [{ weekday: 1, start_time: '25:00', end_time: '26:00' }], 'x']) {
    assert.equal(parseSchedules(bad).ok, false)
  }
})

await test('반 만들기: 시간·학생까지 저장, 대상 학년이 아니면 넣고 경고만', async () => {
  const db = readyDb()
  const res = await classesRoute.POST(post('/x', {
    name: '새 반', target_grades: ['중2'], schedules: [{ weekday: 1, start_time: '16:00', end_time: '17:00' }], student_ids: ['a', 'c'],
  }))
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.added, 2)
  assert.deepEqual(json.warnings.map((w: { student_id: string; reason: string }) => [w.student_id, w.reason]), [['c', 'not_target']])
  assert.equal(db.tables.class_schedules.length, 1)
  assert.equal(db.tables.class_students.filter((m) => m.class_id === json.data.id).length, 2)
})

await test('"중학교 2학년" 표기 학생은 중2 반에 경고 없이 들어간다', async () => {
  readyDb()
  const json = await (await membersRoute.POST(post('/x', { student_ids: ['b'] }), params('c1'))).json()
  assert.deepEqual(json.warnings, [])
})

await test('반 만들기: 남의 학생·퇴원 학생이 섞이면 반을 만들지 않는다', async () => {
  for (const [ids, status] of [[['a', 'theirs'], 403], [['a', 'w'], 409]] as const) {
    const db = readyDb()
    assert.equal((await classesRoute.POST(post('/x', { name: '새 반', student_ids: ids }))).status, status)
    assert.deepEqual(db.writesTo('classes'), [])
  }
})

await test('넣기: 퇴원 학생·종료된 반은 막고, 휴원 학생은 된다', async () => {
  let db = readyDb()
  assert.equal((await membersRoute.POST(post('/x', { student_ids: ['w'] }), params('c1'))).status, 409)
  assert.deepEqual(db.writesTo('class_students'), [])
  db = readyDb()
  assert.equal((await membersRoute.POST(post('/x', { student_ids: ['b'] }), params('closed'))).status, 409)
  assert.deepEqual(db.writesTo('class_students'), [])
  db = readyDb()
  assert.equal((await membersRoute.POST(post('/x', { student_ids: ['p'] }), params('c1'))).status, 200)
})

await test('반 종료: 소속을 닫고 상태·종료일 저장, 입반일보다 빠른 날·두 번 종료는 막음', async () => {
  let db = readyDb()
  assert.equal((await classRoute.PATCH(patch('/x', { action: 'close', closed_on: '2026-09-01' }), params('c1'))).status, 400)
  assert.deepEqual(db.writes, [])
  db = readyDb()
  const res = await classRoute.PATCH(patch('/x', { action: 'close', closed_on: '2026-11-01' }), params('c1'))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).closed_members, 1)
  const cls = db.tables.classes.find((c) => c.id === 'c1')!
  assert.deepEqual([cls.status, cls.closed_on], ['closed', '2026-11-01'])
  assert.equal(db.tables.class_students[0].left_on, '2026-11-01')
  assert.equal((await classRoute.PATCH(patch('/x', { action: 'close' }), params('c1'))).status, 409)
})

await test('반 수정: 요일·시간을 새로 넣은 뒤 옛 시간을 지운다', async () => {
  const db = readyDb()
  db.tables.class_schedules.push({ id: 'old', user_id: 'me', class_id: 'c1', weekday: 1, start_time: '10:00', end_time: '11:00' })
  const res = await classRoute.PATCH(patch('/x', { name: '새 이름', schedules: [{ weekday: 3, start_time: '16:00', end_time: '17:00' }] }), params('c1'))
  assert.equal(res.status, 200)
  assert.deepEqual(db.tables.class_schedules.map((s) => s.weekday), [3])
  assert.equal(db.tables.classes.find((c) => c.id === 'c1')!.name, '새 이름')
  const ops = db.writesTo('class_schedules').map((w) => w.op)
  assert.deepEqual(ops, ['insert', 'delete'])
})

await test('반에는 삭제 기능이 없다 (API·화면)', () => {
  for (const route of [classesRoute, classRoute, membersRoute, moveRoute]) assert.ok(!('DELETE' in route))
  assert.doesNotMatch(read('app/classes/[id]/page.tsx'), /method: 'DELETE'|반 삭제/)
  assert.doesNotMatch(read('app/classes/page.tsx'), /method: 'DELETE'|반 삭제/)
})

// ---------- 3) 퇴원과 집계 ----------

await test('퇴원 API: DB 함수 호출, 날짜·사유 전달, 학생 표를 따로 쓰지 않는다', async () => {
  const db = readyDb()
  db.rpcHandlers.withdraw_student = () => ({ data: 2 })
  const res = await statusRoute.PATCH(patch('/x', { status: 'withdrawn', withdrawn_on: '2026-10-31', withdraw_note: '이사' }), params('a'))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).closed_memberships, 2)
  assert.deepEqual(db.rpcCalls, [{ name: 'withdraw_student', args: { p_student_id: 'a', p_withdrawn_on: '2026-10-31', p_note: '이사' } }])
  assert.deepEqual(db.writesTo('students'), [])
  assert.deepEqual(db.writesTo('class_students'), [])
})

await test('퇴원 API: 잘못된 날짜·미래 날짜·이미 퇴원은 함수를 부르지 않는다', async () => {
  const cases: [string, unknown, number][] = [
    ['a', { status: 'withdrawn', withdrawn_on: '2026-02-30' }, 400],
    ['a', { status: 'withdrawn', withdrawn_on: '2999-01-01' }, 400],
    ['w', { status: 'withdrawn', withdrawn_on: '2026-10-01' }, 409],
    ['a', { status: 'gone' }, 400],
  ]
  for (const [id, body, status] of cases) {
    const db = readyDb()
    assert.equal((await statusRoute.PATCH(patch('/x', body), params(id))).status, status, JSON.stringify(body))
    assert.deepEqual(db.rpcCalls, [])
  }
})

await test('휴원·복귀 API: 상태만 바꾼다 (퇴원 복귀해도 반에 자동으로 안 들어감)', async () => {
  const db = readyDb()
  assert.equal((await statusRoute.PATCH(patch('/x', { status: 'paused' }), params('a'))).status, 200)
  assert.equal(db.tables.students.find((s) => s.id === 'a')!.status, 'paused')
  assert.equal((await statusRoute.PATCH(patch('/x', { status: 'active' }), params('w'))).status, 200)
  assert.equal(db.tables.students.find((s) => s.id === 'w')!.status, 'active')
  assert.equal(db.tables.class_students.filter((m) => m.student_id === 'w').length, 0)
})

await test('현황: 재원·휴원·퇴원 수, 반 없는 재원 학생, 반별 인원 (퇴원·종료된 반 제외)', () => {
  const students = [{ id: 'a', status: 'active' }, { id: 'b', status: 'active' }, { id: 'p', status: 'paused' }, { id: 'w', status: 'withdrawn' }, { id: 'old' }]
  const classes = [{ id: 'c1', name: 'A', status: 'active' }, { id: 'c2', name: 'B', status: 'active' }, { id: 'x', name: 'X', status: 'closed' }]
  const memberships = [
    { class_id: 'c1', student_id: 'a', left_on: null },
    { class_id: 'c2', student_id: 'a', left_on: null }, // 한 학생 두 반
    { class_id: 'c1', student_id: 'p', left_on: null },
    { class_id: 'c1', student_id: 'w', left_on: null }, // 어긋난 자료여도 인원에 안 셈
    { class_id: 'c2', student_id: 'b', left_on: '2026-10-01' }, // 나감 → 반 없음
    { class_id: 'x', student_id: 'old', left_on: null }, // 종료된 반만 → 반 없음
  ]
  assert.deepEqual(buildClassOverview(students, classes, memberships), {
    activeStudents: 3,
    pausedStudents: 1,
    withdrawnStudents: 1,
    studentsWithoutClass: 2,
    classes: [{ id: 'c1', name: 'A', active: 1, paused: 1 }, { id: 'c2', name: 'B', active: 1, paused: 0 }],
  })
})

function dashboardRows(db: FakeDb) {
  db.tables.homework = [
    { id: 'h1', user_id: 'me', student_id: 'a', status: 'assigned', due_date: '2026-10-01' },
    { id: 'h2', user_id: 'me', student_id: 'p', status: 'assigned', due_date: '2026-10-01' },
    { id: 'h3', user_id: 'me', student_id: 'w', status: 'assigned', due_date: '2026-10-01' },
    { id: 'h4', user_id: 'me', student_id: 'b', status: 'assigned', due_date: '2026-11-01' },
    { id: 'h5', user_id: 'me', student_id: 'w', status: 'assigned', due_date: '2026-11-01' },
  ]
  db.tables.tuition_records = [
    { id: 't1', user_id: 'me', student_id: 'a', month_name: '2026-11', status: 'paid' },
    { id: 't2', user_id: 'me', student_id: 'w', month_name: '2026-11', status: 'paid' }, // 퇴원생 납부가 재원생 미납을 줄이면 안 됨
  ]
  return db
}
const NOW = new Date('2026-11-01T03:00:00Z')

await test('대시보드: 원비 미납·숙제 미완료는 재원 학생만 센다', async () => {
  const db = dashboardRows(readyDb())
  const { counts, errors, classInfo } = await loadDashboardCounts(db.client(), 'me', NOW)
  assert.deepEqual(errors, {})
  assert.equal(counts.tuitionUnpaidStudents, 2) // 재원 a·b·c 중 a 만 납부
  assert.equal(counts.homeworkOverdueStudents, 1) // a 만 (p·w 제외)
  assert.equal(counts.homeworkDueStudents, 1) // b 만 (w 제외)
  assert.equal(counts.homeworkPendingStudents, 2)
  assert.equal(counts.activeStudentBasis, true)
  assert.equal(classInfo.ready, true)
  assert.equal(classInfo.overview!.activeStudents, 3)
  assert.equal(classInfo.overview!.pausedStudents, 1)
  assert.equal(classInfo.overview!.withdrawnStudents, 1)
  assert.equal(classInfo.overview!.studentsWithoutClass, 2)
  assert.deepEqual(classInfo.overview!.classes.find((c) => c.id === 'c1'), { id: 'c1', name: '중2 A', active: 1, paused: 0 })
  assert.equal(classInfo.overview!.classes.some((c) => c.id === 'closed' || c.id === 'their-class'), false)
  const task = buildTaskItems(counts).find((i) => i.key === 'tuition_unpaid')!
  assert.equal(task.note, '재원 학생 기준')
})

await test('숙제·원비 화면도 같은 기준이다 (대시보드 숫자를 누르면 같은 학생들)', () => {
  const hw = read('app/homework/page.tsx')
  assert.match(hw, /\['overdue', 'due', 'pending'\]\.includes\(view\) && nonActiveIds\.has\(h\.student_id\)/)
  const tuition = read('app/tuition/page.tsx')
  assert.match(tuition, /records\[s\.id\]\?\.status !== 'paid' && isActiveStudent\(s\.id\)/)
  assert.match(tuition, /activeRecords\.filter\(\(r\) => r\.status !== 'paid'\)/)
})

// ---------- 4) 칸·표가 없을 때 ----------

await test('오류 알아보기: 표·칸·함수 없음만 "적용 전"', () => {
  for (const e of [{ code: '42P01', message: '' }, { code: 'PGRST205', message: '' }, { code: '42703', message: '' }, { code: 'PGRST204', message: '' }, { code: '42883', message: '' }, { code: 'PGRST202', message: '' }]) assert.ok(isSchemaMissing(e))
  assert.ok(!isSchemaMissing({ code: '23505', message: 'duplicate key' }))
  assert.ok(!isSchemaMissing({ code: 'XX000', message: 'db down' }))
  assert.ok(!isSchemaMissing(null))
  assert.equal(studentStatusOf({}), 'active')
  assert.equal(studentStatusOf({ status: 'weird' }), 'active')
})

await test('적용 전 대시보드: 깨지지 않고 지금까지처럼 전체 학생 기준, 반 현황은 준비 중', async () => {
  const db = notReadyDb()
  db.tables.homework = [{ id: 'h1', user_id: 'me', student_id: 'a', status: 'assigned', due_date: '2026-10-01' }]
  db.tables.tuition_records = [{ id: 't1', user_id: 'me', student_id: 'a', month_name: '2026-11', status: 'paid' }]
  const { counts, errors, classInfo } = await loadDashboardCounts(db.client(), 'me', NOW)
  assert.deepEqual(errors, {})
  assert.equal(counts.tuitionUnpaidStudents, 1)
  assert.equal(counts.homeworkOverdueStudents, 1)
  assert.equal(counts.activeStudentBasis, false)
  assert.equal(classInfo.ready, false)
  assert.equal(classInfo.overview, null)
  assert.equal(buildTaskItems(counts).find((i) => i.key === 'tuition_unpaid')!.note, '등록한 학생 전체 기준')
  assert.match(read('app/dashboard/page.tsx'), /NOT_READY_MESSAGE/)
  assert.equal(NOT_READY_MESSAGE, '반 관리 준비 중(DB 적용 필요)')
})

await test('적용 전 API: 목록은 빈 값 + needsMigration, 쓰기는 503, 저장 없음', async () => {
  const db = notReadyDb()
  const list = await classesRoute.GET()
  assert.equal(list.status, 200)
  assert.deepEqual(await list.json(), { data: [], memberships: [], needsMigration: true })
  const detail = await classRoute.GET(request('GET', '/x') as never, params('c1'))
  assert.equal((await detail.json()).needsMigration, true)
  const calls = [
    classesRoute.POST(post('/x', { name: '새 반' })),
    classRoute.PATCH(patch('/x', { action: 'close' }), params('c1')),
    membersRoute.POST(post('/x', { student_ids: ['a'] }), params('c1')),
    membersRoute.PATCH(patch('/x', { student_ids: ['a'] }), params('c1')),
    moveRoute.POST(post('/x', { student_ids: ['a'], to_class_id: 'c2' }), params('c1')),
    statusRoute.PATCH(patch('/x', { status: 'paused' }), params('a')),
    statusRoute.PATCH(patch('/x', { status: 'withdrawn' }), params('a')),
  ]
  for (const res of await Promise.all(calls)) {
    assert.equal(res.status, 503)
    const json = await res.json()
    assert.equal(json.needsMigration, true)
    assert.equal(json.error, NOT_READY_MESSAGE)
  }
  assert.deepEqual(db.writes, [])
  assert.deepEqual(db.rpcCalls, [])
})

await test('적용 전 학생 목록: 상태 칸 없이도 학생을 전부 돌려준다', async () => {
  notReadyDb()
  const res = await studentsRoute.GET()
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.statusReady, false)
  assert.equal(json.data.length, 2)
})

await test('적용 뒤 학생 목록: 상태 칸을 함께 준다', async () => {
  readyDb()
  const json = await (await studentsRoute.GET()).json()
  assert.equal(json.statusReady, true)
  assert.equal(json.data.length, 5)
  assert.ok(json.data.every((s: { status?: string }) => s.status))
})

await test('표만 빠진 어중간한 상태도 준비 중으로 본다', async () => {
  const db = readyDb()
  db.missingTables.add('class_schedules')
  assert.equal((await (await classesRoute.GET()).json()).needsMigration, true)
})

await test('적용 뒤 DB 함수만 없으면(PGRST202) 준비 중 503', async () => {
  const db = readyDb()
  assert.equal((await statusRoute.PATCH(patch('/x', { status: 'withdrawn' }), params('a'))).status, 503)
  assert.deepEqual(db.writesTo('students'), [])
})

await test('DB 오류는 준비 중으로 숨기지 않는다 (500)', async () => {
  const db = readyDb()
  db.failing.set('classes', { code: 'XX000', message: 'db down' })
  assert.equal((await classesRoute.GET()).status, 500)
})

await test('head 조회로 준비 여부를 판단하지 않는다 (표가 없어도 오류가 안 나므로)', () => {
  const src = read('lib/classManagementData.ts').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.doesNotMatch(src, /head: true/)
})

// ---------- 학생 삭제 ----------

await test('학생 삭제: 기록이 0건이면 삭제된다 (적용 전에도)', async () => {
  let db = readyDb()
  assert.equal((await studentRoute.DELETE(request('DELETE', '/x') as never, params('b'))).status, 200)
  assert.equal(db.tables.students.some((s) => s.id === 'b'), false)
  db = notReadyDb()
  assert.equal((await studentRoute.DELETE(request('DELETE', '/x') as never, params('a'))).status, 200)
  assert.equal(db.tables.students.some((s) => s.id === 'a'), false)
})

await test('학생 삭제: 기록이 하나라도 있으면 409 + 건수 + 퇴원 안내, 학생은 그대로', async () => {
  const tables = ['attendance', 'homework', 'tuition_records', 'parent_notifications', 'exam_assignments', 'exam_results', 'wrong_answer_records', 'reports', 'level_test_results']
  for (const table of tables) {
    const db = readyDb()
    db.tables[table] = [{ id: 'r1', student_id: 'b', user_id: 'me' }]
    const res = await studentRoute.DELETE(request('DELETE', '/x') as never, params('b'))
    assert.equal(res.status, 409, table)
    const json = await res.json()
    assert.equal(json.canWithdraw, true)
    assert.match(json.error, /퇴원 처리/)
    assert.equal(json.records.length, 1)
    assert.deepEqual(db.writesTo('students'), [], table)
  }
  // 반 소속 기록도
  const db = readyDb()
  assert.equal((await studentRoute.DELETE(request('DELETE', '/x') as never, params('a'))).status, 409)
  assert.deepEqual(db.writesTo('students'), [])
})

await test('학생 삭제: 적용 전에 기록이 있으면 "DB 적용 뒤" 안내', async () => {
  const db = notReadyDb()
  db.tables.homework = [{ id: 'h', student_id: 'a', user_id: 'me' }]
  const res = await studentRoute.DELETE(request('DELETE', '/x') as never, params('a'))
  assert.equal(res.status, 409)
  const json = await res.json()
  assert.equal(json.canWithdraw, false)
  assert.match(json.error, /DB 적용 뒤/)
})

await test('학생 삭제: 기록을 세다 오류가 나면 지우지 않는다 (500)', async () => {
  const db = readyDb()
  db.failing.set('homework', { code: 'XX000', message: 'db down' })
  assert.equal((await studentRoute.DELETE(request('DELETE', '/x') as never, params('b'))).status, 500)
  assert.deepEqual(db.writesTo('students'), [])
})

await test('학생 삭제 화면: 실패 내용을 알리고 퇴원 양식을 연다', () => {
  const page = read('app/students/page.tsx')
  assert.match(page, /r\?\.canWithdraw/)
  assert.match(page, /setPanel\(\{ kind: 'withdraw', ids: \[id\] \}\)/)
})

// ---------- 5) 소유 확인·로그인 ----------

await test('소유 확인: 남의 반·학생은 403, 저장 없음', async () => {
  const calls: [string, () => Promise<Response>][] = [
    ['반 상세', () => classRoute.GET(request('GET', '/x') as never, params('their-class'))],
    ['반 수정', () => classRoute.PATCH(patch('/x', { name: 'x' }), params('their-class'))],
    ['반 종료', () => classRoute.PATCH(patch('/x', { action: 'close' }), params('their-class'))],
    ['남의 반에 넣기', () => membersRoute.POST(post('/x', { student_ids: ['a'] }), params('their-class'))],
    ['남의 학생 넣기', () => membersRoute.POST(post('/x', { student_ids: ['a', 'theirs'] }), params('c1'))],
    ['남의 반에서 빼기', () => membersRoute.PATCH(patch('/x', { student_ids: ['a'] }), params('their-class'))],
    ['남의 학생 빼기', () => membersRoute.PATCH(patch('/x', { student_ids: ['theirs'] }), params('c1'))],
    ['남의 반에서 옮기기', () => moveRoute.POST(post('/x', { student_ids: ['a'], to_class_id: 'c1' }), params('their-class'))],
    ['남의 학생 상태', () => statusRoute.PATCH(patch('/x', { status: 'paused' }), params('theirs'))],
    ['남의 학생 퇴원', () => statusRoute.PATCH(patch('/x', { status: 'withdrawn' }), params('theirs'))],
    ['없는 학생 상태', () => statusRoute.PATCH(patch('/x', { status: 'paused' }), params('nobody'))],
    ['남의 학생 삭제', () => studentRoute.DELETE(request('DELETE', '/x') as never, params('theirs'))],
  ]
  for (const [name, call] of calls) {
    const db = readyDb()
    assert.equal((await call()).status, 403, name)
    assert.deepEqual(db.writes, [], name)
    assert.deepEqual(db.rpcCalls, [], name)
  }
})

await test('로그인 확인: 비로그인은 모든 새 API 가 401, 저장 없음', async () => {
  const calls: [string, () => Promise<Response>][] = [
    ['목록', () => classesRoute.GET()],
    ['만들기', () => classesRoute.POST(post('/x', { name: 'x' }))],
    ['상세', () => classRoute.GET(request('GET', '/x') as never, params('c1'))],
    ['수정', () => classRoute.PATCH(patch('/x', {}), params('c1'))],
    ['넣기', () => membersRoute.POST(post('/x', {}), params('c1'))],
    ['빼기', () => membersRoute.PATCH(patch('/x', {}), params('c1'))],
    ['옮기기', () => moveRoute.POST(post('/x', {}), params('c1'))],
    ['상태', () => statusRoute.PATCH(patch('/x', {}), params('a'))],
    ['삭제', () => studentRoute.DELETE(request('DELETE', '/x') as never, params('a'))],
  ]
  for (const [name, call] of calls) {
    const db = readyDb()
    db.loggedIn = false
    assert.equal((await call()).status, 401, name)
    assert.deepEqual(db.writes, [], name)
  }
})

await test('목록은 내 반만 돌려준다', async () => {
  readyDb()
  const json = await (await classesRoute.GET()).json()
  assert.deepEqual(json.data.map((c: { id: string }) => c.id).sort(), ['c1', 'c2', 'closed'])
  assert.equal(json.data.find((c: { id: string }) => c.id === 'c1').member_count, 1)
})

// ---------- 파일·화면 ----------

await test('메뉴: 학생관리 묶음 안에 반 관리', () => {
  const group = NAV_GROUPS.find((g) => g.title === '학생관리')!
  assert.ok(group.items.some((i) => i.href === '/classes' && i.label === '반 관리'))
})

await test('화면: 준비 중 안내, 상태 필터, 여러 명 선택, 퇴원 양식', () => {
  for (const f of ['app/classes/page.tsx', 'app/classes/[id]/page.tsx', 'app/students/page.tsx']) assert.match(read(f), /NotReadyNotice/, f)
  const students = read('app/students/page.tsx')
  assert.match(students, /STUDENT_STATUSES\.map/)
  assert.match(students, /CreateClassPanel/)
  assert.match(students, /AddToClassPanel/)
  assert.match(students, /WithdrawPanel/)
  const panels = read('components/classes/StudentBulkPanels.tsx')
  assert.match(panels, /type="date"/)
  assert.match(panels, /사유 \(선택\)/)
})

const body = (sql: string) => sql.split(/\r?\n/).filter((l) => !l.startsWith('--')).join(' ').replace(/\s+/g, ' ').trim()
const oneLine = (sql: string) => sql.split(/\r?\n/).find((l) => l.startsWith('-- begin;'))?.slice(3).trim()

await test('migration SQL: 한 줄 SQL 이 본문과 같다, 연쇄 삭제 없음, RESTRICT·부분 고유·RLS·security invoker', () => {
  const sql = read('class-management-migration.sql')
  assert.equal(oneLine(sql), body(sql))
  assert.doesNotMatch(body(sql), /on delete cascade|on delete set null/i)
  assert.equal((body(sql).match(/references /g) ?? []).length, 6)
  assert.equal((body(sql).match(/on delete restrict/g) ?? []).length, 6)
  assert.match(sql, /create unique index if not exists class_students_one_open on class_students \(class_id, student_id\) where left_on is null;/)
  assert.match(sql, /check \(left_on is null or left_on >= joined_on\)/)
  assert.match(sql, /check \(status in \('active', 'paused', 'withdrawn'\)\)/)
  assert.match(sql, /security invoker/)
  assert.doesNotMatch(sql, /security definer/)
  for (const t of NEW_TABLES) assert.match(sql, new RegExp(`alter table ${t} enable row level security`))
  assert.match(sql, /exists \(select 1 from students s where s\.id = student_id and s\.user_id = auth\.uid\(\)\)/)
  assert.doesNotMatch(body(sql), /create policy "classes_delete|for delete/)
  assert.match(sql, /select a\.atttypid::regtype as id_type/)
  // 기존 표는 students 만 바꾼다
  assert.deepEqual([...new Set(body(sql).match(/alter table \w+/g))].sort(), ['alter table class_schedules', 'alter table class_students', 'alter table classes', 'alter table students'])
})

await test('rollback SQL: 한 줄 SQL 이 본문과 같다, 새 것만 지운다', () => {
  const sql = read('class-management-rollback.sql')
  assert.equal(oneLine(sql), body(sql))
  assert.deepEqual(body(sql).match(/drop table if exists \w+/g), ['drop table if exists class_students', 'drop table if exists class_schedules', 'drop table if exists classes'])
  assert.deepEqual(body(sql).match(/drop column if exists \w+/g), ['drop column if exists withdraw_note', 'drop column if exists withdrawn_on', 'drop column if exists status'])
  assert.doesNotMatch(body(sql), /truncate|delete from|drop table if exists students/i)
})

console.log(`\n${passed}개 통과`)
