import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const days = Number(searchParams.get('days') ?? 2)

  const now = new Date()
  const from = toISODate(now)
  const to = toISODate(new Date(now.getTime() + days * 24 * 60 * 60 * 1000))

  const { data, error } = await supabase
    .from('schedule_events')
    .select('*')
    .eq('user_id', user.id)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, today: from })
}
