// 4단계 공식 기본어휘(초등 권장·중·고 공통) 등록 되돌리기: 이번에 넣은 '확인 필요' 항목만 지운다 (출처 행은 CASCADE 로 함께 삭제).
// 대상 = 공식 출처(official, kr-curriculum-2022, created_by claude) + status 'pending' + 교사가 아직 손대지 않음(teacher_reviewed_at 없음)
//        + 주어진 시각 이후에 만들어진 항목. 교사가 이미 사용하기/수정한 항목은 건드리지 않는다.
// 실행: node scripts/stage4-rollback-official.ts 2026-09-28T10:56:00Z          → 미리보기
//       node scripts/stage4-rollback-official.ts 2026-09-28T10:56:00Z --apply  → 삭제

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { OFFICIAL_LIST_VERSION } from '../lib/officialVocabulary.ts'

const since = process.argv[2]
const APPLY = process.argv.includes('--apply')
if (!since || Number.isNaN(Date.parse(since))) {
  console.error('등록 시작 시각을 주세요 (예: 2026-09-28T10:56:00Z)')
  process.exit(1)
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

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('id, expression, status, teacher_reviewed_at, created_at, vocabulary_sources(source_type, source_ref, created_by)')
    .gte('created_at', since)
  if (error) throw new Error(error.message)
  type Row = { id: string; expression: string; status: string; teacher_reviewed_at: string | null; vocabulary_sources: { source_type: string; source_ref: string; created_by: string }[] }
  const rows = data as Row[]
  const fromThisRun = rows.filter((r) => r.vocabulary_sources.some((s) => s.source_type === 'official' && s.source_ref === OFFICIAL_LIST_VERSION && s.created_by === 'claude'))
  const target = fromThisRun.filter((r) => r.status === 'pending' && r.teacher_reviewed_at === null)
  console.log(`이번 등록분 ${fromThisRun.length}개 / 지울 대상(확인 필요·교사 미확인) ${target.length}개 / 교사가 이미 손댄 것(남김) ${fromThisRun.length - target.length}개`)
  if (!APPLY) {
    console.log('(미리보기) 실제로 지우려면 --apply 를 붙여 다시 실행하세요.')
    return
  }
  let deleted = 0
  for (let i = 0; i < target.length; i += 100) {
    const ids = target.slice(i, i + 100).map((r) => r.id)
    const { error: delError } = await supabase.from('vocabulary_entries').delete().in('id', ids).eq('status', 'pending').is('teacher_reviewed_at', null)
    if (delError) throw new Error(delError.message)
    deleted += ids.length
  }
  console.log(`✅ ${deleted}개 삭제`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
