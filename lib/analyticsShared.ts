export const TYPE_LABELS: Record<string, string> = {
  vocab: '어휘',
  grammar: '어법',
  reading: '독해',
  essay: '서술형',
  summary: '지문요약',
  word: '단어',
}

export function getTypeColor(pct: number) {
  if (pct >= 80) return { bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-400', badge: '✅ 우수' }
  if (pct >= 60) return { bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-400', badge: '🔵 보통' }
  if (pct >= 40) return { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-400', badge: '⚠️ 주의' }
  return { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-400', badge: '❌ 취약' }
}

export interface TypeStat {
  type: string
  total: number
  wrong: number
  points: number
  wrongPoints: number
  correctPct: number
}

export function computeTypeStats(
  questions: { id: string; points: number; question_data: { type: string } }[],
  wrongIds: Set<string>
): TypeStat[] {
  const typeMap: Record<string, { total: number; wrong: number; points: number; wrongPoints: number }> = {}
  for (const q of questions) {
    const t = q.question_data.type
    if (!typeMap[t]) typeMap[t] = { total: 0, wrong: 0, points: 0, wrongPoints: 0 }
    typeMap[t].total++
    typeMap[t].points += q.points
    if (wrongIds.has(q.id)) { typeMap[t].wrong++; typeMap[t].wrongPoints += q.points }
  }

  return Object.entries(typeMap)
    .map(([type, stat]) => ({
      type, ...stat,
      correctPct: stat.total > 0 ? Math.round(((stat.total - stat.wrong) / stat.total) * 100) : 100,
    }))
    .sort((a, b) => a.correctPct - b.correctPct)
}
