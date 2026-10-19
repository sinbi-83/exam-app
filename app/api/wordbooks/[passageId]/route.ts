import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { selectAllPages } from '@/lib/supabasePaging'
import { buildWordbookDraft, cleanWordbookWords, type BankEntryLite } from '@/lib/wordbook'
import type { WordbookWord } from '@/types/wordbook'

// 지문 단어장 (passage_wordbooks, passage-wordbooks-migration.sql). AI API 를 호출하지 않는다.
// GET: 지문 정보 + 저장된 단어장(있으면) + 지문 🔵 단어로 만든 자동 초안(단어은행 뜻 채움)
// PUT: 단어장 저장 { words } / DELETE: 저장한 단어장 지우기 (자동 초안으로 돌아감)

// 표를 아직 안 만들었을 때 (SQL Editor 에서 passage-wordbooks-migration.sql 한 줄 실행 전)
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || (error.message ?? '').includes('passage_wordbooks')
}
const MISSING_TABLE_MESSAGE = '단어장 저장 표(passage_wordbooks)가 아직 없습니다. Supabase SQL Editor 에서 passage-wordbooks-migration.sql 의 한 줄 SQL 을 실행해 주세요.'

export async function GET(_request: NextRequest, { params }: { params: { passageId: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data: passage, error: passageError } = await supabase
    .from('passages')
    .select('id, title, level, topic, group_id, variant_level, tagged_body')
    .eq('id', params.passageId)
    .eq('user_id', user.id)
    .single()
  if (passageError || !passage) return NextResponse.json({ error: '해당 지문을 찾을 수 없습니다.' }, { status: 404 })

  const { data: bank, error: bankError } = await selectAllPages((from, to) =>
    supabase
      .from('vocabulary_entries')
      .select('expression, lemma, pos, meaning_ko, status')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .in('status', ['approved', 'pending'])
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (bankError) return NextResponse.json({ error: bankError.message }, { status: 500 })
  const draft = buildWordbookDraft(passage.tagged_body ?? '', (bank ?? []) as BankEntryLite[])

  const { data: saved, error: savedError } = await supabase
    .from('passage_wordbooks')
    .select('words, updated_at')
    .eq('user_id', user.id)
    .eq('passage_id', params.passageId)
    .maybeSingle()
  const tableMissing = isMissingTable(savedError)
  if (savedError && !tableMissing) return NextResponse.json({ error: savedError.message }, { status: 500 })

  const { tagged_body: _body, ...info } = passage
  return NextResponse.json({
    data: {
      passage: info,
      draft,
      saved: saved ? { words: saved.words as WordbookWord[], updated_at: saved.updated_at } : null,
      tableMissing,
    },
  })
}

export async function PUT(request: NextRequest, { params }: { params: { passageId: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const payload = await request.json().catch(() => null)
  if (!payload || !Array.isArray(payload.words)) return NextResponse.json({ error: 'words 목록이 필요합니다.' }, { status: 400 })
  const words = cleanWordbookWords(payload.words)
  if (words.length === 0) return NextResponse.json({ error: '단어가 하나 이상 있어야 저장할 수 있습니다.' }, { status: 400 })

  const { data: passage } = await supabase.from('passages').select('id').eq('id', params.passageId).eq('user_id', user.id).maybeSingle()
  if (!passage) return NextResponse.json({ error: '해당 지문을 찾을 수 없습니다.' }, { status: 404 })

  const { data, error } = await supabase
    .from('passage_wordbooks')
    .upsert(
      { user_id: user.id, passage_id: params.passageId, words, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,passage_id' },
    )
    .select('words, updated_at')
    .single()
  if (isMissingTable(error)) return NextResponse.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_request: NextRequest, { params }: { params: { passageId: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { error } = await supabase.from('passage_wordbooks').delete().eq('user_id', user.id).eq('passage_id', params.passageId)
  if (isMissingTable(error)) return NextResponse.json({ ok: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
