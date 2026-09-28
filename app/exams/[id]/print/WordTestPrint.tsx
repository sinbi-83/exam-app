'use client'

// 단어은행 자동 단어시험 전용 인쇄 레이아웃. 저장된 snapshot(exam_questions.question_data)만으로 그린다.
// 기존 시험지는 이 컴포넌트를 쓰지 않는다 (문항이 전부 type 'word' 일 때만 print/page.tsx 에서 선택).

import { useState } from 'react'
import { POS_LABELS_KO, studySheetRows, studySheetTitle, type StudySheetRow } from '@/lib/wordTest'
import { includesAnswers, includesQuestions, printFileName, type PrintView } from '@/lib/printView'
import PrintViewToggle from './PrintViewToggle'
import { copyrightNotice } from '@/config/copyright'
import { PRINT_PAGE_MIN_HEIGHT, printPageCss } from '@/lib/printCopyright'

interface WordQuestion {
  id: string
  points: number
  question_data: {
    type: string
    direction?: 'en_ko' | 'ko_en'
    question: string
    answer?: string
    accepted_answers?: string[]
    expression?: string
    meaning_ko?: string
    pos?: string | null
  }
}

export type WordSheet = 'test' | 'study'

const SECTIONS = [
  { direction: 'en_ko', title: '영어 → 우리말', guide: '다음 영어 단어의 뜻을 우리말로 쓰시오.' },
  { direction: 'ko_en', title: '우리말 → 영어', guide: '다음 우리말에 알맞은 영어 단어를 쓰시오.' },
] as const

export default function WordTestPrint({
  title,
  date,
  questions,
  initialSheet = 'test',
  view,
  onViewChange,
  onPdf,
}: {
  title: string
  date: string
  questions: WordQuestion[]
  initialSheet?: WordSheet
  view: PrintView // 시험지의 출력 방식 (학생용 / 교사용 / 답안지만). 학습지에는 적용하지 않는다
  onViewChange: (v: PrintView) => void
  onPdf: (filename: string) => void
}) {
  const [sheet, setSheet] = useState<WordSheet>(initialSheet)
  const totalPoints = questions.reduce((s, q) => s + q.points, 0)
  const numbered = questions.map((q, i) => ({ q, num: i + 1 }))
  const sections = SECTIONS.map((s) => ({
    ...s,
    rows: numbered.filter(({ q }) => (q.question_data.direction ?? 'en_ko') === s.direction),
  })).filter((s) => s.rows.length > 0)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
        * { font-family: 'Noto Sans KR', sans-serif; box-sizing: border-box; }
        ${printPageCss(copyrightNotice('exam'))}
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .page { box-shadow: none !important; }
          .word-row { break-inside: avoid; page-break-inside: avoid; }
          .answer-page { break-before: page; page-break-before: always; }
        }
      `}</style>

      <div className="no-print mb-4 flex flex-wrap items-start justify-center gap-3 pt-6">
        <div className="flex overflow-hidden rounded border border-gray-300 text-sm">
          {([['test', '📝 시험지'], ['study', '📘 학습지']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSheet(k)}
              className={`px-4 py-2 ${sheet === k ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => window.print()} className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
          🖨️ 인쇄
        </button>
        {sheet === 'test' && <PrintViewToggle view={view} onChange={onViewChange} />}
        <button onClick={() => onPdf(sheet === 'study' ? studySheetTitle(title) : printFileName(title, view))} className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700">
          📄 PDF 저장
        </button>
      </div>

      {sheet === 'study' ? (
        <StudySheet title={studySheetTitle(title)} date={date} rows={studySheetRows(questions)} />
      ) : (
      <div className="print-area">
        {includesQuestions(view) && (
        <div className="page mx-auto bg-white shadow-lg" style={{ width: '210mm', minHeight: PRINT_PAGE_MIN_HEIGHT, padding: '14mm 16mm 12mm' }}>
          {/* 헤더 */}
          <div className="mb-5 border-b-2 border-gray-800 pb-3">
            <p className="text-xs text-gray-500">보스턴S영어</p>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-4 text-sm">
              <div className="border-b border-gray-400 pb-1">
                <span className="mr-2 text-xs text-gray-400">이름:</span>
              </div>
              <div className="border-b border-gray-400 pb-1">
                <span className="mr-2 text-xs text-gray-400">날짜:</span>
                {date}
              </div>
              <div className="text-sm text-gray-700">
                점수: <span className="inline-block w-12 border-b border-gray-400" /> / {totalPoints}점
              </div>
            </div>
            <p className="mt-2 text-right text-xs text-gray-500">총 {questions.length}문항 · 문항당 {questions[0]?.points ?? 0}점</p>
          </div>

          {/* 문항: 방향별 구역, 번호는 시험 전체에서 이어진다 */}
          <div className="space-y-5">
            {sections.map((s, si) => (
              <div key={s.direction}>
                <p className="mb-2 text-sm font-bold text-gray-800">
                  {['Ⅰ', 'Ⅱ'][si]}. {s.title}
                  <span className="ml-2 text-xs font-normal text-gray-500">{s.guide}</span>
                </p>
                <div className="grid grid-cols-2 gap-x-8">
                  {s.rows.map(({ q, num }) => (
                    <div key={q.id} className="word-row flex items-end gap-2 py-2 text-sm">
                      <span className="w-6 shrink-0 text-right font-semibold text-gray-700">{num}.</span>
                      <span className="w-32 shrink-0 text-gray-900">{q.question_data.question}</span>
                      <span className="flex-1 border-b border-gray-400" style={{ minHeight: '1.4em' }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-gray-200 pt-3 text-center text-[10px] text-gray-400">
            보스턴S영어 | 담당교사: 서향미 선생님
          </div>
        </div>
        )}

        {/* 정답: 교사용(문제 뒤 새 장) / 답안지만. 학생용에서는 그리지 않는다 */}
        {includesAnswers(view) && (
          <div className={`${includesQuestions(view) ? 'answer-page mt-6' : ''} page mx-auto bg-white shadow-lg`} style={{ width: '210mm', minHeight: PRINT_PAGE_MIN_HEIGHT, padding: '14mm 16mm 12mm' }}>
            <h2 className="mb-4 border-b-2 border-gray-800 pb-2 text-lg font-bold text-gray-900">{title} — 정답 (선생님용)</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              {numbered.map(({ q, num }) => (
                <div key={q.id} className="flex gap-2">
                  <span className="w-6 shrink-0 text-right font-semibold text-gray-700">{num}.</span>
                  <span className="text-gray-500">{q.question_data.question} →</span>
                  <span className="text-gray-900">
                    {(q.question_data.accepted_answers?.length ? q.question_data.accepted_answers : [q.question_data.answer ?? '-']).join(' / ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
    </>
  )
}

// 학습지: 시험 형태와 상관없이 영어 철자 + 품사 + 뜻. 2단(왼쪽 앞 절반, 오른쪽 뒤 절반)으로 40단어가 A4 한 장에 들어가게.
function StudySheet({ title, date, rows }: { title: string; date: string; rows: StudySheetRow[] }) {
  const half = Math.ceil(rows.length / 2)
  const columns = [rows.slice(0, half), rows.slice(half)]
  // 단어가 많으면 줄 간격·글자를 줄여 한 장에 맞춘다 (한 단에 20줄 넘을 때)
  const dense = half > 20
  const rowClass = dense ? 'py-[3px] text-[11.5px]' : 'py-[5px] text-[13px]'

  return (
    <div className="print-area">
      <div className="page mx-auto bg-white shadow-lg" style={{ width: '210mm', minHeight: PRINT_PAGE_MIN_HEIGHT, padding: '12mm 14mm 10mm' }}>
        {/* 헤더 */}
        <div className="mb-3 border-b-2 border-gray-800 pb-2">
          <p className="text-xs text-gray-500">보스턴S영어</p>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-4 text-sm">
            <div className="border-b border-gray-400 pb-1">
              <span className="mr-2 text-xs text-gray-400">이름:</span>
            </div>
            <div className="border-b border-gray-400 pb-1">
              <span className="mr-2 text-xs text-gray-400">시험일:</span>
              {date}
            </div>
            <div className="self-end text-xs text-gray-500">총 {rows.length}단어</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6">
          {columns.map((col, ci) => (
            <div key={ci}>
              <div className="flex gap-2 border-b border-gray-400 pb-1 text-[10px] font-semibold text-gray-500">
                <span className="w-5 shrink-0 text-right">#</span>
                <span className="w-[30mm] shrink-0">영어</span>
                <span className="w-4 shrink-0">품사</span>
                <span className="flex-1 pl-1">뜻</span>
              </div>
              {col.map((r, i) => (
                <div key={r.id} className={`word-row flex items-baseline gap-2 border-b border-gray-200 ${rowClass}`}>
                  <span className="w-5 shrink-0 text-right text-gray-400">{ci * half + i + 1}</span>
                  <span className="w-[30mm] shrink-0 font-semibold text-gray-900">{r.expression}</span>
                  <span className="w-4 shrink-0 text-[10px] text-gray-400">{r.pos ? POS_LABELS_KO[r.pos] ?? '' : ''}</span>
                  <span className="flex-1 pl-1 text-gray-800">
                    {r.meaning}
                    {r.other_meanings.length > 0 && (
                      <span className="ml-1 text-[10px] text-gray-500">({r.other_meanings.join(', ')})</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-gray-200 pt-2 text-center text-[10px] text-gray-400">
          보스턴S영어 | 담당교사: 서향미 선생님
        </div>
      </div>
    </div>
  )
}
