// 1단계 데이터 변경 전 백업 (읽기만 한다). 되돌릴 때 이 파일 값을 기준으로 쓴다.
// 실행: node scripts/backup-stage1.ts  → backups/stage1-before-<시각>.json
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env: Record<string, string> = {}
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { error: loginError } = await supabase.auth.signInWithPassword({
  email: env.SUPABASE_LOGIN_EMAIL,
  password: env.SUPABASE_LOGIN_PASSWORD,
})
if (loginError) throw new Error(`로그인 실패: ${loginError.message}`)

const vocab = await supabase
  .from('vocabulary_entries')
  .select('id, expression, status, archived_at, approval_origin, teacher_reviewed_at, updated_at')
  .order('created_at')
if (vocab.error) throw new Error(vocab.error.message)

// exam_type 칸은 migration 전에는 없다 → 없으면 null 로 기록
type ExamRow = { id: string; title: string; exam_type?: string | null }
let exams: { data: ExamRow[] | null; error: { message: string } | null } = await supabase
  .from('exams')
  .select('id, title, exam_type')
  .order('created_at')
let examTypeColumn = true
if (exams.error) {
  examTypeColumn = false
  exams = await supabase.from('exams').select('id, title').order('created_at')
  if (exams.error) throw new Error(exams.error.message)
}

const takenAt = new Date().toISOString()
const out = {
  taken_at: takenAt,
  exam_type_column_exists: examTypeColumn,
  vocabulary_entries: vocab.data,
  exams: (exams.data ?? []).map((e: Record<string, unknown>) => ({ exam_type: null, ...e })),
}
const file = resolve(process.cwd(), 'backups', `stage1-before-${takenAt.replace(/[:.]/g, '-')}.json`)
writeFileSync(file, JSON.stringify(out, null, 2))
const byStatus: Record<string, number> = {}
for (const v of vocab.data ?? []) byStatus[v.status] = (byStatus[v.status] ?? 0) + 1
console.log(`백업 저장: ${file}`)
console.log(`단어 ${vocab.data?.length}개`, byStatus, `/ 시험 ${out.exams.length}개 (exam_type 칸 ${examTypeColumn ? '있음' : '없음'})`)
