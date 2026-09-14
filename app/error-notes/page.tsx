'use client'

import { useEffect, useState } from 'react'

interface Student {
  id: string
  name: string
  grade: string
}

interface ExamResult {
  id: string
  exam_title: string
  score: number
  max_score: number
  exam_date: string
  created_at: string
  students?: { name: string }
}

export default function ErrorNotesPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [selected, setSelected] = useState<string>('all')
  const [results, setResults] = useState<ExamResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/students').then((r) => r.json()).then((j) => setStudents(j.data ?? []))
    loadResults()
  }, [])

  useEffect(() => { loadResults() }, [selected])

  async function loadResults() {
    setLoading(true)
    const res = await fetch('/api/exam-results')
    const json = await res.json()
    let data: ExamResult[] = json.data ?? []
    if (selected !== 'all') data = data.filter((r) => r.students ? true : false).filter((r: any) => r.student_id === selected)
    setResults(data)
    setLoading(false)
  }

  // 시험별 성취율 계산
  const resultsByExam: Record<string, ExamResult[]> = {}
  results.forEach((r) => {
    if (!resultsByExam[r.exam_title]) resultsByExam[r.exam_title] = []
    resultsByExam[r.exam_title].push(r)
  })

  function getPct(r: ExamResult) {
    return r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0
  }

  function getColor(pct: number) {
    return pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-blue-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'
  }

  function getBarColor(pct: number) {
    return pct >= 80 ? 'bg-green-400' : pct >= 60 ? 'bg-blue-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
  }

  // 학생별 성적 요약 (전체 보기)
  const studentSummary: Record<string, { name: string; avg: number; low: string[] }> = {}
  if (selected === 'all') {
    results.forEach((r: any) => {
      const sid = r.student_id
      const name = r.students?.name ?? '?'
      if (!studentSummary[sid]) studentSummary[sid] = { name, avg: 0, low: [] }
      const pct = getPct(r)
      if (pct < 60) studentSummary[sid].low.push(r.exam_title)
    })
    Object.values(studentSummary).forEach((s) => {
      const sResults = results.filter((r: any) => {
        const name = r.students?.name
        return name === s.name
      })
      s.avg = sResults.length > 0
        ? Math.round(sResults.reduce((acc, r) => acc + getPct(r), 0) / sResults.length)
        : 0
    })
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">오답 노트</h1>
      <p className="mb-6 text-sm text-gray-500">채점 결과를 분석해 부진한 시험을 파악하세요.</p>

      {/* 학생 선택 */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelected('all')}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
            selected === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          전체 학생
        </button>
        {students.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
              selected === s.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">분석 중…</div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">채점 결과가 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">채점관리에서 성적을 먼저 입력해주세요.</p>
        </div>
      ) : selected === 'all' ? (
        /* 전체 학생 요약 */
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-600">📊 학생별 성적 현황</h2>
          {Object.entries(studentSummary).map(([sid, s]) => {
            const sResults = results.filter((r: any) => r.students?.name === s.name)
            return (
              <div key={sid} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{s.name}</span>
                    {s.low.length > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                        ⚠️ 부진 {s.low.length}개
                      </span>
                    )}
                  </div>
                  <span className={`text-lg font-bold ${getColor(s.avg)}`}>{s.avg}%</span>
                </div>
                <div className="space-y-2">
                  {sResults.slice(0, 5).map((r) => {
                    const pct = getPct(r)
                    return (
                      <div key={r.id}>
                        <div className="mb-0.5 flex justify-between text-xs text-gray-500">
                          <span className="truncate">{r.exam_title}</span>
                          <span className={`ml-2 shrink-0 font-medium ${getColor(pct)}`}>{r.score}/{r.max_score} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full rounded-full ${getBarColor(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {s.low.length > 0 && (
                  <div className="mt-3 rounded bg-red-50 px-3 py-2">
                    <p className="text-xs text-red-600">
                      <strong>60점 미만 시험:</strong> {s.low.join(', ')}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* 개별 학생 상세 */
        <div className="space-y-4">
          {(() => {
            const student = students.find((s) => s.id === selected)
            const avg = results.length > 0 ? Math.round(results.reduce((acc, r) => acc + getPct(r), 0) / results.length) : 0
            return (
              <>
                <div className={`rounded-lg border p-4 text-center ${getColor(avg).replace('text-', 'border-').replace('-600', '-200')} bg-white`}>
                  <p className="text-sm text-gray-500">{student?.name} 평균 성취율</p>
                  <p className={`text-4xl font-black ${getColor(avg)}`}>{avg}%</p>
                  <p className="text-xs text-gray-400">{results.length}회 시험 기준</p>
                </div>
                <h2 className="text-sm font-semibold text-gray-600">시험별 성적</h2>
                {results.map((r) => {
                  const pct = getPct(r)
                  return (
                    <div key={r.id} className={`rounded-lg border bg-white p-4 ${pct < 60 ? 'border-red-200' : 'border-gray-200'}`}>
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800">{r.exam_title}</p>
                          <p className="text-xs text-gray-400">{r.exam_date}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-bold ${getColor(pct)}`}>{pct}%</p>
                          <p className="text-xs text-gray-400">{r.score}/{r.max_score}점</p>
                        </div>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full ${getBarColor(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      {pct < 60 && (
                        <p className="mt-2 text-xs text-red-500">⚠️ 집중 보완이 필요한 시험입니다.</p>
                      )}
                    </div>
                  )
                })}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
