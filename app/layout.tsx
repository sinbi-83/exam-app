import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 영어 시험문제 출제 프로그램",
  description: "지문을 입력하면 AI가 다양한 스타일의 영어 시험문제를 출제해줍니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <header className="border-b border-gray-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="font-semibold text-gray-800">보스턴S영어학원</span>
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
        <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
      </body>
    </html>
  );
}