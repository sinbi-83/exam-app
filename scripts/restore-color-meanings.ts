// 색 이름 인정 뜻 되돌리기 — ⚠️ 준비만 해 둔 스크립트. 향미 선생님이 "되돌리자"고 정한 뒤에만 --apply 로 실행한다.
//
// 배경: 4단계 7-1 점검(2026-09-28)에서 색 형용사 9개의 인정 뜻 중 명사(색 이름) 뜻을 뺐다.
//   black(검정) blue(파랑) brown(갈색) gray(회색) green(초록, 녹색) pink(분홍, 핑크) red(빨강) white(흰색) yellow(노랑)
//   → 영→한 시험에서 학생이 "검정"이라고 쓰면 오답이 된다. 초등 채점 관행상 정답으로 인정할지 향미 선생님이 정한다.
// 이 스크립트는 뺀 뜻을 인정 뜻 끝에 다시 붙인다 (다른 인정 뜻·대표 뜻·상태는 그대로).
//
// 대상: 표현+품사(adjective) 일치, 삭제 안 됨, 뺀 뜻이 지금 인정 뜻에 없을 때만.
//   기본: '확인 필요'이고 교사가 손대지 않은 항목(teacher_reviewed_at 없음)만.
//   --include-approved: 일괄 사용하기로 이미 '사용 중'이 된 항목도 포함 (선생님이 되돌리기로 정했을 때만 붙인다.
//                       교사 확인 시각이 있는 항목의 값을 바꾸는 것이므로 선생님 결정 없이는 쓰지 않는다)
//
// 실행: node scripts/restore-color-meanings.ts                              → 미리보기 (DB 변경 없음)
//       node scripts/restore-color-meanings.ts --apply                      → 백업 후 적용
//       node scripts/restore-color-meanings.ts --include-approved --apply   → 사용 중 항목까지 백업 후 적용
// 되돌리기(이 스크립트를 실행한 뒤 다시 빼려면): node scripts/apply-accepted-fixes.ts --restore backups/color-meanings-backup-....json --apply

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const INCLUDE_APPROVED = process.argv.includes('--include-approved')

export const COLOR_MEANINGS: { expression: string; restore: string[] }[] = [
  { expression: 'black', restore: ['검정'] },
  { expression: 'blue', restore: ['파랑'] },
  { expression: 'brown', restore: ['갈색'] },
  { expression: 'gray', restore: ['회색'] },
  { expression: 'green', restore: ['초록', '녹색'] },
  { expression: 'pink', restore: ['분홍', '핑크'] },
  { expression: 'red', restore: ['빨강'] },
  { expression: 'white', restore: ['흰색'] },
  { expression: 'yellow', restore: ['노랑'] },
]

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

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('id, expression, pos, status, teacher_reviewed_at, accepted_meanings')
    .is('deleted_at', null)
    .eq('pos', 'adjective')
    .in('expression', COLOR_MEANINGS.map((c) => c.expression))
  if (error) throw new Error(error.message)
  const rows = data as Row[]

  const plan: { row: Row; next: string[]; added: string[] }[] = []
  for (const c of COLOR_MEANINGS) {
    const row = rows.find((r) => r.expression === c.expression)
    if (!row) { console.log(`- ${c.expression}: 없음 → 건너뜀`); continue }
    const untouchedPending = row.status === 'pending' && row.teacher_reviewed_at === null
    if (!untouchedPending && !(INCLUDE_APPROVED && row.status === 'approved')) {
      console.log(`- ${c.expression}: 상태 ${row.status}${row.teacher_reviewed_at ? ' · 교사 확인됨' : ''} → 건너뜀${row.status === 'approved' ? ' (--include-approved 로 포함 가능)' : ''}`)
      continue
    }
    const added = c.restore.filter((m) => !row.accepted_meanings.includes(m))
    if (added.length === 0) { console.log(`- ${c.expression}: 이미 있음 → 건너뜀`); continue }
    plan.push({ row, next: [...row.accepted_meanings, ...added], added })
    console.log(`- ${c.expression} (${row.status}): 인정 뜻 [${row.accepted_meanings.join(', ') || '-'}] + ${added.join(', ')}`)
  }
  console.log(`\n되돌릴 항목 ${plan.length}개`)
  if (!APPLY) return console.log('(미리보기) 향미 선생님이 정한 뒤 --apply 를 붙이면 백업 후 적용합니다.')
  if (plan.length === 0) return

  const at = new Date().toISOString()
  const backupFile = resolve(process.cwd(), 'backups', `color-meanings-backup-${at.replace(/[:.]/g, '-')}.json`)
  // apply-accepted-fixes.ts --restore 와 같은 형식 (id, expression, accepted_meanings)
  writeFileSync(backupFile, JSON.stringify({ taken_at: at, entries: plan.map(({ row }) => ({ id: row.id, expression: row.expression, accepted_meanings: row.accepted_meanings })) }, null, 2))
  console.log(`백업 저장: ${backupFile}`)
  let failed = 0
  for (const { row, next } of plan) {
    const { error: upError } = await supabase.from('vocabulary_entries').update({ accepted_meanings: next }).eq('id', row.id).eq('status', row.status)
    if (upError) { failed++; console.error(`❌ ${row.expression}: ${upError.message}`) }
  }
  console.log(failed === 0 ? `✅ ${plan.length}개 되돌림` : `❌ 실패 ${failed}건`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
