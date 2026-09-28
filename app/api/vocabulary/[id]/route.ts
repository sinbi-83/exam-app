import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { canTransition, isSelectableRejectReason, vocabularyDbErrorMessage } from '@/lib/vocabulary'
import { REVIEW_DONE_REF_PREFIX, REVIEW_NOTE_ONLY_REF_PREFIX, reviewNoteText } from '@/lib/vocabularyCalibration'
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
//         action?: 'approve'(사용하기) | 'defer'(나중에 결정) | 'reject'(영구 제외) | 'archive'(사용 중단)
//                | 'restore'(다시 사용하기) | 'reopen'(다시 검토하기), reject_reason?, reject_note?,
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
  if (action === 'defer') {
    // 나중에 결정: 상태는 '확인 필요' 그대로, 보류 표시만 켠다
    if (current.status !== 'pending' || current.deferred_at !== null) {
      return NextResponse.json({ error: '확인 필요 상태의 단어만 나중에 결정으로 미룰 수 있습니다.' }, { status: 400 })
    }
    update.deferred_at = new Date().toISOString()
  } else if (action) {
    const to: Record<string, VocabularyStatus> = {
      approve: 'approved', reject: 'rejected', archive: 'archived', restore: 'approved', reopen: 'pending',
    }
    const next = to[action]
    if (!next || !canTransition(current.status, next)) {
      return NextResponse.json({ error: '지금 상태에서는 할 수 없는 작업입니다.' }, { status: 400 })
    }
    update.status = next
    // 보류 표시는 확인 필요 상태에서만 남는다 → 다른 상태로 가면 지운다
    if (next !== 'pending') update.deferred_at = null
    if (action === 'approve') {
      const difficulty = update.base_difficulty !== undefined ? update.base_difficulty : current.base_difficulty
      if (difficulty === null) return NextResponse.json({ error: '사용하려면 난이도를 먼저 입력하세요.' }, { status: 400 })
      update.approval_origin = 'individual'
      update.reject_reason = null
      update.reject_note = null
    }
    if (action === 'reject') {
      // 영구 제외 이중 안전장치 1: 사유 필수 (새 사유 목록만. '너무 쉬움' 등 예전 사유는 새로 고를 수 없다)
      const reason = body.reject_reason as VocabularyRejectReason
      if (!isSelectableRejectReason(reason)) {
        return NextResponse.json({ error: '영구 제외 사유를 선택하세요.' }, { status: 400 })
      }
      update.reject_reason = reason
      update.reject_note = body.reject_note ? String(body.reject_note).trim() || null : null
      // 사용 중단 → 영구 제외: 아카이브 표시를 지운다 (DB: archived 상태와 archived_at 은 짝)
      update.archived_at = null
    }
    if (action === 'reopen') {
      update.reject_reason = null
      update.reject_note = null
      update.deferred_at = null
    }
    if (action === 'archive') update.archived_at = new Date().toISOString()
    if (action === 'restore') update.archived_at = null
  }

  // review: true = "검수 완료 / 현재 기준 맞음" — 바꾼 값이 없어도 검수 완료만 기록한다
  const reviewDone = body.review === true
  if (Object.keys(update).length === 0 && !reviewDone) {
    return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 })
  }
  // 교사가 값을 저장한 시각 = 교사값 보호용 (검수 완료 여부와는 별개. 검수 완료는 아래 teacher-review 기록)
  update.teacher_reviewed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: vocabularyDbErrorMessage(error) }, { status: 400 })

  // 출처 기록 표에 한 줄 추가만 한다 (새 DB 칸 없이, 기존 기록은 건드리지 않음)
  //  - 검수 완료: teacher-review 행을 이유가 없어도 남긴다 → 이것이 "검수 완료" 집계·필터의 기준
  //  - 수정만 저장 + 판단 이유: teacher-note 행 (검수 완료로 세지 않음)
  const note = reviewNoteText(body.review_reason, body.review_note)
  if (reviewDone || note) {
    const prefix = reviewDone ? REVIEW_DONE_REF_PREFIX : REVIEW_NOTE_ONLY_REF_PREFIX
    const { data: record, error: noteError } = await supabase
      .from('vocabulary_sources')
      .insert({
        user_id: user.id,
        entry_id: params.id,
        source_type: 'teacher',
        source_ref: `${prefix}${update.teacher_reviewed_at}`,
        suggested_difficulty: data.base_difficulty,
        rationale: note ?? '검수 완료',
        created_by: 'teacher',
      })
      .select('source_type, source_ref, created_by')
      .single()
    if (noteError) {
      // 검수 완료 기록이 없으면 화면이 다음 단어로 넘어가면 안 된다 → 오류로 돌려준다
      if (reviewDone) return NextResponse.json({ error: `값은 저장됐지만 검수 완료 기록 실패: ${noteError.message}` }, { status: 500 })
      return NextResponse.json({ data, warning: `값은 저장됐지만 검수 메모 저장 실패: ${noteError.message}` })
    }
    return NextResponse.json({ data, record })
  }
  return NextResponse.json({ data })
}
