'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activeNavGroup, isNavItemActive, NAV_GROUPS, NAV_LEGACY } from '@/config/navigation'

// 메뉴 목록은 config/navigation.ts (데스크탑 메뉴와 같은 목록 → 외부지문 등 빠지는 메뉴가 없다)
export default function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const active = activeNavGroup(pathname)
    const defaults: Record<string, boolean> = {}
    NAV_GROUPS.forEach(g => { defaults[g.title] = g.title === active })
    return defaults
  })

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // 메뉴 열릴 때 현재 활성 그룹 자동 열기
  useEffect(() => {
    if (open) {
      const active = activeNavGroup(pathname)
      if (active) setOpenGroups(prev => ({ ...prev, [active]: true }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggleGroup(title: string) {
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }))
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="메뉴 열기"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--sidebar-bg)' }}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-5 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-800 flex items-center justify-center text-white font-bold text-sm">B</div>
            <span className="font-semibold text-white text-sm">보스턴S영어</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 네비게이션 */}
        <nav className="overflow-y-auto h-full pb-24 px-3 py-3">
          {NAV_GROUPS.map((group) => {
            const isOpen = openGroups[group.title] ?? false
            const hasActive = activeNavGroup(pathname) === group.title

            return (
              <div key={group.title} className="mb-1">
                {/* 큰 메뉴: 누르면 중메뉴가 열린다 */}
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors hover:bg-white/5"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: hasActive ? '#60a5fa' : 'var(--sidebar-text)' }}>
                    {group.title}
                  </span>
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

                {/* 중메뉴 */}
                <div
                  className="overflow-hidden transition-all duration-200"
                  style={{ maxHeight: isOpen ? `${group.items.length * 44}px` : '0px', opacity: isOpen ? 1 : 0 }}
                >
                  <div className="mt-0.5 space-y-0.5 pb-1">
                    {group.items.map((item) => {
                      const active = isNavItemActive(item, pathname)
                      return (
                        <Link key={item.href} href={item.href}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all ${
                            active ? '' : 'hover:bg-white/5'
                          }`}
                          style={active ? { background: 'var(--sidebar-active-bg)', color: '#93c5fd' } : { color: 'var(--sidebar-text)' }}
                        >
                          <span className="text-base w-5 text-center">{item.icon}</span>
                          {item.label}
                          {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}

          {/* 레거시 */}
          <div className="mx-2 my-3 border-t" style={{ borderColor: 'var(--sidebar-border)' }} />
          {NAV_LEGACY.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all hover:bg-white/5" style={{ color: 'var(--sidebar-text)' }}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
}
