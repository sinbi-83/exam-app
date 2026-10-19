import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// GET: 저장된 지문 단어장 요약 (지문 단어장 목록의 '저장됨 N개' 표시용)
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase
    .from('passage_wordbooks')
    .select('passage_id, words, updated_at')
    .eq('user_id', user.id)
  if (error) {
    const missing = error.code === '42P01' || error.code === 'PGRST205' || (error.message ?? '').includes('passage_wordbooks')
    if (missing) return NextResponse.json({ data: [], tableMissing: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const summary = (data ?? []).map((r) => ({
    passage_id: r.passage_id as string,
    word_count: Array.isArray(r.words) ? r.words.length : 0,
    updated_at: r.updated_at as string,
  }))
  return NextResponse.json({ data: summary, tableMissing: false })
}
