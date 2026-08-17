'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface ExamResultItem {
  exam_title: string
  score: number
  max_score: number
  exam_date: string
}

interface ReportData {
  found: boolean
  name: string
  grade: string
  results: ExamResultItem[]
}

export default function ParentReportPage() {
  const params = useParams()
  const studentId = params.id as string

  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<ReportData | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length !== 4) {
      setError('PIN 4자리를 입력해주세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/parent-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, pin }),
      })
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'PIN이 일치하지 않습니다.')
        return
      }

      setData(result.data)
    } catch {
      setError('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center">
          <h1 className="mb-2 text-lg font-semibold text-gray-800">성적 조회</h1>
          <p className="mb-6 text-sm text-gray-500">
            학원에서 받으신 PIN 번호 4자리를 입력해주세요.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0000"
              className="w-full rounded border border-gray-300 px-3 py-3 text-center text-2xl tracking-[0.5em]"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? '확인 중...' : '확인'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 그래프용 데이터: 날짜 오래된 순으로 정렬 + 점수를 백분율로 변환
  const chartData = [...data.results]
    .sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime())
    .map((r) => ({
      title: r.exam_title,
      date: r.exam_date,
      percent: Math.round((r.score / r.max_score) * 1000) / 10,
      scoreLabel: `${r.score}/${r.max_score}`,
    }))

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md">
        <h1 className="mb-1 text-xl font-semibold text-gray-800">{data.name} 학생 성적</h1>
        <p className="mb-6 text-sm text-gray-500">{data.grade}</p>

        {data.results.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            아직 등록된 시험 성적이 없습니다.
          </p>
        ) : (
          <>
            {chartData.length >= 2 && (
              <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
                <p className="mb-3 text-sm font-medium text-gray-700">성적 추이</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="title" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip
                      formatter={(value, _name, props) => [
                        `${props.payload.scoreLabel}점 (${value}%)`,
                        '점수',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="percent"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="space-y-3">
              {data.results.map((r, idx) => (
                <div key={idx} className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="font-medium text-gray-800">{r.exam_title}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-sm text-gray-500">{r.exam_date}</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {r.score}
                      <span className="text-sm text-gray-400">/{r.max_score}점</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}