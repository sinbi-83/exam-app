'use client'

// 앱 전체 하단 한 줄 카피라이트 (로그인 화면 포함). 문구는 config/copyright.ts.
// 넣지 않는 곳: 외부지문 저장소(출판사·교과서 지문이라 우리 소유처럼 보이면 안 됨), 출석·숙제·채점·원비 같은 내부 관리 화면.
// 인쇄할 때는 나오지 않는다 (인쇄물은 각 인쇄 화면이 쪽 아래에 따로 넣는다).

import { usePathname } from 'next/navigation'
import { copyrightLine } from '@/config/copyright'

export const APP_FOOTER_EXCLUDED_PREFIXES = ['/materials/passages/external', '/attendance', '/homework', '/grading', '/tuition']

export default function AppFooter() {
  const pathname = usePathname() ?? ''
  if (APP_FOOTER_EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null
  return (
    <footer className="no-print px-5 pb-4 pt-2 text-center text-xs text-gray-400 print:hidden md:px-8">
      {copyrightLine()}
    </footer>
  )
}
