import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { selectAllPages } from '@/lib/supabasePaging'

// GET: 단어은행 목록 (삭제된 항목 제외). ?status=approved 등으로 상태 필터, ?q= 로 표현/뜻 검색
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const q = searchParams.get('q')?.trim()

  // PostgREST or 필터 안에서 쓰이는 글자(, . ( ) *)는 검색어에서 뺀다
  const safe = q ? q.replace(/[,.()*%]/g, ' ').trim() : ''

  // Supabase 는 한 번에 1,000행만 돌려준다 → 나눠 읽는다 (lib/supabasePaging.ts). id 로 순서를 고정해야 줄이 빠지거나 겹치지 않는다.
  const { data, error } = await selectAllPages((from, to) => {
    let query = supabase
      .from('vocabulary_entries')
      // 출처 식별값도 함께 (seed / Floor·Ceiling anchor 표시용)
      .select('*, vocabulary_sources(source_type, source_ref, created_by)')
      .eq('user_id', user.id)
      .is('deleted_at', null)
    if (status && status !== 'all') query = query.eq('status', status)
    if (safe) query = query.or(`expression.ilike.%${safe}%,meaning_ko.ilike.%${safe}%`)
    return query.order('expression_key', { ascending: true }).order('id', { ascending: true }).range(from, to)
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
