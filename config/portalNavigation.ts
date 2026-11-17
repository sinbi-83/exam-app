import { NAV_GROUPS, NAV_LEGACY, type NavItem } from './navigation.ts'
export type PortalSection = { key: string; label: string; href: string; icon: string; items: NavItem[] }
const group = (title: string) => NAV_GROUPS.find((g) => g.title === title)?.items ?? []
// 기존 메뉴 정의를 재사용해 PC와 모바일의 모든 기능 연결을 유지한다.
export const PORTAL_SECTIONS: PortalSection[] = [
  { key: 'today', label: '오늘', href: '/dashboard', icon: 'calendar', items: group('대시보드') },
  { key: 'materials', label: '수업 자료', href: '/materials', icon: 'book', items: group('자료') },
  { key: 'tests', label: '시험·채점', href: '/create', icon: 'exam', items: [...group('시험 출제'), ...group('시험 관리')] },
  { key: 'students', label: '학생·학습', href: '/students', icon: 'users', items: group('학생관리') },
  { key: 'operations', label: '교습소 운영', href: '/schedule', icon: 'building', items: [...group('운영관리').filter((i) => i.href !== '/settings'), ...group('알림'), ...NAV_LEGACY] },
  { key: 'settings', label: '설정', href: '/settings', icon: 'settings', items: group('운영관리').filter((i) => i.href === '/settings') },
]
const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')
export function portalSectionFor(path: string): PortalSection | undefined {
  let match: PortalSection | undefined
  let length = -1
  for (const section of PORTAL_SECTIONS) for (const href of [section.href, ...section.items.flatMap((item) => item.match ?? [item.href])]) {
    if (under(path, href) && href.length > length) { match = section; length = href.length }
  }
  return match
}
export function isStandalonePage(path: string): boolean {
  return path === '/login' || path.startsWith('/login/') || path.startsWith('/parent/') || path.split('/').includes('print')
}
