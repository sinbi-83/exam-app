import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { selectAllPages } from '@/lib/supabasePaging'
import { buildBankExamQuestionData } from '@/lib/questionBankExam'
import { buildExternalExamQuestionData } from '@/lib/externalPassageExam'
import { aiCategory, externalCategory, externalItemKey, type MixedCandidate } from '@/lib/mixedTest'
import { aiItemDifficulty, externalDifficulty } from '@/lib/passageUnified'
import type { PassageEssay, PassageQuestion } from '@/types/passageBank'

// GET: 혼합 시험(7단계)용 — 지문 1개의 문항 후보 (읽기 전용). ?kind=ai&id=<question_sets.id> | ?kind=external&id=<passages.id>
// 문항마다 유형(객관식/주관식/문법)·통합 난이도·시험에 저장할 snapshot 을 만들어 준다 (기존 시험 담기와 같은 변환 함수).
// qid 없는 예전 외부지문 문항은 위치 기반 임시 키로 구분하고, snapshot 에 source_legacy_key 를 남긴다 (qid 는 지어내지 않는다).
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const kind = searchParams.get('kind')
  const id = searchParams.get('id')
  if (!id || (kind !== 'ai' && kind !== 'external')) return NextResponse.json({ error: 'kind 와 id 가 필요합니다.' }, { status: 400 })

  if (kind === 'ai') {
    const { data: set, error: setError } = await supabase
      .from('question_sets')
      .select('id, passage')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (setError || !set) return NextResponse.json({ error: '지문을 찾을 수 없습니다.' }, { status: 404 })

    // 1,000행 제한 → 나눠 읽기
    const { data, error } = await selectAllPages<Record<string, unknown>>((from, to) =>
      supabase.from('questions').select('*').eq('user_id', user.id).eq('question_set_id', id).order('created_at').order('id').range(from, to),
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const candidates: MixedCandidate[] = data.map((q) => {
      const rawType = String(q.question_type ?? '')
      const options = Array.isArray(q.choices) ? (q.choices as string[]) : []
      // /api/questions/search 와 같은 모양 (문제 시험에서 문제은행 문항을 담을 때와 같게)
      const mapped = {
        id: q.id as string,
        type: rawType.replace(/^reading_|^essay_/, '') || rawType,
        question: (q.question_text as string) ?? '',
        options,
        answer: (q.correct_answer as string) ?? '',
        explanation: (q.explanation as string) ?? '',
        grade: (q.grade as string) ?? '',
        topic: (q.topic as string) ?? '',
        difficulty: q.difficulty as number | null,
        question_set_id: q.question_set_id as string,
      }
      return {
        key: `ai:${mapped.id}`,
        category: aiCategory(rawType, options.length > 0),
        difficulty: aiItemDifficulty(mapped.difficulty),
        preview: mapped.question,
        question_data: buildBankExamQuestionData(mapped, set.passage as string),
      }
    })
    return NextResponse.json({ data: candidates })
  }

  const { data: p, error } = await supabase
    .from('passages')
    .select('id, body, variant_level, questions, essays')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (error || !p) return NextResponse.json({ error: '지문을 찾을 수 없습니다.' }, { status: 404 })

  const difficulty = externalDifficulty(p.variant_level)
  const build = (k: 'question' | 'essay', item: PassageQuestion | PassageEssay, index: number): MixedCandidate => {
    const key = externalItemKey(p.id, k, index, item.qid)
    const snapshot = buildExternalExamQuestionData({ id: p.id, body: p.body }, k, index, item)
    return {
      key,
      category: externalCategory(k, k === 'question' ? (item as PassageQuestion).type : undefined),
      difficulty,
      preview: snapshot.question,
      question_data: item.qid ? { ...snapshot } : { ...snapshot, source_legacy_key: key },
    }
  }
  const candidates = [
    ...((p.questions ?? []) as PassageQuestion[]).map((q, i) => build('question', q, i)),
    ...((p.essays ?? []) as PassageEssay[]).map((e, i) => build('essay', e, i)),
  ]
  return NextResponse.json({ data: candidates })
}
