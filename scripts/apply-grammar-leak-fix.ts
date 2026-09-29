// 어법 문제 정답 노출 수정안 적용 — ⚠️ 향미 선생님이 docs/grammar-leak-fix-proposal.csv 를 보고 승인한 뒤에만 실행한다.
//
// - 적용 대상: CSV 첫 칸(승인)에 'O' 를 쓴 줄 + 수정안 문항이 비어 있지 않은 줄만.
// - 문제은행 questions.question_text 만 바꾼다 (보기·정답·해설·세트 JSON·이미 만든 시험 snapshot 은 그대로).
// - 지금 DB 의 문항 글이 CSV 의 "현재 문항"과 똑같을 때만 바꾼다 (그 사이 누가 고쳤으면 건너뜀).
// - --apply 때 먼저 백업: backups/grammar-leak-fix-backup-<시각>.json
//
// 실행: node scripts/apply-grammar-leak-fix.ts docs/grammar-leak-fix-proposal.csv            → 미리보기 (DB 변경 없음)
//       node scripts/apply-grammar-leak-fix.ts docs/grammar-leak-fix-proposal.csv --apply    → 백업 후 적용
// 되돌리기: node scripts/apply-grammar-leak-fix.ts --restore backups/grammar-leak-fix-backup-....json --apply

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chunk } from '../lib/supabasePaging.ts'
import { parseCsv } from '../lib/officialVocabulary.ts'
import { decodeReviewFile, normalizeVerdict, tabbedToCsv } from '../lib/reviewSample.ts'
import { isGrammarLeak } from '../lib/grammarLeak.ts'

const APPLY = process.argv.includes('--apply')
const restoreIdx = process.argv.indexOf('--restore')
const RESTORE = restoreIdx >= 0 ? process.argv[restoreIdx + 1] : null
const file = RESTORE ? null : process.argv.slice(2).find((a) => !a.startsWith('-'))
if (!RESTORE && !file) {
  console.error('사용법: node scripts/apply-grammar-leak-fix.ts docs/grammar-leak-fix-proposal.csv [--apply]')
  process.exit(1)
}

const env: Record<string, string> = {}
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: auth, error: loginError } = await supabase.auth.signInWithPassword({ email: env.SUPABASE_LOGIN_EMAIL, password: env.SUPABASE_LOGIN_PASSWORD })
if (loginError || !auth.user) throw new Error(`로그인 실패: ${loginError?.message}`)
const userId = auth.user.id

type Change = { id: string; from: string; to: string }

async function currentTexts(ids: string[]) {
  const map = new Map<string, { question_text: string; question_type: string; choices: string[] | null; correct_answer: string | null }>()
  for (const part of chunk(ids, 200)) {
    const { data, error } = await supabase.from('questions').select('id, question_text, question_type, choices, correct_answer').eq('user_id', userId).in('id', part)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) map.set(r.id, r)
  }
  return map
}

async function applyChanges(changes: Change[]) {
  let done = 0
  for (const c of changes) {
    const { data, error } = await supabase.from('questions').update({ question_text: c.to }).eq('user_id', userId).eq('id', c.id).eq('question_text', c.from).select('id')
    if (error) throw new Error(`${done}개 바꾼 뒤 실패: ${error.message}`)
    done += data?.length ?? 0
  }
  return done
}

if (RESTORE) {
  const backup = JSON.parse(readFileSync(resolve(process.cwd(), RESTORE), 'utf-8')) as { changes: Change[] }
  // 되돌리기: 지금 글이 적용한 수정안과 같을 때만 원래 글로
  const back = backup.changes.map((c) => ({ id: c.id, from: c.to, to: c.from }))
  console.log(`되돌릴 대상 ${back.length}개`)
  if (!APPLY) process.exit(0)
  console.log(`✅ ${await applyChanges(back)}개를 원래 문항으로 되돌렸습니다.`)
  process.exit(0)
}

const rows = parseCsv(tabbedToCsv(decodeReviewFile(readFileSync(resolve(process.cwd(), file!))).replace(/^﻿/, '')))
const h = rows[0].map((x) => x.trim())
const col = (name: string) => h.findIndex((x) => x.startsWith(name))
const [cOk, cId, cNow, cNew] = [col('승인'), col('문항 ID'), col('현재 문항'), col('수정안 문항')]
if ([cOk, cId, cNow, cNew].some((c) => c < 0)) throw new Error('CSV 머리줄(승인·문항 ID·현재 문항·수정안 문항)을 찾을 수 없습니다.')

const approved = rows.slice(1).filter((r) => normalizeVerdict(r[cOk]) === 'O' && (r[cNew] ?? '').trim())
const current = await currentTexts(approved.map((r) => r[cId]))
const changes: Change[] = []
const skipped: string[] = []
for (const r of approved) {
  const cur = current.get(r[cId])
  if (!cur) skipped.push(`${r[cId]}: 찾을 수 없음`)
  else if (cur.question_text !== r[cNow]) skipped.push(`${r[cId]}: 지금 문항이 CSV 의 현재 문항과 다름`)
  else if (isGrammarLeak({ ...cur, question_text: r[cNew] })) skipped.push(`${r[cId]}: 수정안도 정답이 보임`)
  else changes.push({ id: r[cId], from: r[cNow], to: r[cNew] })
}
console.log(`CSV ${rows.length - 1}줄 · 승인(O) ${approved.length}줄 → 바꿀 문항 ${changes.length}개 / 건너뜀 ${skipped.length}개`)
for (const s of skipped.slice(0, 20)) console.log(`  건너뜀 ${s}`)
if (!APPLY) {
  console.log('(미리보기) 실제로 바꾸려면 --apply 를 붙여 다시 실행하세요.')
  process.exit(0)
}
const at = new Date().toISOString()
const backupPath = resolve(process.cwd(), `backups/grammar-leak-fix-backup-${at.replace(/[:.]/g, '-')}.json`)
writeFileSync(backupPath, JSON.stringify({ applied_at: at, source: file, changes }, null, 2))
console.log(`백업: ${backupPath}`)
console.log(`✅ ${await applyChanges(changes)}개 문항을 수정안으로 바꿨습니다. 되돌리기: node scripts/apply-grammar-leak-fix.ts --restore ${backupPath} --apply`)
