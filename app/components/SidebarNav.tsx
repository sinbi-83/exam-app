'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type MenuItem = { label: string; href: string; icon: string }
type MenuGroup = { title: string; items: MenuItem[] }

const menuGroups: MenuGroup[] = [
  {
    title: "학원관리",
    items: [
      { label: "설정", href: "/settings", icon: "⚙️" },
      { label: "API 사용량", href: "/api-usage", icon: "📊" },
      { label: "수업 일정", href: "/schedule", icon: "📅" },
      { label: "원비 관리", href: "/tuition", icon: "💰" },
    ],
  },
  {
    title: "학생관리",
    items: [
      { label: "학생관리", href: "/students", icon: "👥" },
      { label: "보고서 작성", href: "/report", icon: "📝" },
      { label: "보고서 목록", href: "/reports", icon: "🗂️" },
      { label: "채점관리", href: "/grading", icon: "✏️" },
      { label: "성적분석", href: "/analytics", icon: "📈" },
      { label: "출석관리", href: "/attendance", icon: "✅" },
      { label: "오답 분석", href: "/wrong-answers", icon: "🔍" },
    ],
  },
  {
    title: "학업관리",
    items: [
      { label: "AI 지문 생성", href: "/ai-passage", icon: "🤖" },
      { label: "문제은행", href: "/questions", icon: "🏦" },
      { label: "문항 검색", href: "/question-search", icon: "🔎" },
      { label: "지문관리", href: "/passages", icon: "📄" },
      { label: "시험출제", href: "/exams", icon: "📋" },
      { label: "단어 테스트", href: "/vocab-test", icon: "🔤" },
    ],
  },
  {
    title: "알림",
    items: [
      { label: "학부모 알림", href: "/notifications", icon: "🔔" },
    ],
  },
]

export default function SidebarNav() {
  const pathname = usePathname()

  // 현재 경로가 속한 그룹 찾기
  function getActiveGroup(): string | null {
    for (const g of menuGroups) {
      if (g.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))) {
        return g.title
      }
    }
    return null
  }

  // 초기 open 상태: 활성 그룹은 열고, 나머지는 localStorage에서 복원
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const active = getActiveGroup()
    const defaults: Record<string, boolean> = {}
    menuGroups.forEach(g => { defaults[g.title] = g.title === active })
    return defaults
  })

  // localStorage에서 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebar-groups')
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>
        const active = getActiveGroup()
        // 활성 그룹은 무조건 열기
        setOpenGroups(prev => ({ ...parsed, ...(active ? { [active]: true } : {}) }))
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleGroup(title: string) {
    setOpenGroups(prev => {
      const next = { ...prev, [title]: !prev[title] }
      try { localStorage.setItem('sidebar-groups', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <div className="space-y-1">
        {menuGroups.map((group) => {
          const isOpen = openGroups[group.title] ?? false
          const hasActive = group.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))

          return (
            <div key={group.title} className="mb-1">
              {/* 그룹 헤더 (클릭하면 토글) */}
              <button
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors hover:bg-white/5 group"
              >
                <span className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                  hasActive ? 'text-blue-400' : 'group-hover:text-gray-300'
                }`} style={{ color: hasActive ? '#60a5fa' : 'var(--sidebar-text)' }}>
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

              {/* 메뉴 아이템들 */}
              <div
                className="overflow-hidden transition-all duration-200"
                style={{ maxHeight: isOpen ? `${group.items.length * 40}px` : '0px', opacity: isOpen ? 1 : 0 }}
              >
                <div className="mt-0.5 space-y-0.5 pb-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + '/')
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
        {[
          { label: "이전 문제 생성기", href: "/", icon: "🕐" },
          { label: "시험지 기록", href: "/history", icon: "📜" },
        ].map((item) => (
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
