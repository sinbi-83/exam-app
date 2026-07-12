"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listExamSheets, ExamSheetRow } from "@/lib/examSheets";

export default function HistoryPage() {
  const [sheets, setSheets] = useState<ExamSheetRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listExamSheets()
      .then(setSheets)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">지난 문제지</h1>
        <Link href="/" className="text-sm text-indigo-600 underline underline-offset-2">
          새 문제 만들기
        </Link>
      </div>

      {loading && <p className="text-sm text-gray-500">불러오는 중...</p>}

      {!loading && sheets.length === 0 && (
        <p className="text-sm text-gray-500">아직 생성된 문제지가 없어요.</p>
      )}

      <div className="space-y-2">
        {sheets.map((sheet) => (
          <Link
            key={sheet.id}
            href={`/history/${sheet.id}`}
            className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition"
          >
            <p className="font-medium">{sheet.title}</p>
            <p className="text-sm text-gray-500 mt-1">
              {new Date(sheet.created_at).toLocaleString("ko-KR")} ·{" "}
              {sheet.style_preset ?? "커스텀"} · {sheet.grade_level} ·{" "}
              {sheet.questions_data?.questions?.length ?? 0}문항
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
