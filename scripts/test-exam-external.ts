// STEP 7 검증: 외부지문저장소 문제를 시험(exam_questions)에 담았을 때
// 1) 25문제(20+5)가 모두 저장되는지
// 2) 인쇄 화면의 "지문 중복 방지" 로직(연속된 문항의 passage 문자열이 같으면 한 번만 출력)이
//    실제로 지문을 1번만 묶어내는지
// 3) order/match 정답 문구가 사람이 읽을 수 있는 형태로 만들어지는지
// 를 DB 레벨에서 확인한다. AI API는 호출하지 않는다.
// 끝나면 테스트로 만든 시험(exam)과 문항(exam_questions)을 모두 지운다.
//
// 실행: node scripts/test-exam-external.ts

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

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

function rotateMeanings(meanings: string[]): string[] {
  if (meanings.length <= 1) return meanings
  return [...meanings.slice(1), meanings[0]]
}

// lib/externalPassageExam.ts 의 변환 로직과 동일한 규칙을 이 스크립트 안에서도 그대로 따른다
// (이 테스트 스크립트는 Next.js의 "@/" 경로 별칭을 못 읽기 때문에 핵심 로직만 그대로 복사해서 검증한다).
function buildQuestionData(passage: { id: string; body: string }, kind: 'question' | 'essay', index: number, item: any) {
  const base = {
    passage: passage.body,
    source: 'external_passage',
    source_passage_id: passage.id,
    source_kind: kind,
    source_index: index,
  }
  if (kind === 'essay') {
    return { ...base, type: 'essay', question: `${item.q} (${item.wordLimit}자 이내)`, answer: item.sampleAnswer, explanation: item.rubric }
  }
  switch (item.type) {
    case 'mc':
      return { ...base, type: 'mc', question: item.q, options: item.choices, answer: item.answer, explanation: item.explanation }
    case 'blank':
      return { ...base, type: 'blank', question: item.q, answer: item.answer, explanation: item.explanation }
    case 'tf':
      return { ...base, type: 'tf', question: item.q, options: ['참', '거짓'], answer: item.answer ? '참' : '거짓', explanation: item.explanation }
    case 'order': {
      const labels = item.items.map((_: string, i: number) => LABELS[i] ?? String(i + 1))
      const answer = item.answer.map((s: string) => labels[item.items.indexOf(s)] ?? '?').join(' → ')
      return { ...base, type: 'order', question: '다음 문장을 문맥에 맞게 순서대로 배열하시오.', items: item.items, answer }
    }
    case 'match': {
      const matchWords = item.pairs.map((p: any) => p.word)
      const matchMeanings = rotateMeanings(item.pairs.map((p: any) => p.meaning))
      const answer = item.pairs.map((p: any, i: number) => `${i + 1}-${LABELS[matchMeanings.indexOf(p.meaning)] ?? '?'}`).join(', ')
      return { ...base, type: 'match', question: '다음 단어와 뜻을 알맞게 연결하시오.', matchWords, matchMeanings, answer }
    }
    default:
      throw new Error('알 수 없는 문제 유형: ' + item.type)
  }
}

// print 페이지의 지문 묶음 로직과 동일 (연속된 문항의 passage 문자열이 같으면 한 그룹으로 묶는다)
function groupByPassage(rows: { question_data: { passage?: string | null } }[]) {
  const groups: { passage: string | null; count: number }[] = []
  for (const r of rows) {
    const passage = r.question_data.passage ?? null
    const last = groups[groups.length - 1]
    if (last && last.passage === passage) last.count++
    else groups.push({ passage, count: 1 })
  }
  return groups
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

  // 테스트 그룹의 상위학원형 지문 하나 사용 (20문제 + 5서술형)
  const { data: passage, error: pErr } = await supabase
    .from('passages')
    .select('id, title, body, questions, essays')
    .eq('user_id', userId)
    .ilike('title', '%My Uncle and the Rocket Launch%')
    .eq('variant_level', 'advanced')
    .limit(1)
    .maybeSingle()

  if (pErr || !passage) {
    console.error('❌ 테스트용 외부지문(상위학원형)을 찾지 못했습니다.')
    process.exit(1)
  }
  console.log('테스트 지문:', passage.title, '(상위학원형)', '문제', passage.questions.length, '개, 서술형', passage.essays.length, '개')

  // 임시 시험 카드 생성
  const { data: exam, error: eErr } = await supabase
    .from('exams')
    .insert({ user_id: userId, title: '[테스트] STEP7 검증용 시험 (자동 삭제됨)' })
    .select('id')
    .single()
  if (eErr || !exam) {
    console.error('❌ 테스트 시험 생성 실패:', eErr?.message)
    process.exit(1)
  }
  console.log('테스트 시험 생성:', exam.id)

  try {
    // 25문제(20+5)를 순서대로 exam_questions 에 저장 (실제 화면의 addSelectedExternal 과 같은 방식)
    const rows: any[] = []
    passage.questions.forEach((q: any, i: number) => {
      rows.push({
        exam_id: exam.id,
        user_id: userId,
        question_data: buildQuestionData(passage, 'question', i, q),
        sort_order: rows.length,
        points: 5,
      })
    })
    passage.essays.forEach((e: any, i: number) => {
      rows.push({
        exam_id: exam.id,
        user_id: userId,
        question_data: buildQuestionData(passage, 'essay', i, e),
        sort_order: rows.length,
        points: 5,
      })
    })

    const { data: inserted, error: insErr } = await supabase.from('exam_questions').insert(rows).select('id, question_data, sort_order')
    if (insErr) {
      console.error('❌ exam_questions 저장 실패:', insErr.message)
    } else {
      console.log(`✅ ${inserted?.length}개 문항 저장됨 (기대값 25)`)
    }

    // 저장된 순서대로 다시 불러와서 지문 중복 여부 확인
    const { data: saved } = await supabase
      .from('exam_questions')
      .select('question_data, sort_order')
      .eq('exam_id', exam.id)
      .order('sort_order', { ascending: true })

    const groups = groupByPassage(saved ?? [])
    console.log(
      groups.length === 1 && groups[0].count === 25
        ? `✅ 지문 묶음 1개로만 묶임 (문항 ${groups[0].count}개) → 인쇄 시 지문이 딱 1번만 출력됨`
        : `❌ 지문이 ${groups.length}개 묶음으로 쪼개졌습니다! (묶음별 개수: ${groups.map((g) => g.count).join(', ')})`,
    )

    // order/match 정답 문구 확인 (사람이 읽을 수 있는 형태인지)
    const orderRow = (saved ?? []).find((r) => r.question_data.type === 'order')
    const matchRow = (saved ?? []).find((r) => r.question_data.type === 'match')
    console.log('order 정답 예시 :', orderRow?.question_data.answer)
    console.log('match 정답 예시 :', matchRow?.question_data.answer)
    console.log('tf 옵션 예시    :', (saved ?? []).find((r) => r.question_data.type === 'tf')?.question_data.options)

    // 중복 방지 확인: 같은 문제를 다시 추가하려고 하면 "이미 담김"으로 판단할 수 있는지
    const existingKeys = new Set(
      (saved ?? []).map((r) => `${r.question_data.source_passage_id}:${r.question_data.source_kind}:${r.question_data.source_index}`),
    )
    const alreadyHasFirstQuestion = existingKeys.has(`${passage.id}:question:0`)
    console.log(alreadyHasFirstQuestion ? '✅ 출처 정보로 "이미 추가됨" 판단 가능' : '❌ 출처 정보로 판단할 수 없음')
  } finally {
    // 테스트로 만든 데이터 정리 (실제 시험/문제에는 영향 없음)
    await supabase.from('exam_questions').delete().eq('exam_id', exam.id)
    await supabase.from('exams').delete().eq('id', exam.id)
    console.log('\n테스트용 시험/문항 정리 완료 (원본 외부지문은 손대지 않음).')
  }

  process.exit(0)
}

main()
