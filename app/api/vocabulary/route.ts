import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// GET: 단어은행 목록 (삭제된 항목 제외). ?status=approved 등으로 상태 필터, ?q= 로 표현/뜻 검색
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const q = searchParams.get('q')?.trim()

  let query = supabase
    .from('vocabulary_entries')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('expression_key', { ascending: true })
    .limit(2000)

  if (status && status !== 'all') query = query.eq('status', status)
  if (q) {
    // PostgREST or 필터 안에서 쓰이는 글자(, . ( ) *)는 검색어에서 뺀다
    const safe = q.replace(/[,.()*%]/g, ' ').trim()
    if (safe) query = query.or(`expression.ilike.%${safe}%,meaning_ko.ilike.%${safe}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
