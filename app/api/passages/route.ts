import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level')
  const topic = searchParams.get('topic')

  // 보관함(archived) 여부는 이 화면에서 걸러내지 않고 전부 내려준다.
  // 화면(전체 자료/보관함 탭)에서 단독 지문은 archived, 그룹 소속 지문은 passage_groups.archived 로 나눠서 걸러낸다.
  let query = supabase
    .from('passages')
    .select(
      'id, title, level, topic, tags, group_id, variant_level, archived, archived_at, created_at, updated_at, questions, essays, passage_groups(archived, archived_at)',
    )
    .eq('user_id', user.id)

  if (level) query = query.eq('level', level)
  if (topic) query = query.ilike('topic', `%${topic}%`)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 목록 화면에는 문제/서술형 "개수"만 필요하다. 본문 내용(정답 포함)을 통째로 내려보내지 않는다.
  const summarized = (data ?? []).map(({ questions, essays, passage_groups, ...rest }) => {
    const group = (Array.isArray(passage_groups) ? passage_groups[0] : passage_groups) as
      | { archived: boolean; archived_at: string | null }
      | null
    return {
      ...rest,
      group_archived: group?.archived ?? null,
      group_archived_at: group?.archived_at ?? null,
      question_count: Array.isArray(questions) ? questions.length : 0,
      essay_count: Array.isArray(essays) ? essays.length : 0,
    }
  })
  return NextResponse.json({ data: summarized })
}
