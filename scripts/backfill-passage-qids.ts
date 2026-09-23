// [DRY-RUN 전용] 이미 DB에 저장된 외부지문(passages)의 문제·서술형 중 qid(영구 ID)가 없는 문항을 찾아
// "무엇을 얼마나 바꿀지"만 보여준다. 이 스크립트는 DB에 아무것도 쓰지 않는다 (select 만 한다).
// 실제 적용은 dry-run 결과를 확인·승인받은 뒤 별도 단계에서 진행한다.
//
// 실행: npm run backfill-passage-qids
//       --verbose 를 붙이면 지문별 상세 줄을 모두 보여준다.
//
// 확인하는 것
// - 대상 지문 수 / 문제 수 / 서술형 수 / 이미 qid 있는 문항 수 / 새로 붙일 qid 수
// - 기존 qid 중복·형식 오류 (지문 안, 전체)
// - 새 qid 를 붙인 "가상 결과"에서도 중복이 없는지
// - 시험(exam_questions)에 이미 담긴 외부지문 문항 중 qid 없이 index 로만 연결된 legacy 행 수 (참고용, 바꾸지 않음)

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { inspectQids, withQids } from '../lib/passageQid.ts'

const VARIANT_LABELS: Record<string, string> = {
  school: '학교형',
  academy: '일반학원형',
  advanced: '상위학원형',
  prestudy: '선행형',
}

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

type Item = { qid?: string }
type Row = {
  id: string
  title: string
  group_id: string | null
  variant_level: string | null
  questions: Item[] | null
  essays: Item[] | null
}

async function main() {
  const verbose = process.argv.includes('--verbose')
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

  const { data, error } = await supabase
    .from('passages')
    .select('id, title, group_id, variant_level, questions, essays')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('지문 조회 실패:', error.message)
    process.exit(1)
  }
  const rows = (data ?? []) as Row[]

  const totals = {
    passages: rows.length,
    passagesToChange: 0,
    passagesEmpty: 0,
    questions: 0,
    essays: 0,
    questionsWithQid: 0,
    essaysWithQid: 0,
    questionsToAdd: 0,
    essaysToAdd: 0,
  }
  const problems: string[] = []
  const globalSeen = new Map<string, string>() // qid → passage id (기존 qid 전체 중복 검사)
  const plannedSeen = new Set<string>() // 가상 결과 전체 중복 검사
  const detailLines: string[] = []

  for (const row of rows) {
    const questions = row.questions ?? []
    const essays = row.essays ?? []
    const label = `${row.title}${row.variant_level ? ` [${VARIANT_LABELS[row.variant_level] ?? row.variant_level}]` : ' [단독]'} (${row.id.slice(0, 8)})`
    const report = inspectQids(questions, essays)

    totals.questions += report.questionCount
    totals.essays += report.essayCount
    totals.questionsWithQid += report.questionsWithQid
    totals.essaysWithQid += report.essaysWithQid
    if (report.questionCount + report.essayCount === 0) totals.passagesEmpty++

    if (report.duplicates.length) problems.push(`${label}: 지문 안 중복 qid ${report.duplicates.join(', ')}`)
    if (report.invalid.length) problems.push(`${label}: UUID 형식이 아닌 qid ${report.invalid.join(', ')}`)
    for (const item of [...questions, ...essays]) {
      if (!item.qid) continue
      const other = globalSeen.get(item.qid)
      if (other && other !== row.id) problems.push(`${label}: qid ${item.qid} 가 다른 지문(${other.slice(0, 8)})에도 있음`)
      globalSeen.set(item.qid, row.id)
    }

    // 메모리 안에서만 qid 를 붙여 본다 (DB에는 쓰지 않음)
    const plannedQ = withQids(questions)
    const plannedE = withQids(essays)
    const after = inspectQids(plannedQ.items, plannedE.items)
    if (after.duplicates.length || after.questionsMissing || after.essaysMissing) {
      problems.push(`${label}: 가상 적용 결과가 올바르지 않음 (중복 ${after.duplicates.length}, 누락 ${after.questionsMissing + after.essaysMissing})`)
    }
    for (const item of [...plannedQ.items, ...plannedE.items]) {
      if (plannedSeen.has(item.qid!)) problems.push(`${label}: 가상 적용 결과 전체 중복 qid ${item.qid}`)
      plannedSeen.add(item.qid!)
    }

    totals.questionsToAdd += plannedQ.added
    totals.essaysToAdd += plannedE.added
    if (plannedQ.added + plannedE.added > 0) totals.passagesToChange++
    if (verbose || plannedQ.added + plannedE.added > 0) {
      detailLines.push(
        `  ${label}: 문제 ${report.questionCount}(qid ${report.questionsWithQid}) · 서술형 ${report.essayCount}(qid ${report.essaysWithQid}) → 추가 예정 ${plannedQ.added + plannedE.added}`,
      )
    }
  }

  // 참고: 시험에 이미 담긴 외부지문 문항 중 qid 없이 index 로만 연결된 legacy 행 (이 스크립트는 바꾸지 않는다)
  const { data: examRows, error: examError } = await supabase
    .from('exam_questions')
    .select('id, question_data')
    .eq('user_id', auth.user.id)
  let externalRows = 0
  let legacyExternalRows = 0
  let bankRowsExplicit = 0
  let bankRowsLegacy = 0
  if (!examError) {
    for (const r of examRows ?? []) {
      const d = (r as { question_data: Record<string, unknown> }).question_data ?? {}
      if (d.source === 'external_passage') {
        externalRows++
        if (!d.source_question_id) legacyExternalRows++
      } else if (d.source === 'question_bank') {
        bankRowsExplicit++
      } else if (d.id && d.question_set_id) {
        bankRowsLegacy++
      }
    }
  }

  console.log('=== 외부지문 qid backfill DRY-RUN (DB 변경 없음) ===\n')
  console.log(`대상 지문(passages)            : ${totals.passages}개 (문항이 하나도 없는 지문 ${totals.passagesEmpty}개 포함)`)
  console.log(`문제(questions)                : ${totals.questions}개 — 이미 qid 있음 ${totals.questionsWithQid}, 새로 붙일 것 ${totals.questionsToAdd}`)
  console.log(`서술형(essays)                 : ${totals.essays}개 — 이미 qid 있음 ${totals.essaysWithQid}, 새로 붙일 것 ${totals.essaysToAdd}`)
  console.log(`변경 예정                      : 지문 ${totals.passagesToChange}개 / qid ${totals.questionsToAdd + totals.essaysToAdd}개 추가`)
  console.log(`기존 qid 중복·형식 문제        : ${problems.length === 0 ? '없음' : problems.length + '건'}`)
  console.log(`가상 적용 후 전체 qid 수       : ${plannedSeen.size}개 (전체 문항 수 ${totals.questions + totals.essays}개와 같아야 함)`)
  if (examError) {
    console.log(`\n(참고) exam_questions 조회 실패: ${examError.message}`)
  } else {
    console.log('\n(참고, 바꾸지 않음) 시험에 담긴 문항 provenance 현황')
    console.log(`  외부지문 문항                : ${externalRows}개 — 그중 qid 없이 index 로만 연결된 legacy ${legacyExternalRows}개`)
    console.log(`  문제은행 문항(명시 source)   : ${bankRowsExplicit}개`)
    console.log(`  문제은행 문항(legacy id만)   : ${bankRowsLegacy}개`)
  }
  if (detailLines.length) {
    console.log(`\n=== 지문별 ${verbose ? '전체' : '변경 예정'} ===`)
    detailLines.forEach((l) => console.log(l))
  }
  if (problems.length) {
    console.log('\n=== 문제 ===')
    problems.forEach((p) => console.log('❌', p))
    process.exit(1)
  }
  console.log('\n✅ DRY-RUN 완료. DB는 바뀌지 않았습니다.')
  process.exit(0)
}

main()
