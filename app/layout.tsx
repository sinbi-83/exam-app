import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 영어 시험문제 출제 프로그램",
  description: "지문을 입력하면 AI가 다양한 스타일의 영어 시험문제를 출제해줍니다.",
};

const menuItems = [
  { label: "대시보드", href: "/" },
  { label: "학생관리", href: "/students" },
  { label: "지문관리", href: "/passages" },
  { label: "문제은행", href: "/questions" },
  { label: "시험출제", href: "/exams" },
  { label: "시험지 기록", href: "/history" },
  { label: "채점관리", href: "/grading" },
  { label: "성적분석", href: "/analytics" },
  { label: "API 사용량", href: "/api-usage" },
  { label: "설정", href: "/settings" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 border-r border-gray-200 bg-white">
            <div className="px-4 py-4 border-b border-gray-200">
              <span className="font-semibold text-gray-800">보스턴S영어학원</span>
            </div>
            <nav className="py-2">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>

          <div className="flex-1 flex flex-col">
            <header className="border-b border-gray-200 bg-white">
              <div className="px-6 py-3 flex items-center justify-end">
                <form action="/logout" method="POST">
                  <button
                    type="submit"
                    className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    로그아웃
                  </button>
                </form>
              </div>
            </header>
            <main className="flex-1 px-6 py-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}