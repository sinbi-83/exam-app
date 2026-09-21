'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { TYPE_LABELS, getTypeColor } from '@/lib/analyticsShared'

interface ClassTrendPoint {
  examId: string
  examTitle: string
  examDate: string | null
  classAverage: number
  studentCount: number
}

interface StudentHistoryPoint {
  examTitle: string
  examDate: string
  score: number
  maxScore: number
  percent: number
}

interface StudentEntry {
  name: string
  grade: string
  history: StudentHistoryPoint[]
}

interface TopicStat {
  type: string
  total: number
  wrong: number
  correctPct: number
}

interface ExamCard {
  examId: string
  title: string
  examDate: string | null
  maxScore: number | null
  count: number
  average: number | null
  highest: { name: string; score: number } | null
  lowest: { name: string; score: number } | null
}

interface AnalyticsData {
  classTrend: ClassTrendPoint[]
  perStudent: Record<string, StudentEntry>
  topicStats: TopicStat[]
  examCards: ExamCard[]
  kpis: {
    classAverage: number | null
    mostImprovedStudent: { name: string; delta: number } | null
    mostCommonWeakTopic: string | null
    examCount: number
    studentCount: number
  }
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error)
          return
        }
        setData(json)
        const withHistory = Object.entries(json.perStudent as Record<string, StudentEntry>)
          .filter(([, s]) => s.history.length > 0)
        if (withHistory.length > 0) setSelectedStudentId(withHistory[0][0])
      })
      .catch(() => setError('서버와 통신 중 문제가 발생했어요.'))
      .finally(() => setLoading(false))
  }, [])

  const studentChartData = useMemo(() => {
    if (!data || !selectedStudentId) return []
    const student = data.perStudent[selectedStudentId]
    if (!student) return []
    const classByTitle = new Map(data.classTrend.map((c) => [c.examTitle, c.classAverage]))
    return student.history.map((h) => ({
      title: h.examTitle,
      percent: h.percent,
      scoreLabel: `${h.score}/${h.maxScore}`,
      classAverage: classByTitle.get(h.examTitle) ?? null,
    }))
  }, [data, selectedStudentId])

  const classChartData = useMemo(() => {
    if (!data) return []
    return data.classTrend.map((c) => ({
      title: c.examTitle,
      percent: c.classAverage,
      scoreLabel: `응시 ${c.studentCount}명`,
    }))
  }, [data])

  if (loading) return <p className="p-8 text-sm text-gray-500">불러오는 중...</p>
  if (error) return <p className="p-8 text-sm text-red-500">{error}</p>
  if (!data) return null

  const studentOptions = Object.entries(data.perStudent).filter(([, s]) => s.history.length > 0)

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">성적분석</h1>

      {data.examCards.length === 0 ? (
        <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">
            아직 만들어진 시험 카드가 없습니다. 채점관리에서 시험 카드를 먼저 만들어보세요.
          </p>
        </div>
      ) : (
        <>
          {/* KPI 타일 */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="반 평균" value={data.kpis.classAverage != null ? `${data.kpis.classAverage}%` : '-'} color="text-blue-600" />
            <StatCard
              label="최고 향상 학생"
              value={data.kpis.mostImprovedStudent ? `${data.kpis.mostImprovedStudent.name} (+${data.kpis.mostImprovedStudent.delta}%)` : '-'}
              color="text-green-600"
            />
            <StatCard
              label="최다 취약 유형"
              value={data.kpis.mostCommonWeakTopic ? TYPE_LABELS[data.kpis.mostCommonWeakTopic] ?? data.kpis.mostCommonWeakTopic : '없음'}
              color="text-red-600"
            />
            <StatCard label="응시 시험 수" value={String(data.kpis.examCount)} color="text-purple-600" />
          </div>

          {/* 반 전체 추이 */}
          {classChartData.length >= 2 && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">반 전체 성적 추이</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={classChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="title" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(value, _name, props) => [`${props.payload.scoreLabel} (${value}%)`, '반 평균']} />
                  <Line type="monotone" dataKey="percent" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 학생별 추이 */}
          {studentOptions.length > 0 && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700">학생별 성적 추이</p>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1 text-sm"
                >
                  {studentOptions.map(([id, s]) => (
                    <option key={id} value={id}>{s.name}</option>
                  ))}
                </select>
              </div>
              {studentChartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={studentChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="title" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(value, _name, props) => [`${props.payload.scoreLabel} (${value}%)`, '점수']} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="percent" name="학생" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="classAverage" name="반 평균" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-6 text-center text-sm text-gray-400">추이를 보려면 성적이 2개 이상 필요합니다.</p>
              )}
            </div>
          )}

          {/* 유형별 취약점 */}
          {data.topicStats.length > 0 && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">유형별 취약점 (전체 시험 통합)</h2>
              <div className="space-y-3">
                {data.topicStats.map((t) => {
                  const colors = getTypeColor(t.correctPct)
                  return (
                    <div key={t.type}>
                      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                        <span className={`font-medium ${colors.text}`}>{TYPE_LABELS[t.type] ?? t.type}</span>
                        <span className={`font-semibold ${colors.text}`}>{t.correctPct}% ({t.total - t.wrong}/{t.total})</span>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full ${colors.bar} transition-all duration-500`} style={{ width: `${t.correctPct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 시험별 카드 목록 */}
          <div className="space-y-4">
            {data.examCards.map((exam) => (
              <div key={exam.examId} className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-800">{exam.title}</p>
                    <p className="text-xs text-gray-400">
                      {exam.examDate || '날짜 없음'} · 만점 {exam.maxScore ?? '?'}점
                    </p>
                  </div>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">응시 {exam.count}명</span>
                </div>

                {exam.count === 0 ? (
                  <p className="text-sm text-gray-400">아직 이 시험에 연결된 성적이 없습니다.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 rounded bg-gray-50 p-3 text-center">
                    <div>
                      <p className="text-xs text-gray-400">평균</p>
                      <p className="text-lg font-semibold text-gray-800">{exam.average}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">최고점</p>
                      <p className="text-lg font-semibold text-green-600">
                        {exam.highest?.name} ({exam.highest?.score}점)
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">최저점</p>
                      <p className="text-lg font-semibold text-orange-500">
                        {exam.lowest?.name} ({exam.lowest?.score}점)
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
