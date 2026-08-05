'use client'

import { useEffect, useState } from 'react'

interface MultipleChoiceQuestion {
  targetText: string
  type: 'vocab' | 'grammar'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  choices: string[]
  correctIndex: number
  explanation: string
}

interface PrintData {
  mode: 'exam' | 'answer'
  passage: string
  questions: MultipleChoiceQuestion[]
}

const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

export default function PrintPage() {
  const [data, setData] = useState<PrintData | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('printData')
    if (raw) {
      setData(JSON.parse(raw))
    }
  }, [])

  useEffect(() => {
    if (data) {
      // 화면이 다 그려진 다음 인쇄 창을 띄움 (자동)
      const timer = setTimeout(() => {
        window.print()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [data])

  if (!data) {
    return <p className="p-8 text-sm text-gray-500">불러오는 중...</p>
  }

  return (
    <div className="mx-auto max-w-2xl p-8 print-area">
      {/* 인쇄 버튼: 화면에서만 보이고 실제 인쇄물에는 안 나옴 */}
      <div className="mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          🖨 인쇄하기
        </button>
      </div>

      {data.mode === 'exam' ? (
        <>
          <h1 className="mb-4 text-lg font-bold">영어 시험문제</h1>
          <p className="mb-6 whitespace-pre-wrap text-sm leading-8">{data.passage}</p>
          <div className="space-y-6">
            {data.questions.map((q, qIndex) => (
              <div key={qIndex}>
                <p className="mb-2 font-medium">
                  {qIndex + 1}. "{q.targetText}"의 의미로 가장 알맞은 것은?
                </p>
                <div className="space-y-1 pl-2">
                  {q.choices.map((choice, choiceIndex) => (
                    <p key={choiceIndex} className="text-sm">
                      {CHOICE_MARK[choiceIndex]} {choice}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <h1 className="mb-4 text-lg font-bold">정답 및 해설</h1>
          <div className="space-y-4">
            {data.questions.map((q, qIndex) => (
              <div key={qIndex}>
                <p className="text-sm font-medium">
                  {qIndex + 1}. "{q.targetText}" — 정답: {CHOICE_MARK[q.correctIndex]} {q.choices[q.correctIndex]}
                </p>
                {q.explanation && (
                  <p className="mt-1 text-sm text-gray-600">{q.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}