'use client'

// 외부지문저장소 인쇄. 쪽 나누기는 components/A4SheetPrint.tsx (시험지 인쇄와 같은 A4 방식, docs/print-layout-notes.md):
// 머리말·지문·문항·서술형·정답 줄을 덩어리로 넘기면 A4 쪽마다 나눠 담고, 화면 미리보기·인쇄·PDF 가 같은 쪽을 쓴다.

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { PassageRecord } from '@/types/passageBank'
import { TaggedBody, stripTagMarkup } from '@/lib/passageTagRenderer'
import { copyrightNotice } from '@/config/copyright'
import A4SheetPrint, { type PrintBlock } from '@/components/A4SheetPrint'

const QTYPE_LABEL: Record<string, string> = {
  mc: '객관식',
  blank: '빈칸',
  tf: 'True/False',
  order: '순서배열',
  match: '매칭',
}

type Question = PassageRecord['questions'][number]

// 문항 한 덩어리 (번호·문제·보기) — 정답은 그리지 않는다
function QuestionBlock({ q, num }: { q: Question; num: number }) {
  return (
    <div className="question-block">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-white">
          {num}
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
          {q.type === 'blank' && <p className="text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">{q.q}</p>}
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
  )
}

function buildBlocks(
  record: PassageRecord,
  opts: { showAnswers: boolean; showEssays: boolean; showTags: boolean; today: string },
): PrintBlock[] {
  const { showAnswers, showEssays, showTags, today } = opts
  const essays = showEssays ? record.essays : []
  const blocks: PrintBlock[] = []

  blocks.push({
    key: 'header',
    gapMm: 5,
    node: (
      <div className="border-b-2 border-gray-800 pb-3">
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
    ),
  })

  // 지문은 첫 문항과 같은 쪽에서 시작 (keepWithNext)
  blocks.push({
    key: 'passage',
    gapMm: 4,
    keepWithNext: record.questions.length > 0,
    node: (
      <div className="rounded border border-gray-200 bg-gray-50 p-3">
        <p className="mb-1 text-xs font-semibold text-gray-500">【지문】</p>
        <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
          {showTags ? <TaggedBody text={record.tagged_body} /> : stripTagMarkup(record.tagged_body)}
        </p>
      </div>
    ),
  })

  record.questions.forEach((q, idx) => {
    blocks.push({ key: `q-${idx}`, gapMm: 3.5, node: <QuestionBlock q={q} num={idx + 1} /> })
  })

  if (essays.length > 0) {
    // 구역 제목은 첫 서술형과 같은 쪽 (제목만 쪽 끝에 남지 않음)
    blocks.push({
      key: 'essays-title',
      gapMm: 3,
      keepWithNext: true,
      node: <p className="border-t border-gray-300 pt-3 text-xs font-semibold text-gray-500">【서술형】</p>,
    })
    essays.forEach((e, idx) => {
      blocks.push({
        key: `e-${idx}`,
        gapMm: 4,
        node: (
          <div className="question-block">
            <p className="text-sm leading-relaxed text-gray-900">
              {idx + 1}. {e.q} <span className="text-[10px] text-gray-400">({e.wordLimit}자 내외)</span>
            </p>
            <div className="mt-1 h-16 rounded border border-gray-300" />
          </div>
        ),
      })
    })
  }

  // 문제지 끝 문구 (한 번만, 정답 앞)
  blocks.push({
    key: 'end',
    gapMm: 0,
    node: (
      <div className="border-t border-gray-200 pt-3 text-[10px] text-gray-400 text-center">
        보스턴S영어 | 담당교사: 서향미 선생님
      </div>
    ),
  })

  // 정답 및 해설 — 새 쪽에서 시작
  if (showAnswers) {
    blocks.push({
      key: 'answers-title',
      gapMm: 2,
      keepWithNext: true,
      breakBefore: true,
      node: <p className="text-xs font-semibold text-gray-400">— 정답 및 해설 (교사용 / 출력 후 제거) —</p>,
    })
    record.questions.forEach((q, idx) => {
      blocks.push({
        key: `a-${idx}`,
        gapMm: 1.5,
        node: (
          <div className="answer-block text-xs text-gray-600">
            <span className="font-medium">{idx + 1}.</span>{' '}
            {q.type === 'mc' && <>{q.answer} — {q.explanation}</>}
            {q.type === 'blank' && <>{q.answer} — {q.explanation}</>}
            {q.type === 'tf' && <>{q.answer ? 'True' : 'False'} — {q.explanation}</>}
            {q.type === 'order' && <>{q.answer.join(' → ')}</>}
            {q.type === 'match' && <>{q.pairs.map((p) => `${p.word}=${p.meaning}`).join(', ')}</>}
          </div>
        ),
      })
    })
    essays.forEach((e, idx) => {
      blocks.push({
        key: `ea-${idx}`,
        gapMm: 1.5,
        node: (
          <div className={`answer-block text-xs text-gray-600${idx === 0 ? ' pt-1.5' : ''}`}>
            <span className="font-medium">서술형 {idx + 1}.</span> {e.sampleAnswer}{' '}
            <span className="text-gray-400">[{e.rubric}]</span>
          </div>
        ),
      })
    })
  }
  return blocks
}

export default function ExternalPassagePrintPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [record, setRecord] = useState<PassageRecord | null>(null)
  const [loading, setLoading] = useState(true)

  // 정답·해설은 기본으로 끈다 (그냥 인쇄하면 문제만). 필요하면 화면에서 켠다.
  const [showAnswers, setShowAnswers] = useState(false)
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

  const today = useMemo(() => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), [])
  const blocks = useMemo(
    () => (record ? buildBlocks(record, { showAnswers, showEssays, showTags, today }) : []),
    [record, showAnswers, showEssays, showTags, today],
  )

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>
  if (!record) return <div className="py-20 text-center text-sm text-gray-400">지문을 찾을 수 없습니다.</div>

  return (
    <A4SheetPrint
      blocks={blocks}
      fileName={record.title}
      footerText={copyrightNotice('exam')}
      padTopMm={20} // 프린터가 위를 잘라 먹는 경우가 있어 위 2cm (12 → 20 → 25 → 20mm, 2026-10-05 요청)
      controls={
        <>
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
        </>
      }
    />
  )
}
