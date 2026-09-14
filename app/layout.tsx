import type { Metadata } from "next";
import Link from "next/link";
import MobileNav from "./components/MobileNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "보스턴S영어",
  description: "보스턴S영어 학원 관리 시스템",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "보스턴S영어" },
  other: { "mobile-web-app-capable": "yes" },
};

type MenuItem = { label: string; href: string; icon: string };
type MenuGroup = { title: string; items: MenuItem[] };

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
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#0f1117" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="min-h-screen" style={{ background: 'var(--content-bg)' }}>
        <div className="flex min-h-screen">

          {/* 데스크탑 사이드바 */}
          <aside className="hidden md:flex w-60 shrink-0 flex-col fixed inset-y-0 left-0 z-30"
            style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>

            {/* 로고 */}
            <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
              <div className="w-8 h-8 rounded-xl bg-blue-800 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-blue-800/30">
                B
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">보스턴S영어</p>
                <p className="text-[11px]" style={{ color: 'var(--sidebar-text)' }}>학원 관리 시스템</p>
              </div>
            </div>

            {/* 네비게이션 */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {menuGroups.map((group) => (
                <div key={group.title}>
                  <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--sidebar-text)' }}>
                    {group.title}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <Link key={item.href} href={item.href}
                        className="nav-item flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group"
                        style={{ color: 'var(--sidebar-text)' }}
                        data-href={item.href}
                      >
                        <span className="text-sm w-4 text-center opacity-70 group-hover:opacity-100 transition-opacity">
                          {item.icon}
                        </span>
                        <span className="group-hover:text-white transition-colors">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              <div className="border-t pt-3" style={{ borderColor: 'var(--sidebar-border)' }}>
                <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--sidebar-text)' }}>
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

            {/* 하단 프로필 영역 */}
            <div className="px-4 py-4" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
              <form action="/logout" method="POST">
                <button type="submit"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all hover:bg-white/5"
                  style={{ color: 'var(--sidebar-text)' }}>
                  <span className="text-sm">🚪</span>
                  <span>로그아웃</span>
                </button>
              </form>
            </div>
          </aside>

          {/* 메인 콘텐츠 (사이드바 너비만큼 왼쪽 여백) */}
          <div className="flex-1 flex flex-col min-w-0 md:ml-60">
            {/* 헤더 */}
            <header className="sticky top-0 z-20 border-b"
              style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderColor: '#e8ecf3' }}>
              <div className="px-5 py-3 flex items-center justify-between">
                {/* 모바일: 햄버거 */}
                <div className="flex items-center gap-3 md:hidden">
                  <MobileNav />
                  <span className="font-semibold text-gray-800 text-sm">보스턴S영어</span>
                </div>
                {/* 데스크탑: 빈 공간 */}
                <div className="hidden md:flex items-center gap-2">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                    ✨ 학원 관리 시스템
                  </span>
                </div>
                {/* 우측: 로그아웃 (데스크탑에서는 사이드바에 있어서 숨김) */}
                <div className="flex items-center gap-2">
                  <form action="/logout" method="POST" className="md:hidden">
                    <button type="submit"
                      className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                      로그아웃
                    </button>
                  </form>
                </div>
              </div>
            </header>

            {/* 페이지 콘텐츠 */}
            <main className="flex-1 px-5 py-6 md:px-8 md:py-8">
              {children}
            </main>
          </div>
        </div>

        {/* 사이드바 active 상태 처리 (CSS만으로) */}
        <style>{`
          .nav-item:hover { background: rgba(255,255,255,0.06); }
        `}</style>
      </body>
    </html>
  );
}
