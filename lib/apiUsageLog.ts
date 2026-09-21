import type { SupabaseClient } from '@supabase/supabase-js'

// $ / 1M 토큰. Anthropic 공식 요금표 기준.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-5': { input: 2.0, output: 10.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}

export async function logApiUsage(
  supabase: SupabaseClient,
  params: { userId: string | null; route: string; model: string; inputTokens: number; outputTokens: number }
) {
  if (!params.userId) return

  const { error } = await supabase.from('api_usage_logs').insert({
    user_id: params.userId,
    route: params.route,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
  })

  if (error) {
    console.error('API 사용량 로그 저장 실패:', error.message)
  }
}
