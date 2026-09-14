'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type MenuItem = { label: string; href: string; comingSoon?: boolean }
type MenuGroup = { title: string; items: MenuItem[] }

const menuGroups: MenuGroup[] = [
  {
    title: "학원관리",
    items: [
      { label: "설정", href: "/settings" },
      { label: "API 사용량", href: "/api-usage" },
      { label: "수업 일정", href: "/schedule" },
      { label: "원비 관리", href: "/tuition" },
    ],
  },
  {
    title: "학생관리",
    items: [
      { label: "학생관리", href: "/students" },
      { label: "보고서 작성", href: "/report" },
      { label: "보고서 목록", href: "/reports" },
      { label: "채점관리", href: "/grading" },
      { label: "성적분석", href: "/analytics" },
      { label: "출석관리", href: "/attendance" },
      { label: "오답 분석", href: "/wrong-answers" },
    ],
  },
  {
    title: "학업관리",
    items: [
      { label: "AI 지문 생성", href: "/ai-passage" },
      { label: "문제은행", href: "/questions" },
      { label: "문항 검색", href: "/question-search" },
      { label: "지문관리", href: "/passages" },
      { label: "시험출제", href: "/exams" },
      { label: "단어 테스트", href: "/vocab-test" },
    ],
  },
  {
    title: "알림",
    items: [
      { label: "학부모 알림", href: "/notifications" },
    ],
  },
]

const legacyItems: MenuItem[] = [
  { label: "이전 문제 생성기", href: "/" },
  { label: "시험지 기록", href: "/history" },
]

export default function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // 페이지 이동 시 메뉴 닫기
  useEffect(() => { setOpen(false) }, [pathname])

  // 메뉴 열릴 때 스크롤 막기
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* 햄버거 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
        aria-label="메뉴 열기"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 드로어 */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
          <span className="font-semibold text-gray-800">보스턴S영어</span>
          <button onClick={() => setOpen(false)} className="p-1 rounded text-gray-500 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="overflow-y-auto h-full pb-20 py-2">
          {menuGroups.map((group) => (
            <div key={group.title} className="mb-3">
              <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {group.title}
              </p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-2.5 text-sm ${
                    pathname === item.href
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="mx-4 my-2 border-t border-gray-200" />
          {legacyItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
}
