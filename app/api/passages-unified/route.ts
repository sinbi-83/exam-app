import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { selectAllPages } from '@/lib/supabasePaging'
import { aiSetToRow, externalToRow, sortUnifiedRows, type AiSetLike } from '@/lib/passageUnified'

// 6단계 B: 지문 통합 목록 (읽기 전용). AI 지문(question_sets) + 외부지문(passages)을 각각 읽어 한 줄 모양으로 맞춘다.
// 두 표는 합치지 않고, 쓰기(수정·삭제·보관)는 하지 않는다 → 원래 화면 링크(href)만 준다.
// 1,000행 제한 → 나눠 읽기 (lib/supabasePaging.ts). 정답·본문은 내려보내지 않는다.
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const [ai, ext] = await Promise.all([
    selectAllPages<AiSetLike>((from, to) =>
      supabase
        .from('question_sets')
        .select('id, grade, topic, created_at, questions, summary_questions, reading_questions, essay_questions')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
    selectAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from('passages')
        .select('id, title, level, variant_level, archived, created_at, questions, essays, passage_groups(archived)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
  ])
  if (ai.error) return NextResponse.json({ error: ai.error.message }, { status: 500 })
  if (ext.error) return NextResponse.json({ error: ext.error.message }, { status: 500 })

  const externalRows = ext.data.map((p) => {
    const g = p.passage_groups as { archived: boolean } | { archived: boolean }[] | null
    const group = Array.isArray(g) ? g[0] : g
    return externalToRow({
      id: p.id as string,
      title: p.title as string | null,
      level: p.level as string | null,
      variant_level: p.variant_level as string | null,
      archived: p.archived as boolean | null,
      group_archived: group ? group.archived : null,
      created_at: p.created_at as string,
      question_count: Array.isArray(p.questions) ? p.questions.length : 0,
      essay_count: Array.isArray(p.essays) ? p.essays.length : 0,
    })
  })

  return NextResponse.json({ data: sortUnifiedRows([...ai.data.map(aiSetToRow), ...externalRows]) })
}
