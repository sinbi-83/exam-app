// 1단계 데이터 바로잡기 되돌리기. stage1-apply-data.ts 가 쓴 백업 파일 값으로 되돌린다.
//   - vocabulary_entries: status / archived_at / approval_origin / deferred_at 을 백업 값으로
//   - vocabulary_sources: 그 실행이 만든 이력 행(owner-approval:<실행 시각>)만 삭제
//   - exams: exam_type 을 백업 값(빈 값)으로
// 실행: node scripts/stage1-rollback-data.ts backups/stage1-apply-backup-....json          → 미리보기
//       node scripts/stage1-rollback-data.ts backups/stage1-apply-backup-....json --apply  → 실제 되돌리기
// 주의: 1단계 이후 화면에서 바꾼 상태도 백업 값으로 덮인다 → 되돌리기 전에 미리보기로 바뀌는 개수를 확인한다.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const file = process.argv[2]
const APPLY = process.argv.includes('--apply')
if (!file || file.startsWith('--')) {
  console.error('백업 파일 경로를 주세요: node scripts/stage1-rollback-data.ts backups/stage1-apply-backup-....json')
  process.exit(1)
}

type BackupEntry = { id: string; expression: string; status: string; archived_at: string | null; approval_origin: string | null; deferred_at: string | null }
const backup = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf-8')) as {
  owner_approval_source_ref: string
  vocabulary_entries: BackupEntry[]
  exams: { id: string; title: string; exam_type: string | null }[]
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

  const cur = await supabase.from('vocabulary_entries').select('id, status, archived_at, approval_origin, deferred_at')
  if (cur.error) throw new Error(cur.error.message)
  const now = new Map((cur.data as BackupEntry[]).map((e) => [e.id, e]))
  const changed = backup.vocabulary_entries.filter((b) => {
    const c = now.get(b.id)
    return c && (c.status !== b.status || c.archived_at !== b.archived_at || c.approval_origin !== b.approval_origin || c.deferred_at !== b.deferred_at)
  })
  const records = await supabase.from('vocabulary_sources').select('id').eq('source_ref', backup.owner_approval_source_ref)
  if (records.error) throw new Error(records.error.message)
  const examsNow = await supabase.from('exams').select('id, exam_type')
  if (examsNow.error) throw new Error(examsNow.error.message)
  const examNow = new Map((examsNow.data as { id: string; exam_type: string | null }[]).map((e) => [e.id, e.exam_type]))
  const examChanged = backup.exams.filter((b) => examNow.has(b.id) && examNow.get(b.id) !== b.exam_type)

  console.log(`되돌릴 단어 ${changed.length}개 / 삭제할 이력 행 ${records.data.length}개 / 되돌릴 시험 ${examChanged.length}개`)
  if (!APPLY) {
    console.log('(미리보기) 실제로 되돌리려면 --apply 를 붙여 다시 실행하세요.')
    return
  }
  let failed = 0
  for (const b of changed) {
    const { error } = await supabase
      .from('vocabulary_entries')
      .update({ status: b.status, archived_at: b.archived_at, approval_origin: b.approval_origin, deferred_at: b.deferred_at })
      .eq('id', b.id)
    if (error) { failed++; console.error(`❌ ${b.expression}: ${error.message}`) }
  }
  const del = await supabase.from('vocabulary_sources').delete().eq('source_ref', backup.owner_approval_source_ref)
  if (del.error) { failed++; console.error(`❌ 이력 행 삭제: ${del.error.message}`) }
  for (const b of examChanged) {
    const { error } = await supabase.from('exams').update({ exam_type: b.exam_type }).eq('id', b.id)
    if (error) { failed++; console.error(`❌ 시험 ${b.title}: ${error.message}`) }
  }
  console.log(failed === 0 ? '✅ 되돌리기 완료' : `❌ 실패 ${failed}건`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
