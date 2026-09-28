// 왼쪽 메뉴(데스크탑 SidebarNav)와 모바일 메뉴(MobileNav)가 함께 쓰는 메뉴 목록 (5단계 메뉴 개편, 2026-09-28).
// 예전에는 두 파일에 목록이 따로 있어서 모바일에 외부지문저장소가 빠져 있었다 → 한 곳에서만 관리한다.
//
// 큰 메뉴 3개: 자료(지문 / 문제은행 / 단어은행), 시험 출제(문제 시험 / 단어 시험), 시험 관리(시험지 보관함 / 채점·결과)
// 나머지(학생관리·운영관리·알림)는 이름과 위치만 정리했다 (기능·주소 그대로).
// 옛 주소 → 새 주소 연결은 config/legacyRoutes.json.

export type NavItem = {
  label: string
  href: string
  icon: string
  // 이 메뉴가 "지금 보는 화면"으로 표시될 주소 앞부분 (없으면 href)
  match?: string[]
}
export type NavGroup = {
  title: string
  href?: string // 큰 메뉴 첫 화면 (중메뉴 안내 + [출제] 입구)
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: '자료',
    href: '/materials',
    items: [
      { label: '지문', href: '/materials/passages', icon: '📄' },
      { label: '문제은행', href: '/materials/questions', icon: '🏦' },
      { label: '단어은행', href: '/materials/vocabulary', icon: '📒' },
    ],
  },
  {
    title: '시험 출제',
    href: '/create',
    items: [
      { label: '문제 시험', href: '/create/problem', icon: '📋' },
      { label: '단어 시험', href: '/create/word', icon: '🔤' },
    ],
  },
  {
    title: '시험 관리',
    href: '/tests',
    items: [
      { label: '시험지 보관함', href: '/tests', icon: '🗄️' },
      { label: '채점·결과', href: '/grading', icon: '✏️' },
    ],
  },
  {
    title: '학생관리',
    items: [
      { label: '학생관리', href: '/students', icon: '👥' },
      { label: '보고서 작성', href: '/report', icon: '📝' },
      { label: '보고서 목록', href: '/reports', icon: '🗂️' },
      { label: '성적분석', href: '/analytics', icon: '📈' },
      { label: '출석관리', href: '/attendance', icon: '✅' },
      { label: '숙제관리', href: '/homework', icon: '📚' },
      { label: '오답 분석', href: '/wrong-answers', icon: '🔍' },
    ],
  },
  {
    title: '운영관리',
    items: [
      { label: '설정', href: '/settings', icon: '⚙️' },
      { label: 'API 사용량', href: '/api-usage', icon: '📊' },
      { label: '수업 일정', href: '/schedule', icon: '📅' },
      { label: '원비 관리', href: '/tuition', icon: '💰' },
    ],
  },
  {
    title: '알림',
    items: [{ label: '학부모 알림', href: '/notifications', icon: '🔔' }],
  },
]

export const NAV_LEGACY: NavItem[] = [
  { label: '이전 문제 생성기', href: '/', icon: '🕐' },
  { label: '시험지 기록', href: '/history', icon: '📜' },
]

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/')

// 이 메뉴가 지금 화면인지. /tests 아래(시험 상세·인쇄)는 시험지 보관함으로 본다.
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return (item.match ?? [item.href]).some((p) => under(pathname, p))
}

export function activeNavGroup(pathname: string): string | null {
  for (const g of NAV_GROUPS) {
    if ((g.href && pathname === g.href) || g.items.some((it) => isNavItemActive(it, pathname))) return g.title
  }
  return null
}
