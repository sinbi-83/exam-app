// 3단계 난이도 재조정 되돌리기: stage3-apply-reanchor.ts 가 쓴 백업 파일의 base_difficulty 로 되돌리고,
// 그 실행이 남긴 이력 행(owner_approval_source_ref)만 삭제한다.
// 실행: node scripts/stage3-rollback-reanchor.ts backups/stage3-reanchor-backup-....json          → 미리보기
//       node scripts/stage3-rollback-reanchor.ts backups/stage3-reanchor-backup-....json --apply  → 되돌리기
// 주의: 적용 뒤 화면에서 바꾼 난이도도 백업 값으로 덮인다 → 미리보기로 개수를 먼저 확인한다.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { selectAllPages } from '../lib/supabasePaging.ts'

const file = process.argv[2]
const APPLY = process.argv.includes('--apply')
if (!file || file.startsWith('--')) {
  console.error('백업 파일 경로를 주세요.')
  process.exit(1)
}
const backup = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf-8')) as {
  owner_approval_source_ref: string
  entries: { id: string; expression: string; base_difficulty: number | null }[]
}

const env: Record<string, string> = {}
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

async function main() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: env.SUPABASE_LOGIN_EMAIL,
    password: env.SUPABASE_LOGIN_PASSWORD,
  })
  if (loginError) throw new Error(`로그인 실패: ${loginError.message}`)

  // 1,000행 제한 → 나눠 읽기 (lib/supabasePaging.ts)
  const cur = await selectAllPages((from, to) => supabase.from('vocabulary_entries').select('id, base_difficulty').order('id').range(from, to))
  if (cur.error) throw new Error(cur.error.message)
  const now = new Map((cur.data as { id: string; base_difficulty: number | null }[]).map((e) => [e.id, e.base_difficulty]))
  const changed = backup.entries.filter((b) => now.has(b.id) && now.get(b.id) !== b.base_difficulty)
  const records = await supabase.from('vocabulary_sources').select('id').eq('source_ref', backup.owner_approval_source_ref)
  if (records.error) throw new Error(records.error.message)

  console.log(`되돌릴 단어 ${changed.length}개 / 삭제할 이력 행 ${records.data.length}개`)
  if (!APPLY) {
    console.log('(미리보기) 실제로 되돌리려면 --apply 를 붙여 다시 실행하세요.')
    return
  }
  let failed = 0
  for (const b of changed) {
    const { error } = await supabase.from('vocabulary_entries').update({ base_difficulty: b.base_difficulty }).eq('id', b.id)
    if (error) { failed++; console.error(`❌ ${b.expression}: ${error.message}`) }
  }
  const del = await supabase.from('vocabulary_sources').delete().eq('source_ref', backup.owner_approval_source_ref)
  if (del.error) { failed++; console.error(`❌ 이력 행 삭제: ${del.error.message}`) }
  console.log(failed === 0 ? '✅ 되돌리기 완료' : `❌ 실패 ${failed}건`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
