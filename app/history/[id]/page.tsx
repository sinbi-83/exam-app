"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getExamSheetById, ExamSheetRow } from "@/lib/examSheets";
import ResultView from "@/components/ResultView";

export default function HistoryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [sheet, setSheet] = useState<ExamSheetRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getExamSheetById(params.id)
      .then(setSheet)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <p className="text-sm text-gray-500">불러오는 중...</p>;
  }

  if (!sheet) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">문제지를 찾을 수 없어요.</p>
        <Link href="/history" className="text-sm text-indigo-600 underline">
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-bold">{sheet.title}</h1>
        <Link href="/history" className="text-sm text-indigo-600 underline underline-offset-2">
          목록으로
        </Link>
      </div>

      <ResultView result={sheet.questions_data} />
    </main>
  );
}
