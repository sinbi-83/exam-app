'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PassageRecord } from '@/types/passageBank'
import { TaggedBody, stripTagMarkup } from '@/lib/passageTagRenderer'

async function downloadPdf(filename: string) {
  const html2pdf = (await import('html2pdf.js')).default
  const el = document.querySelector('.print-area') as HTMLElement
  if (!el) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    margin: 0,
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  }
  html2pdf().set(options).from(el).save()
}

const QTYPE_LABEL: Record<string, string> = {
  mc: '객관식',
  blank: '빈칸',
  tf: 'True/False',
  order: '순서배열',
  match: '매칭',
}

export default function ExternalPassagePrintPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [record, setRecord] = useState<PassageRecord | null>(null)
  const [loading, setLoading] = useState(true)

  const [showAnswers, setShowAnswers] = useState(true)
  const [showEssays, setShowEssays] = useState(true)
  const [showTags, setShowTags] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(`/api/passages/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setRecord(json.data)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>
  if (!record) return <div className="py-20 text-center text-sm text-gray-400">지문을 찾을 수 없습니다.</div>

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

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
          .question-block { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* 옵션 + 인쇄 버튼 */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-center gap-4 pt-6">
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
          정답 포함
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showEssays} onChange={(e) => setShowEssays(e.target.checked)} />
          서술형 포함
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} />
          태그 표시
        </label>
        <button
          onClick={() => window.print()}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          🖨️ 인쇄
        </button>
        <button
          onClick={() => downloadPdf(record.title)}
          className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          📄 PDF 저장
        </button>
      </div>

      <div
        className="print-area page mx-auto bg-white shadow-lg"
        style={{ width: '210mm', minHeight: '297mm', padding: '14mm 16mm 12mm' }}
      >
        {/* 헤더 */}
        <div className="mb-6 border-b-2 border-gray-800 pb-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-gray-500">보스턴S영어</p>
              <h1 className="text-2xl font-bold text-gray-900">{record.title}</h1>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>출력일: {today}</p>
              <p>{record.level} · {record.topic}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
            <div className="border-b border-gray-400 pb-1">
              <span className="text-xs text-gray-400 mr-2">이름:</span>
            </div>
            <div className="border-b border-gray-400 pb-1">
              <span className="text-xs text-gray-400 mr-2">학년/반:</span>
            </div>
            <div className="text-right text-xs text-gray-500">
              총 {record.questions.length}문항{showEssays ? ` + 서술형 ${record.essays.length}개` : ''}
            </div>
          </div>
        </div>

        {/* 지문 */}
        <div className="mb-5 rounded border border-gray-200 bg-gray-50 p-3 question-block">
          <p className="mb-1 text-xs font-semibold text-gray-500">【지문】</p>
          <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
            {showTags ? <TaggedBody text={record.tagged_body} /> : stripTagMarkup(record.tagged_body)}
          </p>
        </div>

        {/* 문항 */}
        <div className="space-y-4">
          {record.questions.map((q, idx) => (
            <div key={idx} className="pb-2 question-block">
              <div className="mb-1 flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-white">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <span className="text-[10px] text-gray-400">[{QTYPE_LABEL[q.type]}]</span>

                  {q.type === 'mc' && (
                    <>
                      <p className="text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">{q.q}</p>
                      <div className="ml-1 mt-1 space-y-0.5">
                        {q.choices.map((c, i) => (
                          <div key={i} className="text-sm text-gray-700">
                            {['①', '②', '③', '④', '⑤'][i] ?? `(${i + 1})`} {c}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {q.type === 'blank' && (
                    <p className="text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">{q.q}</p>
                  )}
                  {q.type === 'tf' && (
                    <>
                      <p className="text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">{q.q}</p>
                      <p className="mt-1 text-sm text-gray-700">( True / False )</p>
                    </>
                  )}
                  {q.type === 'order' && (
                    <ul className="ml-1 mt-1 space-y-0.5">
                      {q.items.map((item, i) => (
                        <li key={i} className="text-sm text-gray-700">
                          {String.fromCharCode(65 + i)}. {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.type === 'match' && (
                    <div className="ml-1 mt-1 grid grid-cols-2 gap-3">
                      <ul className="space-y-0.5">
                        {q.pairs.map((p, i) => (
                          <li key={i} className="text-sm text-gray-700">{String.fromCharCode(65 + i)}. {p.word}</li>
                        ))}
                      </ul>
                      <ul className="space-y-0.5">
                        {q.pairs.map((p, i) => (
                          <li key={i} className="text-sm text-gray-700">{i + 1}. ______</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 서술형 */}
        {showEssays && record.essays.length > 0 && (
          <div className="mt-6 space-y-4">
            <p className="border-t border-gray-300 pt-3 text-xs font-semibold text-gray-500">【서술형】</p>
            {record.essays.map((e, idx) => (
              <div key={idx} className="question-block">
                <p className="text-sm leading-relaxed text-gray-900">
                  {idx + 1}. {e.q} <span className="text-[10px] text-gray-400">({e.wordLimit}자 내외)</span>
                </p>
                <div className="mt-1 h-16 rounded border border-gray-300" />
              </div>
            ))}
          </div>
        )}

        {/* 정답 및 해설 */}
        {showAnswers && (
          <div className="mt-8 border-t border-dashed border-gray-300 pt-4">
            <p className="mb-2 text-xs font-semibold text-gray-400">— 정답 및 해설 (교사용 / 출력 후 제거) —</p>
            <div className="space-y-1.5">
              {record.questions.map((q, idx) => (
                <div key={idx} className="text-xs text-gray-600">
                  <span className="font-medium">{idx + 1}.</span>{' '}
                  {q.type === 'mc' && <>{q.answer} — {q.explanation}</>}
                  {q.type === 'blank' && <>{q.answer} — {q.explanation}</>}
                  {q.type === 'tf' && <>{q.answer ? 'True' : 'False'} — {q.explanation}</>}
                  {q.type === 'order' && <>{q.answer.join(' → ')}</>}
                  {q.type === 'match' && <>{q.pairs.map((p) => `${p.word}=${p.meaning}`).join(', ')}</>}
                </div>
              ))}
            </div>

            {showEssays && record.essays.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {record.essays.map((e, idx) => (
                  <div key={idx} className="text-xs text-gray-600">
                    <span className="font-medium">서술형 {idx + 1}.</span> {e.sampleAnswer}{' '}
                    <span className="text-gray-400">[{e.rubric}]</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 하단 */}
        <div className="mt-6 border-t border-gray-200 pt-3 text-[10px] text-gray-400 text-center">
          보스턴S영어 | 담당교사: 서향미 선생님
        </div>
      </div>
    </>
  )
}
