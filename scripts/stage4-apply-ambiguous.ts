// 애매한 단어 11개 추천안 반영 (docs/stage4-report.md 7-2, 2026-09-28 야간 작업 명령서 4번)
//   - tire: 대표 뜻 '피곤하게 하다' → '지치다' (원래 대표 뜻은 인정 뜻으로 옮긴다)
//   - computer / thirsty / tired 새 항목은 이 스크립트가 아니라 add-vocabulary-seed 로 '확인 필요'로만 넣는다
//       node scripts/add-vocabulary-seed.ts data/vocabulary/stage4-ambiguous-derivatives.json
//   - back, bat, fan, lie, miss, present, goodbye, compute, thirst: 그대로 (바꾸지 않음)
//   - off: '사용하기 후 사용 중단' 추천이지만 사용하기(승인)는 향미 선생님만 → 손대지 않는다
// 대상 조건: status='pending', teacher_reviewed_at 없음, 삭제 안 됨, 표현·품사·현재 대표 뜻이 예상과 같을 때만.
// 바꾸는 칸: meaning_ko, accepted_meanings 뿐.
//
// 실행: node scripts/stage4-apply-ambiguous.ts           → 미리보기
//       node scripts/stage4-apply-ambiguous.ts --apply   → 백업 후 적용
// 되돌리기: node scripts/stage4-apply-ambiguous.ts --restore backups/stage4-ambiguous-backup-....json --apply

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const restoreIdx = args.indexOf('--restore')
const RESTORE = restoreIdx !== -1 ? args[restoreIdx + 1] : null

const CHANGES = [
  { expression: 'tire', pos: 'verb', from: '피곤하게 하다', to: '지치다', accepted: ['피곤하게 하다'] },
]

const env: Record<string, string> = {}
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

type Row = { id: string; expression: string; pos: string | null; status: string; teacher_reviewed_at: string | null; meaning_ko: string; accepted_meanings: string[] }

async function main() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: loginError } = await supabase.auth.signInWithPassword({ email: env.SUPABASE_LOGIN_EMAIL, password: env.SUPABASE_LOGIN_PASSWORD })
  if (loginError) throw new Error(`로그인 실패: ${loginError.message}`)

  if (RESTORE) {
    const backup = JSON.parse(readFileSync(resolve(process.cwd(), RESTORE), 'utf-8')) as { entries: Row[] }
    console.log(`되돌릴 항목 ${backup.entries.length}개`)
    if (!APPLY) return console.log('(미리보기) --apply 를 붙이면 되돌립니다.')
    for (const b of backup.entries) {
      const { error } = await supabase
        .from('vocabulary_entries')
        .update({ meaning_ko: b.meaning_ko, accepted_meanings: b.accepted_meanings })
        .eq('id', b.id)
        .is('teacher_reviewed_at', null)
      if (error) console.error(`❌ ${b.expression}: ${error.message}`)
    }
    return console.log('✅ 되돌리기 완료')
  }

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('id, expression, pos, status, teacher_reviewed_at, meaning_ko, accepted_meanings')
    .is('deleted_at', null)
    .in('expression', CHANGES.map((c) => c.expression))
  if (error) throw new Error(error.message)
  const rows = data as Row[]

  const plan: { row: Row; change: (typeof CHANGES)[number] }[] = []
  for (const c of CHANGES) {
    const row = rows.find((r) => r.expression === c.expression && r.pos === c.pos)
    if (!row) { console.log(`- ${c.expression}: 없음 → 건너뜀`); continue }
    if (row.status !== 'pending' || row.teacher_reviewed_at !== null) { console.log(`- ${c.expression}: 교사가 이미 손댐 → 건너뜀`); continue }
    if (row.meaning_ko !== c.from) { console.log(`- ${c.expression}: 대표 뜻이 '${row.meaning_ko}' (예상 '${c.from}') → 건너뜀`); continue }
    plan.push({ row, change: c })
    console.log(`- ${c.expression}: '${c.from}' (인정: ${row.accepted_meanings.join(', ') || '-'}) → '${c.to}' (인정: ${c.accepted.join(', ')})`)
  }
  console.log(`바꿀 항목 ${plan.length}개`)
  if (!APPLY) return console.log('(미리보기) --apply 를 붙이면 백업 후 적용합니다.')
  if (plan.length === 0) return

  const at = new Date().toISOString()
  const backupFile = resolve(process.cwd(), 'backups', `stage4-ambiguous-backup-${at.replace(/[:.]/g, '-')}.json`)
  writeFileSync(backupFile, JSON.stringify({ taken_at: at, entries: plan.map((p) => p.row) }, null, 2))
  console.log(`백업 저장: ${backupFile}`)
  let failed = 0
  for (const { row, change } of plan) {
    const { error: upError } = await supabase
      .from('vocabulary_entries')
      .update({ meaning_ko: change.to, accepted_meanings: change.accepted })
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
