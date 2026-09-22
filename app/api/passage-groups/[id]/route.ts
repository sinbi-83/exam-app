import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// 묶음(4단계 세트) 보관/복원. 그룹 아래 4개 passage는 건드리지 않는다 —
// 보관 여부는 passage_groups.archived 하나로만 관리한다(그룹 자식은 개별 보관 금지).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const payload = await request.json()
  const { archived } = payload
  if (typeof archived !== 'boolean') {
    return NextResponse.json({ error: 'archived 값(true/false)이 필요합니다.' }, { status: 400 })
  }

  // 보관/복원: archived 와 archived_at 은 항상 같이 바꾼다 (DB 제약과 동일한 규칙).
  const update = {
    archived,
    archived_at: archived ? new Date().toISOString() : null,
  }

  const { data, error } = await supabase
    .from('passage_groups')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// 묶음(4단계 세트) 전체 삭제. passages.group_id 에 걸린 on delete cascade 덕분에
// 이 한 줄만 지우면 소속된 school/academy/advanced/prestudy 4개 지문도 함께 지워진다.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { error } = await supabase
    .from('passage_groups')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
