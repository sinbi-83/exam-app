'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

async function downloadPdf(filename: string) {
  const html2pdf = (await import('html2pdf.js')).default
  const el = document.querySelector('.print-area')
  if (!el) return
  html2pdf().set({
    margin: 0,
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).from(el).save()
}

interface WordPair {
  en: string
  ko: string
}

function PrintContent() {
  const params = useSearchParams()
  const title = params.get('title') ?? '단어 테스트'
  const testType = params.get('type') ?? 'mixed'
  const dataRaw = params.get('data') ?? '[]'

  let words: WordPair[] = []
  try { words = JSON.parse(dataRaw) } catch { /* ignore */ }

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  // 혼합인 경우 반반 섞기
  const questions = words.map((w, i) => {
    let showEn = true
    if (testType === 'ko_to_en') showEn = false
    else if (testType === 'mixed') showEn = i % 2 === 0
    return { ...w, showEn }
  })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
        * { font-family: 'Noto Sans KR', sans-serif; box-sizing: border-box; }
        @page { size: A4; margin: 0; }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .page { box-shadow: none !important; }
          .answer-section { display: none !important; }
        }
      `}</style>

      <div className="no-print mb-4 flex justify-center gap-3 pt-6">
        <button
          onClick={() => window.print()}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          🖨️ 인쇄
        </button>
        <button
          onClick={() => downloadPdf(title)}
          className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          📄 PDF 저장
        </button>
      </div>

      {/* 시험지 */}
      <div className="print-area page mx-auto bg-white shadow-lg" style={{ width: '210mm', minHeight: '297mm', padding: '14mm 16mm 12mm' }}>
        {/* 헤더 */}
        <div className="mb-6 border-b-2 border-gray-800 pb-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-gray-500">보스턴S영어학원</p>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            </div>
            <p className="text-xs text-gray-400">{today}</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
            <div className="border-b border-gray-400 pb-1"><span className="text-xs text-gray-400 mr-2">이름:</span></div>
            <div className="border-b border-gray-400 pb-1"><span className="text-xs text-gray-400 mr-2">학년/반:</span></div>
            <div className="text-right text-xs text-gray-400">총 {words.length}문항</div>
          </div>
        </div>

        {/* 문제 (2컬럼) */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-center text-xs font-medium text-gray-400">{i + 1}.</span>
              <div className="flex flex-1 items-center gap-2 border-b border-gray-300 pb-0.5">
                <span className="text-sm font-medium text-gray-900">
                  {q.showEn ? q.en : q.ko}
                </span>
                <span className="flex-1 text-gray-300">—</span>
                <div className="w-24 border-b border-gray-400" />
              </div>
            </div>
          ))}
        </div>

        {/* 정답지 (인쇄 시 숨겨짐) */}
        <div className="answer-section mt-8 border-t border-dashed border-gray-300 pt-4">
          <p className="mb-3 text-xs font-semibold text-gray-400">— 정답 (선생님용 / 출력 후 제거) —</p>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, i) => (
              <div key={i} className="text-xs text-gray-600">
                <span className="font-medium">{i + 1}.</span>{' '}
                {q.showEn ? q.ko : q.en}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-3 text-center text-[10px] text-gray-400">
          보스턴S영어학원 | 담당교사: 서향미 선생님
        </div>
      </div>
    </>
  )
}

export default function VocabTestPrintPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-gray-400">로딩 중…</div>}>
      <PrintContent />
    </Suspense>
  )
}
