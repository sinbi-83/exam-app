'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { isWordTestExam } from '@/lib/wordTest'
import { parsePrintView, type PrintView } from '@/lib/printView'
import WordTestPrint from './WordTestPrint'
import ExamSheetPrint, { type ExamQuestion } from './ExamSheetPrint'
import { copyrightNotice } from '@/config/copyright'
import { savePdfWithFooter } from '@/lib/printCopyright'

// 단어시험 전용 인쇄(WordTestPrint)의 PDF 저장 — 예전 방식 그대로
async function downloadPdf(filename: string) {
  const el = document.querySelector('.print-area') as HTMLElement
  if (!el) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    margin: 0,
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    // 교사용: 정답·해설 장(.answer-page)은 항상 새 장에서 시작한다
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'], before: '.answer-page' },
  }
  // 모든 쪽 아래에 카피라이트 문구 (lib/printCopyright.ts)
  await savePdfWithFooter(el, options, copyrightNotice('exam'))
}

function PrintContent() {
  const params = useSearchParams()
  const examId = params.get('exam_id') ?? ''
  const title = params.get('title') ?? '시험지'
  const date = params.get('date') ?? ''

  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [loading, setLoading] = useState(true)
  // 출력 방식: 주소에 ?view= 가 없으면 학생용(문제만)
  const [view, setView] = useState<PrintView>(parsePrintView(params.get('view')))

  // 고른 출력 방식을 주소에도 남긴다 (새로고침해도 유지). 다른 주소값(exam_id, title, date, sheet)은 그대로.
  function changeView(next: PrintView) {
    setView(next)
    const url = new URL(window.location.href)
    if (next === 'student') url.searchParams.delete('view')
    else url.searchParams.set('view', next)
    window.history.replaceState(null, '', url.toString())
  }

  useEffect(() => {
    if (!examId) { setLoading(false); return }
    fetch(`/api/exam-questions?exam_id=${examId}`)
      .then((r) => r.json())
      .then((json) => { if (json.data) setQuestions(json.data) })
      .finally(() => setLoading(false))
  }, [examId])

  if (loading) {
    return <div className="py-20 text-center text-sm text-gray-400">문제 불러오는 중…</div>
  }

  // 단어은행 자동 단어시험(문항 전부 'word')만 전용 레이아웃. 그 밖의 시험(문제·혼합)은 A4 쪽 나누기 인쇄.
  if (isWordTestExam(questions)) {
    return (
      <WordTestPrint
        title={title}
        date={date}
        questions={questions}
        initialSheet={params.get('sheet') === 'study' ? 'study' : 'test'}
        view={view}
        onViewChange={changeView}
        onPdf={(name) => downloadPdf(name)}
      />
    )
  }

  return <ExamSheetPrint title={title} date={date} questions={questions} view={view} onViewChange={changeView} />
}

export default function ExamPrintPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-gray-400">로딩 중…</div>}>
      <PrintContent />
    </Suspense>
  )
}
