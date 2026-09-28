'use client'

// 인쇄 화면 상단의 출력 방식 선택 (학생용 / 교사용 / 답안지만). 화면에서만 보이고 인쇄되지 않는다.

import { PRINT_VIEW_HINTS, PRINT_VIEW_LABELS, PRINT_VIEWS, type PrintView } from '@/lib/printView'

export default function PrintViewToggle({ view, onChange }: { view: PrintView; onChange: (v: PrintView) => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex overflow-hidden rounded border border-gray-300 text-sm">
        {PRINT_VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`px-4 py-2 ${view === v ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {PRINT_VIEW_LABELS[v]}
          </button>
        ))}
      </div>
      <p className={`text-xs ${view === 'student' ? 'text-gray-500' : 'font-medium text-amber-700'}`}>
        {view === 'student' ? PRINT_VIEW_HINTS[view] : `⚠️ ${PRINT_VIEW_HINTS[view]} — 학생에게 나눠주지 마세요`}
      </p>
    </div>
  )
}
