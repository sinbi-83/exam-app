// 어법 문제 정답 노출 검사 (읽기만 한다. DB 값을 바꾸지 않는다. AI 호출 없음)
//   대상: 문제은행 questions 의 어법 객관식(grammar) + 서술형 어법고쳐쓰기(essay_어법고쳐쓰기)
//   참고: 이미 만든 시험 snapshot(exam_questions)은 바꾸지 않고 개수만 센다
//   → docs/grammar-leak-audit.md, docs/grammar-leak-ids.csv, docs/grammar-leak-fix-proposal.csv (UTF-8 BOM)
//   수정안은 향미 선생님 승인 전까지 적용하지 않는다 (scripts/apply-grammar-leak-fix.ts, 승인 칸 'O' 인 줄만).
//
// 실행: node scripts/grammar-leak-audit.ts

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { selectAllPages } from '../lib/supabasePaging.ts'
import {
  buildBlankStem,
  detectGrammarLeak,
  detectSnapshotLeak,
  GRAMMAR_LEAK_LABELS,
  isGrammarLeak,
  quotedParts,
  splitSentences,
  type GrammarLeakReason,
} from '../lib/grammarLeak.ts'

const env: Record<string, string> = {}
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { error: loginError } = await supabase.auth.signInWithPassword({ email: env.SUPABASE_LOGIN_EMAIL, password: env.SUPABASE_LOGIN_PASSWORD })
if (loginError) throw new Error(`로그인 실패: ${loginError.message}`)

type QRow = { id: string; question_set_id: string | null; question_type: string; question_text: string; choices: string[] | null; correct_answer: string | null; explanation: string | null }
const { data: qs, error: qErr } = await selectAllPages<QRow>((from, to) =>
  supabase.from('questions').select('id, question_set_id, question_type, question_text, choices, correct_answer, explanation').in('question_type', ['grammar', 'essay_어법고쳐쓰기']).order('id').range(from, to),
)
if (qErr) throw new Error(qErr.message)
type SetRow = { id: string; passage: string | null; questions: { type?: string; targetText?: string; targetSentence?: string; choices?: string[]; correctIndex?: number }[] | null }
const { data: sets, error: sErr } = await selectAllPages<SetRow>((from, to) => supabase.from('question_sets').select('id, passage, questions').order('id').range(from, to))
if (sErr) throw new Error(sErr.message)
const setById = new Map(sets.map((s) => [s.id, s]))
const { data: snaps, error: eErr } = await selectAllPages<{ id: string; exam_id: string; question_data: Record<string, unknown> }>((from, to) =>
  supabase.from('exam_questions').select('id, exam_id, question_data').order('id').range(from, to),
)
if (eErr) throw new Error(eErr.message)

const csvCell = (v: string | number) => {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (rows: (string | number)[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

// ── 검사 ──
const audited = qs.map((q) => ({ q, reasons: detectGrammarLeak(q) }))
const suspects = audited.filter(({ q }) => isGrammarLeak(q))
const broken = audited.filter(({ reasons }) => reasons.includes('choices_broken'))
const byReason = new Map<GrammarLeakReason, typeof audited>()
for (const a of audited) for (const r of a.reasons) byReason.set(r, [...(byReason.get(r) ?? []), a])

// ── 수정안 ──
// 어법 객관식(예전 형식) → (가) 빈칸형: 원래 문장에서 정답 자리를 빈칸으로. 보기·정답은 그대로.
function sentenceFor(q: QRow): string | null {
  const target = quotedParts(q.question_text)[0]
  const set = q.question_set_id ? setById.get(q.question_set_id) : undefined
  if (!set || !target) return null
  const item = (set.questions ?? []).find((it) => it.type === 'grammar' && it.targetText === target && it.targetSentence)
  if (item?.targetSentence) return item.targetSentence
  const hits = splitSentences(set.passage ?? '').filter((s) => buildBlankStem(s, target) !== null)
  return hits.length === 1 ? hits[0] : null
}
const proposals: (string | number)[][] = [['승인(O 를 쓰면 적용 대상)', '문항 ID', '세트 ID', '유형', '의심 이유', '현재 문항', '수정안 문항', '보기(바뀌지 않음)', '정답(바뀌지 않음)', '비고']]
let autoFixed = 0
for (const { q, reasons } of suspects) {
  let proposal = ''
  let note = ''
  if (q.question_type === 'grammar') {
    const target = quotedParts(q.question_text)[0]
    const sentence = sentenceFor(q)
    const stem = sentence && target ? buildBlankStem(sentence, target) : null
    if (stem && !isGrammarLeak({ ...q, question_text: stem })) {
      proposal = stem
      note = '(가) 빈칸형으로 바꿈. 시험지에서는 같은 지문의 그 자리도 빈칸으로 가려진다'
      autoFixed++
    } else {
      note = '수동 수정 필요: 원래 문장을 찾지 못했거나 빈칸형으로 바꿔도 정답이 보임'
    }
  } else if (reasons.includes('essay_already_correct')) {
    note = '수동 수정 필요: 문장에 어법 오류를 한 군데 넣어야 함 (모범답안과 같은 문장)'
  } else if (reasons.includes('essay_fix_revealed')) {
    const sentence = quotedParts(q.question_text)[0]
    const head = q.question_text.split('\n')[0]
    const fixed = sentence ? `${head}\n\n"${sentence}"` : ''
    if (fixed && !isGrammarLeak({ ...q, question_text: fixed })) {
      proposal = fixed
      note = '답을 알려 주는 지시문을 뺌'
      autoFixed++
    } else {
      note = '수동 수정 필요: 지시문이 고친 답을 알려 줌'
    }
  }
  proposals.push(['', q.id, q.question_set_id ?? '', q.question_type, reasons.map((r) => GRAMMAR_LEAK_LABELS[r]).join(' / '), q.question_text, proposal, (q.choices ?? []).join(' | '), q.correct_answer ?? '', note])
}

// ── 이미 만든 시험 snapshot (바꾸지 않음, 개수만) ──
const snapGrammar = snaps.filter((s) => s.question_data?.type === 'grammar')
const snapLeak = snapGrammar.filter((s) => detectSnapshotLeak(s.question_data as never).some((r) => r !== 'choices_broken'))
const snapExams = new Set(snapLeak.map((s) => s.exam_id))

writeFileSync(
  resolve(process.cwd(), 'docs/grammar-leak-ids.csv'),
  csv([['문항 ID', '세트 ID', '유형', '의심 이유'], ...suspects.map(({ q, reasons }) => [q.id, q.question_set_id ?? '', q.question_type, reasons.map((r) => GRAMMAR_LEAK_LABELS[r]).join(' / ')])]),
)
writeFileSync(resolve(process.cwd(), 'docs/grammar-leak-fix-proposal.csv'), csv(proposals))

const count = (t: string) => qs.filter((q) => q.question_type === t).length
const example = (reason: GrammarLeakReason) => {
  const a = byReason.get(reason)?.[0]
  if (!a) return '- (없음)'
  return `- 문항 \`${a.q.id}\`\n  - 문제: ${a.q.question_text.replace(/\n+/g, ' ')}\n  - 보기: ${(a.q.choices ?? []).join(' / ') || '(없음)'}\n  - 정답: ${a.q.correct_answer}`
}
const md = [
  '# 어법 문제 정답 노출 검사',
  '',
  `- 만든 날: ${new Date().toISOString().slice(0, 10)} · \`node scripts/grammar-leak-audit.ts\` (읽기 전용, DB 변경 없음)`,
  `- 검사한 어법 문항: **${qs.length}개** (어법 객관식 ${count('grammar')} · 서술형 어법고쳐쓰기 ${count('essay_어법고쳐쓰기')})`,
  `- **정답 노출 의심: ${suspects.length}개** (어법 객관식 ${suspects.filter((s) => s.q.question_type === 'grammar').length} · 서술형 ${suspects.filter((s) => s.q.question_type !== 'grammar').length})`,
  `- 보기 오류(정답 없음·중복·부족, 노출과 별개): ${broken.length}개`,
  `- 이미 만든 시험 snapshot 중 어법 객관식 ${snapGrammar.length}개 → 노출 의심 ${snapLeak.length}개 (시험 ${snapExams.size}개). **snapshot 은 바꾸지 않았다** — 새 시험부터 안전장치가 적용된다.`,
  '',
  '## 원인',
  '',
  '예전 AI 어법 객관식은 지문 속 **올바른 표현(= 정답)** 을 `targetText` 로 골라, 코드가 문제 문장을',
  '`밑줄 친 "정답"의 쓰임이 어법상 가장 적절한 것은?` 으로 만들었다 (`app/api/save-question-set/route.ts`).',
  '그래서 문제 문장과 지문의 밑줄 자리에 정답이 그대로 보인다 — 개별 문항 실수가 아니라 **형식 자체의 문제**라 예전 어법 객관식이 전부 걸린다.',
  '서술형 어법고쳐쓰기는 대부분 틀린 문장을 주지만, 일부는 문장에 틀린 곳이 없거나(모범답안과 같음) 지시문이 고칠 답을 알려 준다.',
  '',
  '## 유형별 건수',
  '',
  '| 유형 | 건수 |',
  '|---|---|',
  ...[...byReason.entries()].map(([r, list]) => `| ${GRAMMAR_LEAK_LABELS[r]} | ${list.length} |`),
  '',
  '## 유형별 예시',
  '',
  `### ${GRAMMAR_LEAK_LABELS.target_is_answer}`,
  example('target_is_answer'),
  '',
  `### ${GRAMMAR_LEAK_LABELS.essay_already_correct}`,
  example('essay_already_correct'),
  '',
  `### ${GRAMMAR_LEAK_LABELS.essay_fix_revealed}`,
  example('essay_fix_revealed'),
  '',
  '## 수정안',
  '',
  `- \`docs/grammar-leak-fix-proposal.csv\` — 의심 ${suspects.length}개 중 자동 수정안 ${autoFixed}개, 나머지는 "수동 수정 필요".`,
  '- 어법 객관식 → **(가) 빈칸형**: 원래 문장에서 정답 자리를 빈칸으로 (보기·정답은 그대로). 시험지에서는 같은 지문의 그 자리도 빈칸으로 가려진다.',
  '- **향미 선생님 승인 전까지 DB 에 적용하지 않는다.** 승인할 줄의 첫 칸에 `O` 를 쓴 뒤 `node scripts/apply-grammar-leak-fix.ts docs/grammar-leak-fix-proposal.csv` (미리보기) → `--apply` (백업 후 적용, 승인 O 줄만, 현재 문항이 CSV 와 같을 때만).',
  '- 이미 만든 시험 snapshot 은 수정안을 적용해도 바뀌지 않는다.',
  '',
  '## 안전장치 (코드, 데이터 변경 없음)',
  '',
  '- 문제은행 목록(세트별 개수)·세트 상세·문항 검색에 **"정답 노출 의심"** 배지.',
  '- 혼합 시험 후보에서 의심 문항 제외 (몇 개 뺐는지 화면에 표시).',
  '- AI 어법 문제 생성: 허용 형식 (가) 빈칸형 · (나) 밑줄 ①~⑤ 중 틀린 것 찾기 두 가지만. 생성 직후 검증에서 걸리면 다시 만들고, 끝까지 걸리는 어법 문항은 버린다.',
  '- 시험지 인쇄: 빈칸형 어법 문항의 정답이 같은 시험지 지문에 그대로 보이지 않게 지문 쪽 그 자리도 빈칸으로 (화면·인쇄만).',
  '- 참고: 문항 검색(`/materials/questions/search`)에는 배지를 넣지 않았다 — 검색 API 가 `type`·`question` 으로 돌려주는데 화면은 `question_type`·`question_text` 를 읽어서 지금 검색 자체가 오류로 끝난다 (예전부터 있던 문제, 이번 범위 밖).',
  '',
].join('\n')
writeFileSync(resolve(process.cwd(), 'docs/grammar-leak-audit.md'), md)

console.log(`검사 ${qs.length}개 · 의심 ${suspects.length}개 · 보기 오류 ${broken.length}개 · 자동 수정안 ${autoFixed}개 · 시험 snapshot 의심 ${snapLeak.length}개(시험 ${snapExams.size}개)`)
for (const [r, list] of byReason) console.log(`  ${GRAMMAR_LEAK_LABELS[r]}: ${list.length}`)
