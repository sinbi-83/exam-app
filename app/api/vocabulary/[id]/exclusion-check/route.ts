import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { bandsContaining } from '@/config/vocabularyLevels'
import { VARIANT_LABELS } from '@/types/passageBank'
import { VOCABULARY_APPROVAL_ORIGIN_LABELS } from '@/lib/vocabulary'
import { countableSources } from '@/lib/vocabularyCalibration'
import { exclusionWarnings, type ExclusionFacts } from '@/lib/vocabularyExclusion'
import type { VocabularyEntryRecord } from '@/types/vocabulary'

// GET: 영구 제외 전 자동 경고문 (읽기만 한다. AI 호출 없음 — DB 조회 결과로만 만든다)
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data: entry, error } = await supabase
    .from('vocabulary_entries')
    .select('*, vocabulary_sources(source_type, source_ref)')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single<VocabularyEntryRecord & { vocabulary_sources: { source_type: string; source_ref: string }[] }>()
  if (error || !entry) return NextResponse.json({ error: '어휘를 찾을 수 없습니다.' }, { status: 404 })

  const [usage, siblings] = await Promise.all([
    supabase
      .from('exam_questions')
      .select('exam_id')
      .eq('user_id', user.id)
      .eq('question_data->>source_vocabulary_entry_id', entry.id),
    supabase
      .from('vocabulary_entries')
      .select('meaning_ko')
      .eq('user_id', user.id)
      .eq('expression_key', entry.expression_key)
      .neq('id', entry.id)
      .is('deleted_at', null),
  ])
  if (usage.error) return NextResponse.json({ error: usage.error.message }, { status: 500 })
  if (siblings.error) return NextResponse.json({ error: siblings.error.message }, { status: 500 })

  const sources = countableSources(entry.vocabulary_sources)
  const bands = entry.base_difficulty === null ? [] : bandsContaining(entry.base_difficulty, 'en_ko')

  const facts: ExclusionFacts = {
    base_difficulty: entry.base_difficulty,
    official_source_count: sources.filter((s) => s.source_type === 'official').length,
    grade_bands: bands.map((b) => `${b.grade} ${VARIANT_LABELS[b.level]}`),
    exam_count: new Set((usage.data ?? []).map((r) => r.exam_id)).size,
    exam_question_count: (usage.data ?? []).length,
    same_spelling_meanings: (siblings.data ?? []).map((s) => s.meaning_ko),
    source_count: sources.length,
    approval_origin_label: entry.approval_origin ? VOCABULARY_APPROVAL_ORIGIN_LABELS[entry.approval_origin] : null,
  }
  return NextResponse.json({ data: { facts, warnings: exclusionWarnings(facts) } })
}
