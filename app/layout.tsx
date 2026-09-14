import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 영어 시험문제 출제 프로그램",
  description: "지문을 입력하면 AI가 다양한 스타일의 영어 시험문제를 출제해줍니다.",
};

type MenuItem = {
  label: string;
  href: string;
  comingSoon?: boolean;
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

// 학원관리 / 학생관리 / 학업관리 3개 엔진으로 그룹화
// ⚠️ href(주소)는 기존과 완전히 동일하게 유지, label과 배치만 변경
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
];

// 레거시(예전) 기능 - 삭제하지 않고 학업관리 하단, 구분선 아래로 분리
const legacyMenuItems: MenuItem[] = [
  { label: "이전 문제 생성기", href: "/" },
  { label: "시험지 기록", href: "/history" },
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
              {menuGroups.map((group) => (
                <div key={group.title} className="mb-3">
                  <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {group.title}
                  </p>
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-4 py-2 text-sm hover:bg-gray-50 ${
                        item.comingSoon
                          ? "text-gray-400 hover:text-gray-500"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {item.label}
                      {item.comingSoon && (
                        <span className="ml-1 text-xs text-gray-300">(준비중)</span>
                      )}
                    </Link>
                  ))}
                </div>
              ))}

              <div className="mx-4 my-2 border-t border-gray-200" />

              <div>
                {legacyMenuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
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