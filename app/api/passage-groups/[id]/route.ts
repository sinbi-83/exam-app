import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

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
