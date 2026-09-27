import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { canTransition, VOCABULARY_REJECT_REASON_LABELS, vocabularyDbErrorMessage } from '@/lib/vocabulary'
import { REVIEW_NOTE_REF_PREFIX, reviewNoteText } from '@/lib/vocabularyCalibration'
import type { VocabularyEntryRecord, VocabularyRejectReason, VocabularyStatus } from '@/types/vocabulary'

// GET: 어휘 하나 + 출처 기록
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('*, vocabulary_sources(*)')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// PATCH: 교사 수정 / 상태 이동
// body: { meaning_ko?, accepted_meanings?, base_difficulty?, ko_en_allowed?,
//         action?: 'approve' | 'reject' | 'archive' | 'restore' | 'reopen', reject_reason?, reject_note?,
//         review?: true (값 변경 없이 검수 완료만), review_reason?, review_note? (검수 판단 이유, 선택) }
// 교사가 손댄 항목은 teacher_reviewed_at 을 남긴다 (이후 제작 스크립트가 값을 채우지 않는다).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data: current, error: loadError } = await supabase
    .from('vocabulary_entries')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single<VocabularyEntryRecord>()
  if (loadError || !current) return NextResponse.json({ error: '어휘를 찾을 수 없습니다.' }, { status: 404 })

  const body = await request.json()
  const update: Record<string, unknown> = {}

  if (body.meaning_ko !== undefined) {
    const m = String(body.meaning_ko).trim()
    if (!m) return NextResponse.json({ error: '대표 뜻이 비어 있습니다.' }, { status: 400 })
    update.meaning_ko = m
  }
  if (body.accepted_meanings !== undefined) {
    if (!Array.isArray(body.accepted_meanings)) return NextResponse.json({ error: '인정 뜻 형식이 올바르지 않습니다.' }, { status: 400 })
    update.accepted_meanings = body.accepted_meanings.map((m: unknown) => String(m).trim()).filter(Boolean)
  }
  if (body.base_difficulty !== undefined) {
    const d = body.base_difficulty
    if (d !== null && !(Number.isInteger(d) && d >= 1 && d <= 100)) {
      return NextResponse.json({ error: '난이도는 1~100 정수여야 합니다.' }, { status: 400 })
    }
    update.base_difficulty = d
  }
  if (body.ko_en_allowed !== undefined) update.ko_en_allowed = Boolean(body.ko_en_allowed)

  const action: string | undefined = body.action
  if (action) {
    const to: Record<string, VocabularyStatus> = {
      approve: 'approved', reject: 'rejected', archive: 'archived', restore: 'approved', reopen: 'pending',
    }
    const next = to[action]
    if (!next || !canTransition(current.status, next)) {
      return NextResponse.json({ error: '지금 상태에서는 할 수 없는 작업입니다.' }, { status: 400 })
    }
    update.status = next
    if (action === 'approve') {
      const difficulty = update.base_difficulty !== undefined ? update.base_difficulty : current.base_difficulty
      if (difficulty === null) return NextResponse.json({ error: '승인하려면 난이도를 먼저 입력하세요.' }, { status: 400 })
      update.approval_origin = 'individual'
      update.reject_reason = null
      update.reject_note = null
    }
    if (action === 'reject') {
      const reason = body.reject_reason as VocabularyRejectReason
      if (!reason || !(reason in VOCABULARY_REJECT_REASON_LABELS)) {
        return NextResponse.json({ error: '반려 사유를 선택하세요.' }, { status: 400 })
      }
      update.reject_reason = reason
      update.reject_note = body.reject_note ? String(body.reject_note).trim() || null : null
    }
    if (action === 'reopen') {
      update.reject_reason = null
      update.reject_note = null
    }
    if (action === 'archive') update.archived_at = new Date().toISOString()
    if (action === 'restore') update.archived_at = null
  }

  // review: true = "검수 완료 / 현재 기준 맞음" — 바꾼 값이 없어도 교사 확인만 기록한다
  if (Object.keys(update).length === 0 && body.review !== true) {
    return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 })
  }
  // 교사가 확인·수정한 시각. 이미 검수된 항목을 다시 고쳐도 검수 상태는 유지된다 (시각만 최신으로)
  update.teacher_reviewed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: vocabularyDbErrorMessage(error) }, { status: 400 })

  // 판단 이유(선택): 출처 기록 표에 "검수 메모" 한 줄을 추가만 한다 (새 DB 칸 없이, 기존 기록은 건드리지 않음)
  const note = reviewNoteText(body.review_reason, body.review_note)
  if (note) {
    const { error: noteError } = await supabase.from('vocabulary_sources').insert({
      user_id: user.id,
      entry_id: params.id,
      source_type: 'teacher',
      source_ref: `${REVIEW_NOTE_REF_PREFIX}${update.teacher_reviewed_at}`,
      suggested_difficulty: data.base_difficulty,
      rationale: note,
      created_by: 'teacher',
    })
    if (noteError) return NextResponse.json({ data, warning: `값은 저장됐지만 검수 메모 저장 실패: ${noteError.message}` })
  }
  return NextResponse.json({ data })
}
