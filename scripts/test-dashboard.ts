// 대시보드 1단계 + 1차 조정 점검 (DB·서버 접속 없음).
//   1) 로그인 뒤 이동 주소 검사 (safeNextPath): 앱 안 주소만, "//", "/\", 외부 주소, 빈 값 → /dashboard
//   2) 한국 날짜·내일·이번 달 계산 (서버가 UTC 여도 한국 날짜)
//   3) 학생 수 세기 / 원비 미납 = 전체 학생 − 완납 학생 (원비 화면과 같은 규칙)
//   4) 상단 지표 3칸, 처리할 일(색·순서·필터 주소), 오늘 시간표 정렬, 빈 상태 문구
//   6) 숙제 보기 필터(한국 날짜)와 숙제·원비 화면의 ?view=
//   5) 메뉴에 대시보드가 있고, 로그인·미들웨어가 safeNextPath / next 를 쓰는지
// 실행: npm run test-dashboard

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_AFTER_LOGIN, safeNextPath } from '../lib/safeRedirect.ts'
import {
  addDays,
  buildSummaryTiles,
  buildTaskItems,
  distinctCount,
  formatTime,
  kstDateString,
  monthOf,
  sortTodayEvents,
  unpaidStudentCount,
} from '../lib/dashboard.ts'
import { inHomeworkView, isOverdueOn, parseHomeworkView } from '../lib/homeworkView.ts'
import { isColumnMissing, isReportSentVia, isReportStatus, reportStatusPatch } from '../lib/reportStatus.ts'
import { NAV_GROUPS } from '../config/navigation.ts'

const ROOT = process.cwd()

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

test('safeNextPath: 앱 안 주소는 그대로', () => {
  assert.equal(safeNextPath('/tuition'), '/tuition')
  assert.equal(safeNextPath('/materials/level-tests/e3/A/print?mode=key'), '/materials/level-tests/e3/A/print?mode=key')
  assert.equal(safeNextPath('/tests/abc#top'), '/tests/abc#top')
  assert.equal(safeNextPath('/'), '/')
})

test('safeNextPath: 빈 값 → /dashboard', () => {
  assert.equal(DEFAULT_AFTER_LOGIN, '/dashboard')
  assert.equal(safeNextPath(null), '/dashboard')
  assert.equal(safeNextPath(undefined), '/dashboard')
  assert.equal(safeNextPath(''), '/dashboard')
})

test('safeNextPath: "//" 로 시작 → /dashboard', () => {
  assert.equal(safeNextPath('//evil.com'), '/dashboard')
  assert.equal(safeNextPath('//evil.com/tuition'), '/dashboard')
  assert.equal(safeNextPath('///evil.com'), '/dashboard')
})

test('safeNextPath: "/\\" 로 시작 → /dashboard', () => {
  assert.equal(safeNextPath('/\\evil.com'), '/dashboard')
  assert.equal(safeNextPath('/\\/evil.com'), '/dashboard')
})

test('safeNextPath: 외부 주소 → /dashboard', () => {
  assert.equal(safeNextPath('https://evil.com'), '/dashboard')
  assert.equal(safeNextPath('http://evil.com/dashboard'), '/dashboard')
  assert.equal(safeNextPath('javascript:alert(1)'), '/dashboard')
  assert.equal(safeNextPath('evil.com'), '/dashboard')
  assert.equal(safeNextPath(' /tuition'), '/dashboard')
})

test('safeNextPath: 탭·줄바꿈 끼운 주소, 로그인 화면 → /dashboard', () => {
  assert.equal(safeNextPath('/\t/evil.com'), '/dashboard')
  assert.equal(safeNextPath('/\n/evil.com'), '/dashboard')
  assert.equal(safeNextPath('/login'), '/dashboard')
  assert.equal(safeNextPath('/login?next=/tuition'), '/dashboard')
})

test('한국 날짜: UTC 로 전날 밤이어도 한국 날짜', () => {
  // 2026-10-27 08:30 KST = 2026-10-26 23:30 UTC
  assert.equal(kstDateString(new Date('2026-10-26T23:30:00Z')), '2026-10-27')
  // 2026-10-27 23:59 KST = 2026-10-27 14:59 UTC
  assert.equal(kstDateString(new Date('2026-10-27T14:59:00Z')), '2026-10-27')
  assert.equal(kstDateString(new Date('2026-10-27T15:00:00Z')), '2026-10-28')
})

test('내일·이번 달: 달·해 넘김', () => {
  assert.equal(addDays('2026-10-27', 1), '2026-10-28')
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(monthOf('2026-10-27'), '2026-10')
})

test('학생 수: 같은 학생 여러 숙제는 1명, 빈 id 제외', () => {
  assert.equal(distinctCount(['a', 'b', 'a', null, undefined, 'c', 'b']), 3)
  assert.equal(distinctCount([]), 0)
})

test('원비 미납 = 전체 학생 − 완납 학생 (기록 없음·부분납부도 미납)', () => {
  assert.equal(unpaidStudentCount(10, ['a', 'b', 'c']), 7)
  assert.equal(unpaidStudentCount(10, ['a', 'a']), 9)
  assert.equal(unpaidStudentCount(0, []), 0)
  assert.equal(unpaidStudentCount(2, ['a', 'b', 'c']), 0)
})

const ZERO = { todayClasses: 0, homeworkDueStudents: 0, homeworkOverdueStudents: 0, homeworkPendingStudents: 0, tuitionUnpaidStudents: 0, reportsDraft: null, reportsToSend: null, levelTestsUnreviewed: null }

test('상단 지표 3칸: 오늘 수업 / 숙제 미완료 / 원비 미납, 레벨테스트 7일 건수 없음', () => {
  const tiles = buildSummaryTiles(ZERO)
  assert.deepEqual(tiles.map((t) => t.key), ['classes', 'homework', 'tuition'])
  assert.equal(tiles[1].href, '/homework?view=pending')
  assert.equal(tiles[2].href, '/tuition?view=unpaid')
  const src = readFileSync(resolve(ROOT, 'lib/dashboardData.ts'), 'utf-8')
  assert.doesNotMatch(src, /taken_at|weekAgo/)  // 최근 7일 건수는 뺐다 (확인 전 건수로 바뀜)
})

test('처리할 일: 있는 것만 급한 순서, 색은 마감 지남 빨강·임박 중립·원비 회색', () => {
  assert.deepEqual(buildTaskItems(ZERO), [])
  const items = buildTaskItems({ ...ZERO, homeworkDueStudents: 2, homeworkOverdueStudents: 3, tuitionUnpaidStudents: 5 })
  assert.deepEqual(items.map((i) => [i.key, i.tone]), [
    ['homework_overdue', 'danger'],
    ['homework_due', 'neutral'],
    ['tuition_unpaid', 'muted'],
  ])
  assert.deepEqual(items.map((i) => i.href), ['/homework?view=overdue', '/homework?view=due', '/tuition?view=unpaid'])
  assert.equal(items[2].note, '등록한 학생 전체 기준')
})

test('처리할 일: 읽기 실패 항목은 0이어도 안내로 남긴다', () => {
  const items = buildTaskItems({ ...ZERO, homeworkDueStudents: 1 }, { tuitionUnpaidStudents: '불러오지 못했어요' })
  assert.deepEqual(items.map((i) => i.key), ['homework_due', 'tuition_unpaid'])
})

test('처리할 일: 보고서·레벨테스트 — SQL 실행 전(null)은 숨김, 뒤에는 있는 것만', () => {
  assert.deepEqual(buildTaskItems({ ...ZERO, reportsDraft: null, reportsToSend: null, levelTestsUnreviewed: null }), [])
  assert.deepEqual(buildTaskItems({ ...ZERO, reportsDraft: 0, reportsToSend: 0, levelTestsUnreviewed: 0 }), [])
  const items = buildTaskItems({ ...ZERO, homeworkOverdueStudents: 1, tuitionUnpaidStudents: 2, reportsDraft: 3, reportsToSend: 4, levelTestsUnreviewed: 5 })
  assert.deepEqual(items.map((i) => i.key), ['homework_overdue', 'level_tests_unreviewed', 'reports_to_send', 'reports_draft', 'tuition_unpaid'])
  assert.deepEqual(items.slice(1, 4).map((i) => i.href), ['/materials/level-tests#unreviewed', '/reports?view=checked', '/reports?view=draft'])
})

test('보고서 상태: 값 검사, 되돌리면 뒤 단계 날짜를 지움, 보냄은 방법 저장', () => {
  assert.ok(isReportStatus('draft') && isReportStatus('checked') && isReportStatus('sent'))
  assert.ok(!isReportStatus('done') && !isReportStatus(undefined))
  assert.ok(isReportSentVia('print') && isReportSentVia('parent_link') && isReportSentVia('message'))
  assert.ok(!isReportSentVia('email'))
  const now = '2026-10-28T10:00:00.000Z'
  assert.deepEqual(reportStatusPatch('draft', null, now), { status: 'draft', checked_at: null, sent_at: null, sent_via: null })
  assert.deepEqual(reportStatusPatch('checked', null, now), { status: 'checked', checked_at: now, sent_at: null, sent_via: null })
  assert.deepEqual(reportStatusPatch('sent', 'message', now), { status: 'sent', sent_at: now, sent_via: 'message' })
})

test('새 칸 없음 오류 알아보기 (SQL 실행 전)', () => {
  assert.ok(isColumnMissing({ code: '42703', message: 'column reports.status does not exist' }))
  assert.ok(isColumnMissing({ code: 'PGRST204', message: "Could not find the 'status' column of 'reports'" }))
  assert.ok(!isColumnMissing({ code: '23505', message: 'duplicate key' }))
  assert.ok(!isColumnMissing(null))
})

test('migration SQL: 칸만 더하고 지우지 않음, 한 줄 SQL 포함', () => {
  const sql = readFileSync(resolve(ROOT, 'report-status-level-test-review-migration.sql'), 'utf-8')
  assert.doesNotMatch(sql, /drop|delete|truncate/i)
  assert.match(sql, /^-- alter table reports add column if not exists status .*reviewed_at.*;$/m)
  assert.match(sql, /sent_via in \('print', 'parent_link', 'message'\)/)
})

test('오늘 시간표: 시작 시각 순, 시각 없는 일정은 뒤, 표시는 HH:MM', () => {
  const sorted = sortTodayEvents([
    { id: '1', title: '중2', start_time: '18:00:00', end_time: null, event_type: 'class' },
    { id: '2', title: '보강', start_time: null, end_time: null, event_type: 'other' },
    { id: '3', title: '초5', start_time: '15:30:00', end_time: '16:30:00', event_type: 'class' },
  ])
  assert.deepEqual(sorted.map((e) => e.id), ['3', '1', '2'])
  assert.equal(formatTime('15:30:00'), '15:30')
  assert.equal(formatTime(null), '')
})

test('대시보드 화면 문구: 빈 상태 문구 2개, 폭 1,400px', () => {
  const page = readFileSync(resolve(ROOT, 'app/dashboard/page.tsx'), 'utf-8')
  assert.match(page, /오늘 등록된 수업 일정 없음/)
  assert.match(page, /현재 처리 대기 중인 업무가 없습니다/)
  assert.match(page, /max-w-\[1400px\]/)
})

test('숙제 보기 필터: 한국 날짜 기준 마감 지남·임박·둘 다', () => {
  const today = '2026-10-28'
  const tomorrow = '2026-10-29'
  const hw = [
    { id: 'a', status: 'assigned' as const, due_date: '2026-10-27' }, // 마감 지남
    { id: 'b', status: 'assigned' as const, due_date: '2026-10-28' }, // 오늘 마감
    { id: 'c', status: 'assigned' as const, due_date: '2026-10-29' }, // 내일 마감
    { id: 'd', status: 'assigned' as const, due_date: '2026-10-30' }, // 모레
    { id: 'e', status: 'done' as const, due_date: '2026-10-20' }, // 완료는 마감 지남 아님
    { id: 'f', status: 'assigned' as const, due_date: null },
  ]
  const ids = (v: Parameters<typeof inHomeworkView>[1]) => hw.filter((h) => inHomeworkView(h, v, today, tomorrow)).map((h) => h.id)
  assert.deepEqual(ids('overdue'), ['a'])
  assert.deepEqual(ids('due'), ['b', 'c'])
  assert.deepEqual(ids('pending'), ['a', 'b', 'c'])
  assert.deepEqual(ids('assigned'), ['a', 'b', 'c', 'd', 'f'])
  assert.deepEqual(ids('done'), ['e'])
  assert.equal(ids('all').length, 6)
  assert.equal(isOverdueOn(hw[0], today), true)
})

test('숙제 보기 주소: 모르는 값은 전체', () => {
  assert.equal(parseHomeworkView('overdue'), 'overdue')
  assert.equal(parseHomeworkView('pending'), 'pending')
  assert.equal(parseHomeworkView('evil'), 'all')
  assert.equal(parseHomeworkView(null), 'all')
})

test('숙제·원비 화면이 ?view= 를 읽고, 숙제는 UTC 날짜를 쓰지 않는다', () => {
  const hwPage = readFileSync(resolve(ROOT, 'app/homework/page.tsx'), 'utf-8')
  assert.match(hwPage, /parseHomeworkView\(/)
  assert.match(hwPage, /kstDateString\(/)
  assert.doesNotMatch(hwPage, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/)
  const tuitionPage = readFileSync(resolve(ROOT, 'app/tuition/page.tsx'), 'utf-8')
  assert.match(tuitionPage, /get\('view'\) === 'unpaid'/)
})

test('메뉴 맨 위에 대시보드, 옛 생성기(/)는 그대로', () => {
  assert.equal(NAV_GROUPS[0].href, '/dashboard')
  assert.ok(NAV_GROUPS[0].items.some((i) => i.href === '/dashboard'))
  const nav = readFileSync(resolve(ROOT, 'config/navigation.ts'), 'utf-8')
  assert.match(nav, /href: '\/', icon: '🕐'/)
})

test('로그인 화면은 safeNextPath, 미들웨어는 next 로 원래 주소를 넘긴다', () => {
  const login = readFileSync(resolve(ROOT, 'app/login/page.tsx'), 'utf-8')
  assert.match(login, /safeNextPath\(/)
  assert.doesNotMatch(login, /router\.push\('\/'\)/)
  const mw = readFileSync(resolve(ROOT, 'middleware.ts'), 'utf-8')
  assert.match(mw, /searchParams\.set\('next'/)
})

test('대시보드 화면 문구: "학원" 대신 교습소·보스턴S영어, 금액 표시 없음', () => {
  const files = ['app/dashboard/page.tsx', 'lib/dashboard.ts', 'lib/dashboardData.ts']
  for (const f of files) {
    const src = readFileSync(resolve(ROOT, f), 'utf-8')
    // 주석이 아닌 줄에서만 확인
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    assert.doesNotMatch(code, /학원/, f)
    assert.doesNotMatch(code, /amount|toLocaleString|원비 \d|원'/, f)
  }
  const page = readFileSync(resolve(ROOT, 'app/dashboard/page.tsx'), 'utf-8')
  assert.match(page, /보스턴S영어/)
  assert.match(page, /교습소/)
})

console.log(`\n${passed}개 통과`)
