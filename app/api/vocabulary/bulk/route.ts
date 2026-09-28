import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { planBulkApprove } from '@/lib/vocabulary'
import { chunk } from '@/lib/supabasePaging'
import type { VocabularyEntryRecord } from '@/types/vocabulary'

// POST: 여러 단어를 한 번에 '사용하기' (교사가 화면에서 골라 누른 것)
// body: { action: 'approve', ids: string[] }
// - '확인 필요'(나중에 결정 포함)이고 난이도가 있는 항목만 바꾼다. 나머지는 건너뛰고 이유를 돌려준다.
// - 승인 경로 'batch'(일괄 승인), 교사 확인 시각을 남긴다 (교사가 직접 누른 것이므로).
const MAX_IDS = 5000
const ID_CHUNK = 200

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  if (body.action !== 'approve') return NextResponse.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 })
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: '선택한 단어가 없습니다.' }, { status: 400 })
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `한 번에 ${MAX_IDS}개까지 할 수 있습니다.` }, { status: 400 })

  // id 를 한 번에 너무 많이 넣으면 주소(URL)가 길어져 실패한다 → ID_CHUNK 개씩 나눠 읽고 나눠 바꾼다
  type Row = Pick<VocabularyEntryRecord, 'id' | 'status' | 'base_difficulty' | 'deleted_at'>
  const rows: Row[] = []
  for (const part of chunk(ids, ID_CHUNK)) {
    const { data, error } = await supabase
      .from('vocabulary_entries')
      .select('id, status, base_difficulty, deleted_at')
      .eq('user_id', user.id)
      .in('id', part)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...((data ?? []) as Row[]))
  }

  const plan = planBulkApprove(ids, rows)
  if (plan.approve.length === 0) return NextResponse.json({ data: { approved: 0, skipped: plan.skipped } })

  const now = new Date().toISOString()
  const updated: VocabularyEntryRecord[] = []
  for (const part of chunk(plan.approve, ID_CHUNK)) {
    const { data, error: upError } = await supabase
      .from('vocabulary_entries')
      .update({
        status: 'approved',
        approval_origin: 'batch',
        deferred_at: null,
        reject_reason: null,
        reject_note: null,
        teacher_reviewed_at: now,
      })
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .in('id', part)
      .select('*')
    if (upError) {
      // 앞 묶음은 이미 바뀌었을 수 있다 → 바뀐 것은 돌려주고 오류를 알린다
      return NextResponse.json(
        { error: `${updated.length}개까지 바꾼 뒤 실패했습니다: ${upError.message}`, data: { approved: updated.length, entries: updated } },
        { status: 400 },
      )
    }
    updated.push(...((data ?? []) as VocabularyEntryRecord[]))
  }

  return NextResponse.json({ data: { approved: updated.length, entries: updated, skipped: plan.skipped } })
}
