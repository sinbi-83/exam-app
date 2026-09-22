import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase
    .from('passages')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: '해당 지문을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const payload = await request.json()
  const { title, level, topic, body, tagged_body, tags, questions, essays, archived } = payload

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title !== undefined) update.title = title
  if (level !== undefined) update.level = level
  if (topic !== undefined) update.topic = topic
  if (body !== undefined) update.body = body
  if (tagged_body !== undefined) update.tagged_body = tagged_body
  if (tags !== undefined) update.tags = tags
  if (questions !== undefined) update.questions = questions
  if (essays !== undefined) update.essays = essays
  // 보관/복원: archived 와 archived_at 은 항상 같이 바꾼다 (DB 제약과 동일한 규칙).
  if (archived !== undefined) {
    update.archived = archived
    update.archived_at = archived ? new Date().toISOString() : null
  }

  const { data, error } = await supabase
    .from('passages')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    // 그룹에 속한 지문을 개별 보관하려고 하면 DB 제약(passages_group_archived_check)이 막아준다.
    if (error.message.includes('passages_group_archived_check')) {
      return NextResponse.json(
        { error: '그룹에 속한 지문은 개별적으로 보관할 수 없습니다. 세트(그룹) 단위로 보관해주세요.' },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { error } = await supabase
    .from('passages')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
