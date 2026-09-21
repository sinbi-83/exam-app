import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { estimateCostUsd } from '@/lib/apiUsageLog'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: logs, error } = await supabase
    .from('api_usage_logs')
    .select('route, model, input_tokens, output_tokens, created_at')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = logs ?? []

  let totalCalls = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCostUsd = 0

  const byRoute: Record<string, { calls: number; costUsd: number }> = {}
  const byModel: Record<string, { calls: number; costUsd: number }> = {}

  const now = new Date()
  const monthlyMap: Record<string, number> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = 0
  }

  for (const log of rows) {
    const cost = estimateCostUsd(log.model, log.input_tokens, log.output_tokens)

    totalCalls += 1
    totalInputTokens += log.input_tokens
    totalOutputTokens += log.output_tokens
    totalCostUsd += cost

    if (!byRoute[log.route]) byRoute[log.route] = { calls: 0, costUsd: 0 }
    byRoute[log.route].calls += 1
    byRoute[log.route].costUsd += cost

    if (!byModel[log.model]) byModel[log.model] = { calls: 0, costUsd: 0 }
    byModel[log.model].calls += 1
    byModel[log.model].costUsd += cost

    const monthKey = log.created_at.slice(0, 7)
    if (monthKey in monthlyMap) monthlyMap[monthKey] += cost
  }

  const monthly = Object.entries(monthlyMap).map(([month, costUsd]) => ({ month, costUsd }))

  return NextResponse.json({
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    byRoute,
    byModel,
    monthly,
  })
}
