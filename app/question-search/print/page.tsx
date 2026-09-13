'use client'

import { useEffect, useState } from 'react'

interface EssayMeta {
  wordBank?: string[] | null
  conditions?: string | null
  answerLines?: number | null
}

interface PrintItem {
  number: number
  question_type: string
  question_text: string
  choices: string[] | null
  correct_answer: string | null
  explanation: string | null
  essay_meta?: EssayMeta | null
}

interface PrintGroup {
  passage: string
  items: PrintItem[]
}

interface SearchPrintData {
  mode: 'exam' | 'answer'
  groups: PrintGroup[]
}

const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

function extractQuoted(text: string): string | null {
  const match = text.match(/"([^"]+)"/)
  return match ? match[1] : null
}

function buildPassageSegments(passage: string, items: PrintItem[]) {
  type Match = { start: number; end: number }
  const matches: Match[] = []

  for (const item of items) {
    if (item.question_type !== 'vocab' && item.question_type !== 'grammar') continue
    const target = extractQuoted(item.question_text)
    if (!target) continue
    const idx = passage.indexOf(target)
    if (idx === -1) continue
    matches.push({ start: idx, end: idx + target.length })
  }

  matches.sort((a, b) => a.start - b.start)

  const cleaned: Match[] = []
  let lastEnd = 0
  for (const m of matches) {
    if (m.start >= lastEnd) {
      cleaned.push(m)
      lastEnd = m.end
    }
  }

  const segments: { text: string; highlighted?: boolean }[] = []
  let cursor = 0
  for (const m of cleaned) {
    if (m.start > cursor) segments.push({ text: passage.slice(cursor, m.start) })
    segments.push({ text: passage.slice(m.start, m.end), highlighted: true })
    cursor = m.end
  }
  if (cursor < passage.length) segments.push({ text: passage.slice(cursor) })

  return segments
}

export default function SearchPrintPage() {
  const [data, setData] = useState<SearchPrintData | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('searchPrintData')
    if (raw) {
      setData(JSON.parse(raw))
    }
  }, [])

  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => window.print(), 300)
      return () => clearTimeout(timer)
    }
  }, [data])

  if (!data) {
    return <p className="p-8 text-sm text-gray-500">불러오는 중...</p>
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          🖨 인쇄하기
        </button>
      </div>

      <h1 className="mb-6 text-lg font-bold">
        {data.mode === 'exam' ? '발췌 시험문제' : '발췌 문제 정답 및 해설'}
      </h1>

      <div className="space-y-8">
        {data.groups.map((group, gIndex) => {
          const segments = buildPassageSegments(group.passage, group.items)
          return (
            <div key={gIndex} className="break-inside-avoid">
              <p className="mb-2 whitespace-pre-wrap text-sm leading-8">
                {segments.map((seg, idx) =>
                  seg.highlighted ? (
                    <span key={idx} className="underline decoration-2 underline-offset-2">
                      {seg.text}
                    </span>
                  ) : (
                    <span key={idx}>{seg.text}</span>
                  )
                )}
              </p>

              <div className="mt-4 space-y-5">
                {group.items.map((item) => (
                  <div key={item.number} className="break-inside-avoid">
                    {data.mode === 'exam' ? (
                      <>
                        {item.question_type.startsWith('essay_') && item.essay_meta?.wordBank && item.essay_meta.wordBank.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {item.essay_meta.wordBank.map((word, wIdx) => (
                              <span key={wIdx} className="rounded border border-gray-400 px-2 py-0.5 text-xs">
                                {word}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="mb-2 font-medium">
                          {item.number}. {item.question_text}
                        </p>
                        {item.question_type.startsWith('essay_') && item.essay_meta?.conditions && (
                          <p className="mb-2 rounded border border-dashed border-gray-400 p-2 text-xs text-gray-600">
                            조건: {item.essay_meta.conditions}
                          </p>
                        )}
                        {item.choices && item.choices.length > 0 ? (
                          <div className="space-y-1 pl-2">
                            {item.choices.map((choice, idx) => (
                              <p key={idx} className="text-sm">
                                {CHOICE_MARK[idx]} {choice}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2 pl-1">
                            {Array.from({ length: item.essay_meta?.answerLines || 2 }).map((_, lineIdx) => (
                              <div key={lineIdx} className="h-6 border-b border-black" />
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium">
                          {item.number}. 정답: {item.correct_answer}
                        </p>
                        {item.explanation && (
                          <p className="mt-1 text-sm text-gray-600">{item.explanation}</p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}