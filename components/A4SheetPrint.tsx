'use client'

// A4 쪽을 앱이 직접 나누는 인쇄 틀 (시험지 인쇄 app/tests/[id]/print/ExamSheetPrint.tsx 와 같은 방식, docs/print-layout-notes.md).
// 화면이 넘겨준 덩어리(머리말·지문·문항·정답 줄 …)의 높이를 화면 밖에서 재고 lib/printPagination.ts 로 쪽을 나눈 뒤,
// 그 쪽(.sheet)들을 화면 A4 미리보기 · 브라우저 인쇄 · PDF 저장이 그대로 쓴다 → 세 가지의 쪽 수·쪽 경계가 같다.
//   - 모든 쪽에 위 padTopMm(기본 12, 외부지문 인쇄는 20 = 2cm) · 옆 14 · 아래 14mm 안쪽 여백 (프린터가 위를 잘라도 글이 남게)
//   - 덩어리는 쪽 중간에서 자르지 않는다 / keepWithNext 는 다음 덩어리와 같은 쪽 / breakBefore 는 새 쪽
// 쓰는 곳: 외부지문저장소 인쇄 (app/materials/passages/external/[id]/print/page.tsx)

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { paginate, SHEET, SHEET_CONTENT_WIDTH_MM, type Pagination } from '@/lib/printPagination'

// 쪽에 들어갈 덩어리 하나. gapMm = 덩어리 아래 여백(높이에 포함되어 재진다)
export interface PrintBlock {
  key: string
  node: ReactNode
  gapMm: number
  keepWithNext?: boolean
  breakBefore?: boolean
}

// 쪽마다 한 장씩 캔버스로 찍어 A4 PDF 로 (화면·인쇄와 같은 쪽 나누기). 한 쪽보다 긴 쪽(overflow)은 A4 높이로 잘라 여러 장.
async function saveSheetsPdf(filename: string) {
  const sheets = Array.from(document.querySelectorAll<HTMLElement>('.print-area .sheet'))
  if (sheets.length === 0) return
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let first = true
  for (const sheet of sheets) {
    const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
    const pagePx = Math.floor((canvas.width * 297) / 210)
    for (let y = 0; y < canvas.height - 2; y += pagePx) {
      const h = Math.min(pagePx, canvas.height - y)
      const part = document.createElement('canvas')
      part.width = canvas.width
      part.height = h
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
      if (!first) pdf.addPage()
      first = false
      pdf.addImage(part.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, (h * 210) / canvas.width)
    }
  }
  pdf.save(`${filename}.pdf`)
}

export default function A4SheetPrint({
  blocks,
  fileName,
  footerText,
  controls,
  padTopMm = SHEET.padTopMm,
}: {
  blocks: PrintBlock[]
  fileName: string // PDF 파일 이름 (.pdf 제외)
  footerText: string // 쪽마다 쪽 안 아래 문구 (저작권)
  controls?: ReactNode // 화면 옵션 (인쇄되지 않음)
  padTopMm?: number // 쪽 위 안쪽 여백(mm)
}) {
  const contentHeightMm = SHEET.heightMm - padTopMm - SHEET.padBottomMm
  const [preview, setPreview] = useState(true) // A4 미리보기 (기본 켜짐)
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const measureRef = useRef<HTMLDivElement>(null)
  const mmRef = useRef<HTMLDivElement>(null)

  // 덩어리 높이를 재서 쪽을 나눈다 (글꼴을 다 받은 뒤 한 번 더)
  const measure = useCallback(() => {
    const box = measureRef.current
    const mm = mmRef.current
    if (!box || !mm) return
    // 인쇄 중에는 높이 재기 칸이 .no-print 로 사라져 높이가 0 이 된다 → 그때 다시 나누면 모든 덩어리가 한 쪽에 몰려 잘린다.
    // 인쇄 직전에 화면에서 나눈 쪽을 그대로 쓴다.
    if (window.matchMedia?.('print').matches) return
    const pxPerMm = mm.getBoundingClientRect().height / 100
    if (!pxPerMm || box.getBoundingClientRect().height === 0) return
    const heights = Array.from(box.children).map((c) => (c as HTMLElement).getBoundingClientRect().height)
    setPagination(
      paginate(
        blocks.map((b, i) => ({ height: heights[i] ?? 0, keepWithNext: b.keepWithNext, breakBefore: b.breakBefore })),
        contentHeightMm * pxPerMm,
      ),
    )
  }, [blocks, contentHeightMm])
  useLayoutEffect(() => {
    measure()
    let alive = true
    document.fonts?.ready.then(() => alive && measure())
    // 글꼴이 늦게 바뀌어 덩어리 높이가 달라지면 다시 나눈다
    const box = measureRef.current
    const ro = typeof ResizeObserver !== 'undefined' && box ? new ResizeObserver(() => alive && measure()) : null
    if (ro && box) ro.observe(box)
    return () => {
      alive = false
      ro?.disconnect()
    }
  }, [measure])

  const pages = pagination?.pages ?? []
  const sheetStyle = { width: `${SHEET.widthMm}mm`, padding: `${padTopMm}mm ${SHEET.padSideMm}mm ${SHEET.padBottomMm}mm` }

  async function onPdf() {
    setPdfBusy(true)
    try {
      await saveSheetsPdf(fileName)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
        .a4-print, .a4-print * { font-family: 'Noto Sans KR', sans-serif; box-sizing: border-box; }
        .sheet { position: relative; background: #fff; height: ${SHEET.heightMm}mm; overflow: hidden; }
        .sheet.sheet-overflow { height: auto; min-height: ${SHEET.heightMm}mm; overflow: visible; }
        .sheet-footer { position: absolute; left: 0; right: 0; bottom: 5mm; text-align: center; font-size: 7pt; color: #9ca3af; }
        .print-block { break-inside: avoid; page-break-inside: avoid; }
        .print-block.keep-next { break-after: avoid; page-break-after: avoid; }
        .question-block, .answer-block { break-inside: avoid; page-break-inside: avoid; }
        .preview-on .sheet { box-shadow: 0 1px 6px rgba(0,0,0,.18); }
        .preview-on .sheet-wrap + .sheet-wrap { margin-top: 10mm; }
        .preview-off .sheet-wrap + .sheet-wrap .sheet { border-top: 1px dashed #d1d5db; }
        @page { size: A4; margin: 0; }
        @media print {
          body { margin: 0; background: #fff; }
          .no-print { display: none !important; }
          .sheet-stack { background: none !important; padding: 0 !important; }
          .sheet-wrap + .sheet-wrap { margin-top: 0 !important; }
          .sheet { box-shadow: none !important; border: 0 !important; break-after: page; page-break-after: always; }
          .sheet-wrap:last-child .sheet { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      <div className="a4-print">
        <div className="no-print mb-3 flex flex-wrap items-center justify-center gap-4 pt-6">
          {controls}
          <button onClick={() => window.print()} className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
            🖨️ 인쇄
          </button>
          <button
            onClick={onPdf}
            disabled={pdfBusy || pages.length === 0}
            className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pdfBusy ? 'PDF 만드는 중…' : '📄 PDF 저장'}
          </button>
        </div>
        <div className="no-print mb-4 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-600">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
            A4 미리보기
          </label>
          {pages.length > 0 && <span className="text-xs text-gray-400">총 {pages.length}쪽</span>}
        </div>

        {/* 높이 재기용 (화면 밖, 인쇄·PDF 에 안 나옴): 쪽 안쪽 폭과 같은 폭으로 덩어리를 그려 본다 */}
        <div aria-hidden className="no-print" style={{ position: 'absolute', left: -10000, top: 0, visibility: 'hidden' }}>
          <div ref={mmRef} style={{ height: '100mm', width: 1 }} />
          <div ref={measureRef} style={{ width: `${SHEET_CONTENT_WIDTH_MM}mm` }}>
            {blocks.map((b) => (
              <div key={b.key} className={`print-block${b.keepWithNext ? ' keep-next' : ''}`} style={{ paddingBottom: `${b.gapMm}mm` }}>
                {b.node}
              </div>
            ))}
          </div>
        </div>

        <div className={`sheet-stack pb-10 ${preview ? 'preview-on bg-gray-100 py-6' : 'preview-off'}`}>
          <div className="print-area">
            {pages.map((ids, p) => (
              <div key={p} className="sheet-wrap">
                {preview && (
                  <p className="no-print mx-auto mb-1 text-right text-xs text-gray-500" style={{ width: `${SHEET.widthMm}mm` }}>
                    {p + 1} / {pages.length}쪽
                  </p>
                )}
                <div className={`sheet mx-auto${pagination?.overflow[p] ? ' sheet-overflow' : ''}`} style={sheetStyle}>
                  {ids.map((i) => (
                    <div key={blocks[i].key} className={`print-block${blocks[i].keepWithNext ? ' keep-next' : ''}`} style={{ paddingBottom: `${blocks[i].gapMm}mm` }}>
                      {blocks[i].node}
                    </div>
                  ))}
                  <div className="sheet-footer">{footerText}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
