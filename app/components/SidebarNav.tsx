'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activeNavGroup, isNavItemActive, NAV_GROUPS, NAV_LEGACY } from '@/config/navigation'

// 메뉴 목록은 config/navigation.ts (모바일 메뉴와 같은 목록)
export default function SidebarNav() {
  const pathname = usePathname()

  // 초기 open 상태: 활성 그룹은 열고, 나머지는 localStorage에서 복원
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const active = activeNavGroup(pathname)
    const defaults: Record<string, boolean> = {}
    NAV_GROUPS.forEach(g => { defaults[g.title] = g.title === active })
    return defaults
  })

  // localStorage에서 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebar-groups')
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>
        const active = activeNavGroup(pathname)
        // 활성 그룹은 무조건 열기
        setOpenGroups(() => ({ ...parsed, ...(active ? { [active]: true } : {}) }))
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 다른 화면으로 옮기면 그 화면의 그룹을 연다
  useEffect(() => {
    const active = activeNavGroup(pathname)
    if (active) setOpenGroups(prev => (prev[active] ? prev : { ...prev, [active]: true }))
  }, [pathname])

  function setGroup(title: string, open: boolean) {
    setOpenGroups(prev => {
      const next = { ...prev, [title]: open }
      try { localStorage.setItem('sidebar-groups', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <div className="space-y-1">
        {NAV_GROUPS.map((group) => {
          const isOpen = openGroups[group.title] ?? false
          const hasActive = activeNavGroup(pathname) === group.title
          const titleClass = `text-[10px] font-semibold uppercase tracking-widest transition-colors ${hasActive ? 'text-blue-400' : 'group-hover:text-gray-300'}`
          const titleStyle = { color: hasActive ? '#60a5fa' : 'var(--sidebar-text)' }

          return (
            <div key={group.title} className="mb-1">
              {/* 큰 메뉴: 누르면 중메뉴가 열린다. 첫 화면이 있는 큰 메뉴는 그 화면으로도 이동 */}
              <div className="flex items-center rounded-md transition-colors hover:bg-white/5 group">
                {group.href ? (
                  <Link href={group.href} onClick={() => setGroup(group.title, true)} className="flex-1 px-2 py-1.5">
                    <span className={titleClass} style={titleStyle}>{group.title}</span>
                  </Link>
                ) : (
                  <button onClick={() => setGroup(group.title, !isOpen)} className="flex-1 px-2 py-1.5 text-left">
                    <span className={titleClass} style={titleStyle}>{group.title}</span>
                  </button>
                )}
                <button onClick={() => setGroup(group.title, !isOpen)} className="px-2 py-1.5" aria-label={`${group.title} 메뉴 ${isOpen ? '접기' : '펼치기'}`}>
                  <svg
                    className="w-3 h-3 transition-transform duration-200"
                    style={{
                      color: 'var(--sidebar-text)',
                      transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* 중메뉴 */}
              <div
                className="overflow-hidden transition-all duration-200"
                style={{ maxHeight: isOpen ? `${group.items.length * 40}px` : '0px', opacity: isOpen ? 1 : 0 }}
              >
                <div className="mt-0.5 space-y-0.5 pb-1">
                  {group.items.map((item) => {
                    const active = isNavItemActive(item, pathname)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group"
                        style={
                          active
                            ? { background: 'var(--sidebar-active-bg)', color: '#93c5fd' }
                            : { color: 'var(--sidebar-text)' }
                        }
                      >
                        <span className={`text-sm w-4 text-center transition-opacity ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>
                          {item.icon}
                        </span>
                        <span className={`transition-colors ${active ? 'text-blue-300 font-semibold' : 'group-hover:text-white'}`}>
                          {item.label}
                        </span>
                        {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 레거시 */}
      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--sidebar-border)' }}>
        <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--sidebar-text)' }}>
          레거시
        </p>
        {NAV_LEGACY.map((item) => (
          <Link key={item.href} href={item.href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group"
            style={{ color: 'var(--sidebar-text)' }}>
            <span className="text-sm w-4 text-center opacity-60">{item.icon}</span>
            <span className="group-hover:text-white transition-colors">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
