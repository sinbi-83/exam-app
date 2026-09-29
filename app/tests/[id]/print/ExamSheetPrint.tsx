'use client'

// 문제 시험·혼합 시험의 일반 인쇄 (단어만 있는 시험은 WordTestPrint 가 따로 그린다).
// 쪽 나누기를 화면에서 직접 한다 (lib/printPagination.ts): 덩어리(머리말·지문·문항·단어 줄·정답)의 높이를 재서
// A4 쪽(.sheet)마다 나눠 담고, 그 쪽들을 화면 A4 미리보기 · 브라우저 인쇄 · PDF 저장이 그대로 쓴다 → 세 가지가 같다.
// 저장된 문항(question_data snapshot)은 읽기만 한다. 학생용에는 정답·해설을 그리지 않는다.
// 자세한 규칙: docs/print-layout-notes.md

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatAnswer, formatExplanation, includesAnswers, includesQuestions, printFileName, type PrintView } from '@/lib/printView'
import { copyrightNotice } from '@/config/copyright'
import {
  DEFAULT_WORD_COLUMNS,
  optionLayout,
  paginate,
  pointsLabel,
  SHEET,
  SHEET_CONTENT_HEIGHT_MM,
  SHEET_CONTENT_WIDTH_MM,
  WORD_COLUMN_CHOICES,
  wordGridRows,
  type Pagination,
  type WordColumns,
} from '@/lib/printPagination'
import PrintViewToggle from './PrintViewToggle'
import { isBlankFormat, isFindErrorFormat, maskBlankAnswersInPassage } from '@/lib/grammarLeak'

export interface QuestionData {
  type: string
  question: string
  options?: string[]
  answer?: string
  explanation?: string
  passage?: string
  // 외부지문저장소 'order' 유형 전용: 배열할 문장들 (원래 순서 그대로, 화면에서 A/B/C… 번호를 붙인다)
  items?: string[]
  // 외부지문저장소 'match' 유형 전용: 좌우 짝짓기
  matchWords?: string[]
  matchMeanings?: string[]
  // 단어 문항 (혼합 시험): 영→한 / 한→영
  direction?: 'en_ko' | 'ko_en'
  accepted_answers?: string[]
}

export interface ExamQuestion {
  id: string
  question_data: QuestionData
  sort_order: number
  points: number
}

export const TYPE_LABELS: Record<string, string> = {
  vocab: '어휘',
  grammar: '어법',
  reading: '독해',
  essay: '서술형',
  summary: '지문요약',
  mc: '객관식',
  blank: '빈칸',
  tf: '참/거짓',
  order: '순서배열',
  match: '짝짓기',
  word: '단어',
}

const MATCH_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

// "따옴표로 감싼 부분" 추출 (targetText)
function extractQuoted(text: string): string | null {
  const match = text.match(/"([^"]+)"/)
  return match ? match[1] : null
}

// 지문에서 밑줄 쳐야 할 단어들을 찾아 세그먼트로 분리
function buildPassageSegments(rawPassage: string, questions: ExamQuestion[]) {
  type Seg = { text: string; underline?: boolean }
  // 빈칸형 어법 문항의 정답이 같은 지문에 그대로 보이지 않게, 지문의 그 자리도 빈칸으로 (화면·인쇄만, lib/grammarLeak.ts)
  const passage = maskBlankAnswersInPassage(
    rawPassage,
    questions.filter((eq) => eq.question_data.type === 'grammar').map((eq) => eq.question_data.question),
  )
  const matchRanges: { start: number; end: number }[] = []
  for (const eq of questions) {
    const q = eq.question_data
    if (q.type !== 'vocab' && q.type !== 'grammar') continue
    // 새 어법 형식(빈칸형·틀린 것 찾기)은 지문에 밑줄을 긋지 않는다
    if (q.type === 'grammar' && (isBlankFormat(q.question) || isFindErrorFormat(q.question))) continue
    const target = extractQuoted(q.question)
    if (!target) continue
    const idx = passage.indexOf(target)
    if (idx === -1) continue
    matchRanges.push({ start: idx, end: idx + target.length })
  }
  matchRanges.sort((a, b) => a.start - b.start)
  const cleaned: { start: number; end: number }[] = []
  let lastEnd = 0
  for (const m of matchRanges) {
    if (m.start >= lastEnd) { cleaned.push(m); lastEnd = m.end }
  }
  const segs: Seg[] = []
  let cursor = 0
  for (const m of cleaned) {
    if (m.start > cursor) segs.push({ text: passage.slice(cursor, m.start) })
    segs.push({ text: passage.slice(m.start, m.end), underline: true })
    cursor = m.end
  }
  if (cursor < passage.length) segs.push({ text: passage.slice(cursor) })
  return segs
}

// 문제 텍스트에서 "quoted" 부분을 밑줄로 렌더링
function renderQuestionText(text: string) {
  const parts = text.split(/("(?:[^"]+)")/)
  return parts.map((part, i) => {
    if (part.startsWith('"') && part.endsWith('"') && part.length > 2) {
      return (
        <span key={i} style={{ textDecoration: 'underline', textUnderlineOffset: '2px', fontStyle: 'italic' }}>
          {part.slice(1, -1)}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// 빈칸(_____)을 실제 빈칸 선으로 렌더링
function renderWithBlanks(text: string) {
  const parts = text.split(/(_{3,})/)
  return parts.map((part, i) =>
    /^_{3,}$/.test(part) ? (
      <span key={i} style={{ display: 'inline-block', minWidth: '60px', borderBottom: '1.5px solid #333', margin: '0 2px', verticalAlign: 'bottom' }} />
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

// 쪽에 들어갈 덩어리 하나. gap = 덩어리 아래 여백(mm, 높이에 포함되어 재진다)
interface Block {
  key: string
  node: ReactNode
  gapMm: number
  keepWithNext?: boolean
  breakBefore?: boolean
}

// ── 문항 한 덩어리 (번호·문제·보기·답 칸) — 정답은 그리지 않는다 ──
function QuestionBlock({ eq, num }: { eq: ExamQuestion; num: number }) {
  const q = eq.question_data
  const isOrder = q.type === 'order' && Array.isArray(q.items)
  const isMatch = q.type === 'match' && Array.isArray(q.matchWords) && Array.isArray(q.matchMeanings)
  const isMultiple = Array.isArray(q.options) && q.options.length > 0 && !isOrder && !isMatch
  const isEssay = q.type === 'essay'
  const isSummary = q.type === 'summary'
  const isShortAnswer = !isMultiple && !isEssay && !isSummary && !isOrder && !isMatch
  const layout = isMultiple ? optionLayout(q.options!) : 'stack'
  return (
    <div className="question-block">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-white">{num}</span>
        <div className="flex-1">
          <span className="mr-1 text-[10px] text-gray-400">[{TYPE_LABELS[q.type] ?? q.type}] {eq.points}점</span>
          <span className="whitespace-pre-line text-[13px] leading-relaxed text-gray-900">
            {isSummary
              ? renderWithBlanks(q.question)
              : q.type === 'grammar' && isBlankFormat(q.question)
                ? renderWithBlanks(q.question.replace(/"/g, '')) // 빈칸형: 문장의 빈칸을 선으로
                : renderQuestionText(q.question)}
          </span>
        </div>
      </div>
      {isMultiple && (
        <div
          className={`ml-7 mt-1 text-[13px] text-gray-700 ${layout === 'inline' ? 'flex flex-wrap gap-x-6 gap-y-0.5' : layout === 'two' ? 'grid grid-cols-2 gap-x-6 gap-y-0.5' : 'space-y-0.5'}`}
        >
          {q.options!.map((opt, i) => (
            <div key={i}>{CHOICE_MARK[i] ?? `(${i + 1})`} {opt}</div>
          ))}
        </div>
      )}
      {isEssay && <div className="ml-7 mt-1.5 h-14 rounded border border-gray-300" />}
      {isShortAnswer && (
        <div className="ml-7 mt-1">
          <div className="inline-block min-w-32 border-b border-gray-400 pb-1" />
        </div>
      )}
      {isOrder && (
        <div className="ml-7 mt-1">
          <div className="space-y-0.5 text-[13px] text-gray-700">
            {q.items!.map((it, i) => (
              <div key={i}>({MATCH_LABELS[i] ?? i + 1}) {it}</div>
            ))}
          </div>
          <div className="mt-1.5 inline-block min-w-40 border-b border-gray-400 pb-1" />
        </div>
      )}
      {isMatch && (
        <div className="ml-7 mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[13px] text-gray-700">
          <div>{q.matchWords!.map((w, i) => <div key={i}>{i + 1}. {w} ( &nbsp;&nbsp; )</div>)}</div>
          <div>{q.matchMeanings!.map((m, i) => <div key={i}>{MATCH_LABELS[i] ?? i + 1}. {m}</div>)}</div>
        </div>
      )}
    </div>
  )
}

// 단어 한 칸: "번호. 단어 (뜻을 쓰시오)" + 답 밑줄 — 정답은 그리지 않는다
function WordCell({ eq, num }: { eq: ExamQuestion; num: number }) {
  const q = eq.question_data
  return (
    <div className="word-cell">
      <p className="text-[12.5px] leading-snug text-gray-900">
        <span className="font-semibold">{num}.</span> {q.question}{' '}
        <span className="text-[9.5px] text-gray-500">{q.direction === 'ko_en' ? '(영어로 쓰시오)' : '(뜻을 쓰시오)'}</span>
      </p>
      <div className="mt-4 border-b border-gray-500" />
    </div>
  )
}

// ── 덩어리 목록 만들기 (보기 방식·단어 열 수에 따라) ──
export function buildExamBlocks({
  title,
  date,
  questions,
  view,
  wordColumns,
  today,
}: {
  title: string
  date: string
  questions: ExamQuestion[]
  view: PrintView
  wordColumns: WordColumns
  today: string
}): Block[] {
  // 단어 문항은 지문 문항 뒤 '단어 구역'으로 (번호도 지문 문항 다음부터). 단어가 없는 시험은 순서 그대로.
  const nonWord = questions.filter((q) => q.question_data.type !== 'word')
  const words = questions.filter((q) => q.question_data.type === 'word')
  const totalPoints = questions.reduce((s, q) => s + q.points, 0)
  const blocks: Block[] = []

  if (includesQuestions(view)) {
    blocks.push({
      key: 'header',
      gapMm: 5,
      node: (
        <div className="border-b-2 border-gray-800 pb-2.5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-gray-500">보스턴S영어</p>
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>출제일: {today}</p>
              {date && <p>시험일: {date}</p>}
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-4 text-sm">
            <div className="border-b border-gray-400 pb-1"><span className="mr-2 text-xs text-gray-400">이름:</span></div>
            <div className="border-b border-gray-400 pb-1"><span className="mr-2 text-xs text-gray-400">학년/반:</span></div>
            <div className="text-right text-xs text-gray-500">총 {questions.length}문항 / {totalPoints}점 만점</div>
          </div>
        </div>
      ),
    })

    // 지문별로 묶기 (연속한 같은 지문)
    const groups: { passage: string | null; questions: ExamQuestion[] }[] = []
    for (const eq of nonWord) {
      const passage = eq.question_data.passage ?? null
      const last = groups[groups.length - 1]
      if (last && last.passage === passage) last.questions.push(eq)
      else groups.push({ passage, questions: [eq] })
    }
    let num = 0
    groups.forEach((g, gi) => {
      if (g.passage) {
        // 지문은 딸린 첫 문항과 같은 쪽에서 시작 (keepWithNext)
        blocks.push({
          key: `passage-${gi}`,
          gapMm: 2.5,
          keepWithNext: true,
          node: (
            <div className="passage-block rounded border border-gray-200 bg-gray-50 p-2.5">
              <p className="mb-1 text-xs font-semibold text-gray-500">【지문】</p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                {buildPassageSegments(g.passage, g.questions).map((seg, si) =>
                  seg.underline ? (
                    <span key={si} style={{ textDecoration: 'underline', textDecorationThickness: '1.5px', textUnderlineOffset: '2px' }}>{seg.text}</span>
                  ) : (
                    <span key={si}>{seg.text}</span>
                  ),
                )}
              </p>
            </div>
          ),
        })
      }
      g.questions.forEach((eq) => {
        num++
        blocks.push({ key: `q-${eq.id}`, gapMm: 3.5, node: <QuestionBlock eq={eq} num={num} /> })
      })
    })
    if (nonWord.length > 0) {
      blocks.push({
        key: 'questions-end',
        gapMm: 0,
        node: <p className="border-t border-gray-200 pt-2 text-center text-[10px] text-gray-400">보스턴S영어 | 담당교사: 서향미 선생님</p>,
      })
    }

    if (words.length > 0) {
      // 단어 구역: 새 쪽을 강제하지 않는다 — 앞 쪽 남은 자리에 제목 + 첫 단어 줄이 들어가면 이어서, 모자라면 그때만 새 쪽
      // (제목은 keepWithNext 로 첫 단어 줄과 붙어 다닌다). 여러 열, 배점은 구역 제목에 한 번만
      blocks.push({
        key: 'words-title',
        gapMm: 3,
        keepWithNext: true,
        node: (
          <div className="section-title flex items-end justify-between border-b-2 border-gray-800 pb-1.5">
            <p className="text-sm font-bold text-gray-900">
              단어 <span className="font-normal text-gray-600">({pointsLabel(words.map((w) => w.points))})</span>
            </p>
            <div className="w-40 border-b border-gray-400 pb-0.5 text-sm"><span className="mr-2 text-xs text-gray-400">이름:</span></div>
          </div>
        ),
      })
      const start = nonWord.length
      wordGridRows(words.map((eq, i) => ({ eq, num: start + i + 1 })), wordColumns).forEach((row, ri) => {
        blocks.push({
          key: `wrow-${ri}`,
          gapMm: 3,
          node: (
            <div className="word-grid grid gap-x-4" style={{ gridTemplateColumns: `repeat(${wordColumns}, minmax(0, 1fr))` }}>
              {row.map(({ eq, num }) => <WordCell key={eq.id} eq={eq} num={num} />)}
            </div>
          ),
        })
      })
    }
  }

  if (includesAnswers(view)) {
    const ordered = [...nonWord, ...words]
    blocks.push({
      key: 'answers-title',
      gapMm: 3,
      keepWithNext: true,
      breakBefore: includesQuestions(view),
      node: (
        <div className="section-title border-b-2 border-gray-800 pb-2">
          <p className="text-xs text-gray-500">보스턴S영어 · 교사용</p>
          <h2 className="text-lg font-bold text-gray-900">{title} — 정답 및 해설</h2>
        </div>
      ),
    })
    nonWord.forEach((eq, idx) => {
      const q = eq.question_data
      const explanation = formatExplanation(q)
      blocks.push({
        key: `a-${eq.id}`,
        gapMm: 1.8,
        node: (
          <div className="answer-block text-sm">
            <p className="text-gray-900">
              <span className="mr-1 font-semibold">{idx + 1}.</span>
              <span className="mr-1 text-[10px] text-gray-400">[{TYPE_LABELS[q.type] ?? q.type}]</span>
              {formatAnswer(q)}
            </p>
            {explanation && <p className="ml-5 mt-0.5 whitespace-pre-wrap text-xs text-gray-600">{explanation}</p>}
          </div>
        ),
      })
    })
    if (words.length > 0) {
      blocks.push({ key: 'answers-words-title', gapMm: 1.5, keepWithNext: true, node: <p className="section-title pt-1 text-sm font-bold text-gray-800">단어</p> })
      const start = nonWord.length
      wordGridRows(ordered.slice(start).map((eq, i) => ({ eq, num: start + i + 1 })), 2).forEach((row, ri) => {
        blocks.push({
          key: `awrow-${ri}`,
          gapMm: 0.8,
          node: (
            <div className="grid grid-cols-2 gap-x-8 text-sm">
              {row.map(({ eq, num }) => (
                <div key={eq.id} className="flex gap-2">
                  <span className="w-7 shrink-0 text-right font-semibold text-gray-700">{num}.</span>
                  <span className="text-gray-500">{eq.question_data.question} →</span>
                  <span className="text-gray-900">
                    {(eq.question_data.accepted_answers?.length ? eq.question_data.accepted_answers : [eq.question_data.answer ?? '-']).join(' / ')}
                  </span>
                </div>
              ))}
            </div>
          ),
        })
      })
    }
  }
  return blocks
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

export default function ExamSheetPrint({
  title,
  date,
  questions,
  view,
  onViewChange,
  notice,
}: {
  title: string
  date: string
  questions: ExamQuestion[]
  view: PrintView
  onViewChange: (v: PrintView) => void
  notice?: ReactNode // 샘플 화면 안내 등 (인쇄되지 않음)
}) {
  const [wordColumns, setWordColumns] = useState<WordColumns>(DEFAULT_WORD_COLUMNS)
  const [preview, setPreview] = useState(true) // A4 미리보기 (기본 켜짐)
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const measureRef = useRef<HTMLDivElement>(null)
  const mmRef = useRef<HTMLDivElement>(null)
  const hasWords = questions.some((q) => q.question_data.type === 'word')
  const today = useMemo(() => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), [])
  const blocks = useMemo(
    () => buildExamBlocks({ title, date, questions, view, wordColumns, today }),
    [title, date, questions, view, wordColumns, today],
  )

  // 덩어리 높이를 재서 쪽을 나눈다 (글꼴을 다 받은 뒤 한 번 더)
  const measure = useCallback(() => {
    const box = measureRef.current
    const mm = mmRef.current
    if (!box || !mm) return
    const pxPerMm = mm.getBoundingClientRect().height / 100
    const heights = Array.from(box.children).map((c) => (c as HTMLElement).getBoundingClientRect().height)
    setPagination(
      paginate(
        blocks.map((b, i) => ({ height: heights[i] ?? 0, keepWithNext: b.keepWithNext, breakBefore: b.breakBefore })),
        SHEET_CONTENT_HEIGHT_MM * pxPerMm,
      ),
    )
  }, [blocks])
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
  const sheetStyle = { width: `${SHEET.widthMm}mm`, padding: `${SHEET.padTopMm}mm ${SHEET.padSideMm}mm ${SHEET.padBottomMm}mm` }

  async function onPdf() {
    setPdfBusy(true)
    try {
      await saveSheetsPdf(printFileName(title, view))
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
        .exam-print, .exam-print * { font-family: 'Noto Sans KR', sans-serif; box-sizing: border-box; }
        .sheet { position: relative; background: #fff; height: ${SHEET.heightMm}mm; overflow: hidden; }
        .sheet.sheet-overflow { height: auto; min-height: ${SHEET.heightMm}mm; overflow: visible; }
        .sheet-footer { position: absolute; left: 0; right: 0; bottom: 5mm; text-align: center; font-size: 7pt; color: #9ca3af; }
        .print-block { break-inside: avoid; page-break-inside: avoid; }
        .print-block.keep-next { break-after: avoid; page-break-after: avoid; }
        .question-block, .word-cell, .answer-block { break-inside: avoid; page-break-inside: avoid; }
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

      <div className="exam-print">
        <div className="no-print mb-3 flex flex-wrap items-start justify-center gap-3 pt-6">
          <PrintViewToggle view={view} onChange={onViewChange} />
          <button onClick={() => window.print()} className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
            🖨️ 인쇄
          </button>
          <button onClick={onPdf} disabled={pdfBusy || pages.length === 0} className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {pdfBusy ? 'PDF 만드는 중…' : '📄 PDF 저장'}
          </button>
        </div>
        <div className="no-print mb-4 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-600">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
            A4 미리보기
          </label>
          {hasWords && (
            <span className="flex items-center gap-1">
              단어 열 수
              {WORD_COLUMN_CHOICES.map((n) => (
                <button
                  key={n}
                  onClick={() => setWordColumns(n)}
                  className={`rounded border px-2 py-0.5 ${wordColumns === n ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 hover:bg-gray-50'}`}
                >
                  {n}열
                </button>
              ))}
            </span>
          )}
          {pages.length > 0 && <span className="text-xs text-gray-400">총 {pages.length}쪽</span>}
        </div>
        {notice && <div className="no-print mx-auto mb-4 max-w-3xl">{notice}</div>}

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
                  <div className="sheet-footer">{copyrightNotice('exam')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
