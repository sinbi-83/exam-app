import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level')
  const topic = searchParams.get('topic')

  let query = supabase
    .from('passages')
    .select('id, title, level, topic, tags, created_at, updated_at')
    .eq('user_id', user.id)

  if (level) query = query.eq('level', level)
  if (topic) query = query.ilike('topic', `%${topic}%`)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
