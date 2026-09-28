// 인정 뜻 정리 (품사와 다른 뜻 빼기). 교사가 아직 손대지 않은 '확인 필요' 항목만 고친다.
//   대상: status='pending', teacher_reviewed_at 없음, 삭제 안 됨, 표현+품사 일치
//   바꾸는 칸: accepted_meanings 뿐 (지정한 뜻만 뺀다)
// 실행: node scripts/apply-accepted-fixes.ts data/vocabulary/stage4-accepted-fixes.json          → 미리보기
//       node scripts/apply-accepted-fixes.ts data/vocabulary/stage4-accepted-fixes.json --apply  → 백업 후 적용
// 되돌리기: 백업 파일(backups/accepted-fixes-backup-*.json)의 accepted_meanings 로 다시 update (같은 스크립트 --restore <백업>)

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const restoreIdx = args.indexOf('--restore')
const RESTORE = restoreIdx !== -1 ? args[restoreIdx + 1] : null

const env: Record<string, string> = {}
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

type Row = { id: string; expression: string; pos: string | null; status: string; teacher_reviewed_at: string | null; accepted_meanings: string[] }

async function main() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: loginError } = await supabase.auth.signInWithPassword({ email: env.SUPABASE_LOGIN_EMAIL, password: env.SUPABASE_LOGIN_PASSWORD })
  if (loginError) throw new Error(`로그인 실패: ${loginError.message}`)

  if (RESTORE) {
    const backup = JSON.parse(readFileSync(resolve(process.cwd(), RESTORE), 'utf-8')) as { entries: { id: string; expression: string; accepted_meanings: string[] }[] }
    console.log(`되돌릴 항목 ${backup.entries.length}개`)
    if (!APPLY) return console.log('(미리보기) --apply 를 붙이면 되돌립니다.')
    for (const b of backup.entries) {
      const { error } = await supabase.from('vocabulary_entries').update({ accepted_meanings: b.accepted_meanings }).eq('id', b.id)
      if (error) console.error(`❌ ${b.expression}: ${error.message}`)
    }
    return console.log('✅ 되돌리기 완료')
  }

  const file = args.find((a) => a.endsWith('.json'))
  if (!file) throw new Error('고칠 목록 JSON 경로를 주세요.')
  const { fixes } = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf-8')) as {
    fixes: { expression: string; pos: string; remove: string[]; why: string }[]
  }

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('id, expression, pos, status, teacher_reviewed_at, accepted_meanings')
    .is('deleted_at', null)
    .in('expression', [...new Set(fixes.map((f) => f.expression))])
  if (error) throw new Error(error.message)
  const rows = data as Row[]

  const plan: { row: Row; next: string[]; removed: string[] }[] = []
  const skipped: string[] = []
  for (const f of fixes) {
    const row = rows.find((r) => r.expression === f.expression && r.pos === f.pos)
    if (!row) { skipped.push(`${f.expression}(${f.pos}): 없음`); continue }
    if (row.status !== 'pending' || row.teacher_reviewed_at !== null) { skipped.push(`${f.expression}(${f.pos}): 교사가 이미 손댐 → 건너뜀`); continue }
    const removed = row.accepted_meanings.filter((m) => f.remove.includes(m))
    if (removed.length === 0) { skipped.push(`${f.expression}(${f.pos}): 뺄 뜻이 이미 없음`); continue }
    plan.push({ row, next: row.accepted_meanings.filter((m) => !f.remove.includes(m)), removed })
  }
  console.log(`고칠 항목 ${plan.length}개 / 건너뜀 ${skipped.length}개`)
  for (const s of skipped) console.log(`  - ${s}`)
  if (!APPLY) return console.log('(미리보기) --apply 를 붙이면 백업 후 적용합니다.')

  const at = new Date().toISOString()
  const backupFile = resolve(process.cwd(), 'backups', `accepted-fixes-backup-${at.replace(/[:.]/g, '-')}.json`)
  writeFileSync(backupFile, JSON.stringify({ taken_at: at, entries: plan.map(({ row }) => ({ id: row.id, expression: row.expression, accepted_meanings: row.accepted_meanings })) }, null, 2))
  console.log(`백업 저장: ${backupFile}`)
  let failed = 0
  for (const { row, next } of plan) {
    const { error: upError } = await supabase
      .from('vocabulary_entries')
      .update({ accepted_meanings: next })
      .eq('id', row.id)
      .eq('status', 'pending')
      .is('teacher_reviewed_at', null)
    if (upError) { failed++; console.error(`❌ ${row.expression}: ${upError.message}`) }
  }
  console.log(failed === 0 ? `✅ ${plan.length}개 고침` : `❌ 실패 ${failed}건`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
