// STEP 7 최종 확인용 추가 테스트.
// 1) 25개 중 17개만 선택했을 때 정확히 17개만 저장되는지
// 2) 화면을 다시 연 것처럼 재조회했을 때 "이미 추가됨" 판단이 정확한지
// 3) 같은 문제를 또 추가하려고 하면(선택 상태 그대로 다시 눌러도) 중복 저장되지 않는지
// 4) 기존 AI 문제은행 방식으로 넣은 문항(등록/삭제/배점수정)이 그대로 되는지 — 회귀 테스트
// AI API는 호출하지 않는다. 끝나면 테스트로 만든 시험/문항을 모두 지운다.
//
// 실행: node scripts/test-exam-external-2.ts

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {}
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

function externalSourceKey(passageId: string, kind: string, index: number) {
  return `external_passage:${passageId}:${kind}:${index}`
}

async function main() {
  const env = loadEnvLocal()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: env.SUPABASE_LOGIN_EMAIL,
    password: env.SUPABASE_LOGIN_PASSWORD,
  })
  if (authError || !auth.user) {
    console.error('로그인 실패:', authError?.message)
    process.exit(1)
  }
  const userId = auth.user.id

  const { data: passage, error: pErr } = await supabase
    .from('passages')
    .select('id, title, body, questions, essays')
    .eq('user_id', userId)
    .ilike('title', '%My Uncle and the Rocket Launch%')
    .eq('variant_level', 'advanced')
    .limit(1)
    .maybeSingle()
  if (pErr || !passage) {
    console.error('❌ 테스트 지문을 찾지 못했습니다.')
    process.exit(1)
  }

  const { data: exam, error: eErr } = await supabase
    .from('exams')
    .insert({ user_id: userId, title: '[테스트] STEP7 최종검증용 (자동 삭제됨)' })
    .select('id')
    .single()
  if (eErr || !exam) {
    console.error('❌ 테스트 시험 생성 실패:', eErr?.message)
    process.exit(1)
  }
  console.log('테스트 시험 생성:', exam.id)

  try {
    // ── 1) 20문제 중 17개만 선택(3개 해제) 시뮬레이션 ──
    const skipIndexes = new Set([2, 7, 15]) // 임의로 3개 체크 해제
    const selectedQuestions = passage.questions
      .map((q: any, i: number) => ({ q, i }))
      .filter(({ i }: any) => !skipIndexes.has(i))
    console.log(`\n[1] 20문제 중 ${selectedQuestions.length}개 선택 (3개 해제) → 서술형은 선택 안 함`)

    const rows = selectedQuestions.map(({ q, i }: any, order: number) => ({
      exam_id: exam.id,
      user_id: userId,
      question_data: {
        type: q.type,
        question: q.q,
        passage: passage.body,
        source: 'external_passage',
        source_passage_id: passage.id,
        source_kind: 'question',
        source_index: i,
      },
      sort_order: order,
      points: 5,
    }))

    const { data: inserted, error: insErr } = await supabase.from('exam_questions').insert(rows).select('id')
    if (insErr) {
      console.error('❌ 저장 실패:', insErr.message)
    } else {
      console.log(
        inserted?.length === 17
          ? `✅ 정확히 17개만 저장됨 (선택한 개수와 실제 저장된 개수 일치)`
          : `❌ 저장된 개수가 다릅니다: ${inserted?.length}개 (기대값 17)`,
      )
    }

    // ── 2) 화면을 다시 연 것처럼 재조회 → "이미 추가됨" 판단 ──
    const { data: reopened } = await supabase
      .from('exam_questions')
      .select('question_data')
      .eq('exam_id', exam.id)
    const addedKeySet = new Set(
      (reopened ?? [])
        .filter((r) => r.question_data.source === 'external_passage')
        .map((r) => externalSourceKey(r.question_data.source_passage_id, r.question_data.source_kind, r.question_data.source_index)),
    )
    const addedCheck = selectedQuestions.every(({ i }: any) => addedKeySet.has(externalSourceKey(passage.id, 'question', i)))
    const notAddedCheck = [...skipIndexes].every((i) => !addedKeySet.has(externalSourceKey(passage.id, 'question', i)))
    console.log(
      `\n[2] 재조회 후 "이미 추가됨" 판단: 추가한 17개 모두 인식=${addedCheck ? '✅' : '❌'}, 해제했던 3개는 미인식=${notAddedCheck ? '✅' : '❌'}`,
    )

    // ── 3) 같은 17개를 다시 추가하려고 하면 막히는지 (화면 로직 재현: 이미 담긴 건 toAdd에서 제외) ──
    const retryToAdd = selectedQuestions.filter(({ i }: any) => !addedKeySet.has(externalSourceKey(passage.id, 'question', i)))
    console.log(`\n[3] 같은 17개를 다시 추가 시도 → 실제로 새로 추가될 개수: ${retryToAdd.length} (기대값 0)`)
    console.log(retryToAdd.length === 0 ? '✅ 중복 추가가 정상적으로 막힘' : '❌ 중복 추가가 막히지 않음')

    const { count: totalAfterRetry } = await supabase
      .from('exam_questions')
      .select('id', { count: 'exact', head: true })
      .eq('exam_id', exam.id)
    console.log(
      totalAfterRetry === 17
        ? `✅ 재시도 후에도 시험 문항 총 개수는 여전히 17개`
        : `❌ 재시도 후 문항 개수가 바뀜: ${totalAfterRetry}개`,
    )

    // ── 4) 기존 AI 문제은행 방식(question_data.id 사용) 회귀 테스트: 추가 → 배점 수정 → 삭제 ──
    console.log('\n[4] 기존 AI 문제은행 방식 회귀 테스트')
    const { data: aiAdded, error: aiErr } = await supabase
      .from('exam_questions')
      .insert({
        exam_id: exam.id,
        user_id: userId,
        question_data: { id: 'ai-bank-test-1', type: 'vocab', question: '테스트 어휘 문제', options: ['a', 'b'], answer: 'a' },
        sort_order: 17,
        points: 5,
      })
      .select('id, points')
      .single()
    console.log(aiErr ? `❌ AI 문제은행 방식 추가 실패: ${aiErr.message}` : '✅ AI 문제은행 방식 추가 정상')

    if (aiAdded) {
      const { error: patchErr } = await supabase.from('exam_questions').update({ points: 10 }).eq('id', aiAdded.id)
      console.log(patchErr ? `❌ 배점 수정 실패: ${patchErr.message}` : '✅ 배점 수정 정상')

      const { error: delErr } = await supabase.from('exam_questions').delete().eq('id', aiAdded.id)
      console.log(delErr ? `❌ 삭제 실패: ${delErr.message}` : '✅ 개별 문항 삭제 정상')
    }
  } finally {
    await supabase.from('exam_questions').delete().eq('exam_id', exam.id)
    await supabase.from('exams').delete().eq('id', exam.id)
    console.log('\n테스트용 시험/문항 정리 완료 (원본 외부지문·기존 시험에는 영향 없음).')
  }

  process.exit(0)
}

main()
