'use client'

import { useEffect, useState } from 'react'

interface StatsData {
  totalSets: number
  totalQuestions: number
  typeCount: Record<string, number>
  monthly: { month: string; count: number }[]
}

interface UsageData {
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  byRoute: Record<string, { calls: number; costUsd: number }>
  byModel: Record<string, { calls: number; costUsd: number }>
  monthly: { month: string; costUsd: number }[]
}

const ROUTE_LABELS: Record<string, string> = {
  'generate-ai-passage': 'AI 지문 생성',
  'generate-passage': '지문 생성',
  'generate-report': '보고서 문구 생성',
}

export default function ApiUsagePage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
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

    fetch('/api/api-usage')
      .then((r) => r.json())
      .then((json) => {
        if (!json.error) setUsage(json)
      })
      .catch(() => {})
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

  const maxMonthlyCost = usage ? Math.max(...usage.monthly.map((m) => m.costUsd), 0.0001) : 0.0001
  const routeEntries = usage ? Object.entries(usage.byRoute).sort((a, b) => b[1].costUsd - a[1].costUsd) : []

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">API 사용량 &amp; 통계</h1>

      {/* 실제 Claude API 비용 */}
      <h2 className="mb-3 text-sm font-semibold text-gray-500">AI 비용 사용량 (실제 Claude API)</h2>
      {!usage ? (
        <p className="mb-8 text-sm text-gray-400">불러오는 중…</p>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="이번 달 예상 비용"
              value={Number((usage.monthly[usage.monthly.length - 1]?.costUsd ?? 0).toFixed(2))}
              unit="달러"
              color="text-red-600"
            />
            <StatCard
              label="누적 예상 비용"
              value={Number(usage.totalCostUsd.toFixed(2))}
              unit="달러"
              color="text-amber-600"
            />
            <StatCard
              label="총 API 호출"
              value={usage.totalCalls}
              unit="회"
              color="text-blue-600"
            />
            <StatCard
              label="총 토큰 사용량"
              value={usage.totalInputTokens + usage.totalOutputTokens}
              unit="토큰"
              color="text-purple-600"
            />
          </div>

          <div className="mb-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">월별 예상 비용 (최근 6개월)</h3>
              <div className="space-y-3">
                {usage.monthly.map((m) => (
                  <div key={m.month}>
                    <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                      <span>{m.month}</span>
                      <span className="font-medium text-gray-700">${m.costUsd.toFixed(2)}</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-red-400 transition-all duration-500"
                        style={{ width: `${(m.costUsd / maxMonthlyCost) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">기능별 사용 내역</h3>
              {routeEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">아직 호출 기록이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {routeEntries.map(([route, v]) => (
                    <div key={route} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{ROUTE_LABELS[route] ?? route}</span>
                      <span className="text-gray-800">
                        {v.calls}회 · ${v.costUsd.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="mb-8 text-xs text-gray-400">
            ※ Anthropic 공식 요금표 기준 추정치이며, 실제 청구 금액은 환율·부가세 등에 따라 다를 수 있어요. 정확한 금액은 Anthropic 콘솔에서 확인해주세요.
          </p>
        </>
      )}

      <h2 className="mb-3 text-sm font-semibold text-gray-500">콘텐츠 생성 통계</h2>

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
        ※ 위 콘텐츠 통계는 저장된 지문·문항 개수 기준이며, 실제 AI 비용은 위쪽 &quot;AI 비용 사용량&quot; 항목을 참고해주세요.
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
