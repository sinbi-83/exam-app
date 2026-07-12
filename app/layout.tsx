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
        <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
