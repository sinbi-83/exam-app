// 대시보드 1단계 점검 (DB·서버 접속 없음).
//   1) 로그인 뒤 이동 주소 검사 (safeNextPath): 앱 안 주소만, "//", "/\", 외부 주소, 빈 값 → /dashboard
//   2) 한국 날짜·내일·이번 달 계산 (서버가 UTC 여도 한국 날짜)
//   3) 학생 수 세기 / 원비 미납 = 전체 학생 − 완납 학생 (원비 화면과 같은 규칙)
//   4) 처리할 게 있는 항목만 위로, 0건·참고·오류 항목은 아래 작게
//   5) 메뉴에 대시보드가 있고, 로그인·미들웨어가 safeNextPath / next 를 쓰는지
// 실행: npm run test-dashboard

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_AFTER_LOGIN, safeNextPath } from '../lib/safeRedirect.ts'
import {
  addDays,
  buildDashboardItems,
  distinctCount,
  kstDateString,
  monthOf,
  splitByAttention,
  unpaidStudentCount,
} from '../lib/dashboard.ts'
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

test('항목: 원비에 "등록한 학생 전체 기준", 레벨테스트는 참고·결과 목록으로', () => {
  const items = buildDashboardItems({ todayClasses: 0, homeworkDueStudents: 0, homeworkOverdueStudents: 0, tuitionUnpaidStudents: 0, levelTestsLast7Days: 0 })
  assert.deepEqual(items.map((i) => i.key), ['classes', 'homework_due', 'homework_overdue', 'tuition_unpaid', 'level_tests'])
  const tuition = items.find((i) => i.key === 'tuition_unpaid')!
  assert.equal(tuition.note, '등록한 학생 전체 기준')
  assert.equal(tuition.unit, '명')
  const level = items.find((i) => i.key === 'level_tests')!
  assert.equal(level.urgent, false)
  assert.equal(level.href, '/materials/level-tests')
})

test('위·아래 나누기: 처리할 것만 위, 0건·참고·오류는 아래', () => {
  const items = buildDashboardItems(
    { todayClasses: 2, homeworkDueStudents: 0, homeworkOverdueStudents: 3, tuitionUnpaidStudents: 5, levelTestsLast7Days: 4 },
    { tuitionUnpaidStudents: '불러오지 못했어요' },
  )
  const { attention, quiet } = splitByAttention(items)
  assert.deepEqual(attention.map((i) => i.key), ['classes', 'homework_overdue'])
  assert.deepEqual(quiet.map((i) => i.key), ['homework_due', 'tuition_unpaid', 'level_tests'])
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
