"use client";

import { useState } from "react";
import { ExamGenerationResult } from "@/types/exam";

interface ResultViewProps {
  result: ExamGenerationResult;
}

type TabKey = "student" | "teacher";

export default function ResultView({ result }: ResultViewProps) {
  const [tab, setTab] = useState<TabKey>("student");

  const handlePrint = () => {
    window.print();
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 no-print">
        <h2 className="text-lg font-semibold">4. 결과</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("student")}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              tab === "student"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-gray-50 text-gray-700 border-gray-300"
            }`}
          >
            학생용 문제지
          </button>
          <button
            onClick={() => setTab("teacher")}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              tab === "teacher"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-gray-50 text-gray-700 border-gray-300"
            }`}
          >
            교사용 답안 및 해설
          </button>
        </div>
      </div>

      <div className="print-area">
        {tab === "student" ? (
          <StudentSheet result={result} />
        ) : (
          <TeacherSheet result={result} />
        )}
      </div>

      <div className="mt-4 no-print">
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700"
        >
          인쇄하기
        </button>
      </div>
    </section>
  );
}

function StudentSheet({ result }: { result: ExamGenerationResult }) {
  return (
    <div className="space-y-6 text-sm leading-relaxed">
      <div className="whitespace-pre-wrap border-b pb-4">{result.passage}</div>
      {result.questions.map((q, idx) => (
        <div key={q.id ?? idx}>
          <p className="font-medium">
            {idx + 1}. {q.question}
          </p>
          {!q.isWrittenAnswer && q.choices.length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-2">
              {q.choices.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {q.isWrittenAnswer && (
            <div className="mt-2 border border-dashed border-gray-300 rounded h-16" />
          )}
        </div>
      ))}
    </div>
  );
}

function TeacherSheet({ result }: { result: ExamGenerationResult }) {
  return (
    <div className="space-y-6 text-sm leading-relaxed">
      <div className="whitespace-pre-wrap border-b pb-4">{result.passage}</div>
      {result.questions.map((q, idx) => (
        <div key={q.id ?? idx}>
          <p className="font-medium">
            {idx + 1}. {q.question}
          </p>
          {q.choices.length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-2">
              {q.choices.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-indigo-700 font-semibold">정답: {q.answer}</p>
          <p className="text-gray-600">해설: {q.explanation}</p>
        </div>
      ))}
    </div>
  );
}
