'use client'

import { useEffect, useState } from 'react'

interface StatsData {
  totalSets: number
  totalQuestions: number
  typeCount: Record<string, number>
  monthly: { month: string; count: number }[]
}

export default function ApiUsagePage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        else setStats(json)
      })
      .catch(() => setError('데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        불러오는 중…
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-600">
        {error ?? '데이터를 불러오지 못했습니다.'}
      </div>
    )
  }

  const maxMonthly = Math.max(...stats.monthly.map((m) => m.count), 1)
  const typeEntries = Object.entries(stats.typeCount).sort((a, b) => b[1] - a[1])
  const maxType = Math.max(...typeEntries.map((e) => e[1]), 1)

  const TYPE_COLORS: Record<string, string> = {
    어휘: 'bg-blue-400',
    어법: 'bg-purple-400',
    서술형: 'bg-amber-400',
    독해: 'bg-green-400',
    지문요약: 'bg-teal-400',
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">API 사용량 &amp; 통계</h1>

      {/* 요약 카드 */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="생성된 지문 세트"
          value={stats.totalSets}
          unit="개"
          color="text-blue-600"
        />
        <StatCard
          label="총 생성 문항"
          value={stats.totalQuestions}
          unit="문항"
          color="text-green-600"
        />
        <StatCard
          label="문항 유형 수"
          value={typeEntries.length}
          unit="종"
          color="text-purple-600"
        />
        <StatCard
          label="이번 달 지문"
          value={stats.monthly[stats.monthly.length - 1]?.count ?? 0}
          unit="개"
          color="text-amber-600"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 월별 지문 생성 */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">월별 지문 생성 수 (최근 6개월)</h2>
          <div className="space-y-3">
            {stats.monthly.map((m) => (
              <div key={m.month}>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span>{m.month}</span>
                  <span className="font-medium text-gray-700">{m.count}개</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-400 transition-all duration-500"
                    style={{ width: `${(m.count / maxMonthly) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 유형별 문항 수 */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">유형별 누적 문항 수</h2>
          {typeEntries.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">아직 생성된 문항이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {typeEntries.map(([type, count]) => (
                <div key={type}>
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                    <span>{type}</span>
                    <span className="font-medium text-gray-700">{count}문항</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${TYPE_COLORS[type] ?? 'bg-gray-400'}`}
                      style={{ width: `${(count / maxType) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        ※ AI 문항 생성 시마다 Anthropic Claude API가 호출됩니다. 현재 API 비용 집계는 Anthropic 콘솔에서 직접 확인해주세요.
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string
  value: number
  unit: string
  color: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>
        {value.toLocaleString()}
        <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>
      </p>
    </div>
  )
}
