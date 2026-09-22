// 난이도 4단계 지문 세트(JSON)를 Supabase에 저장한다. AI API를 호출하지 않는다.
// passage_groups 1줄 + passages 4줄(school/academy/advanced/prestudy)을 한 묶음으로 저장하고,
// 중간에 실패하면 묶음을 지워서 일부만 저장되는 일이 없게 한다.
// 문제(questions)와 서술형(essays)은 STEP 5에서 만들므로 지금은 빈 배열로 저장한다.
//
// 실행: npm run add-passage-set -- data/passage-sets/파일이름.json
// (먼저 npm run check-passage-set -- 파일 로 검사 결과를 확인하세요)

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ORDER = ['school', 'academy', 'advanced', 'prestudy'] as const

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

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('사용법: npm run add-passage-set -- <JSON 파일 경로>')
    process.exit(1)
  }
  const set = JSON.parse(readFileSync(resolve(process.cwd(), filePath), 'utf-8'))
  for (const f of ['title', 'level', 'topic', 'source_body']) {
    if (!set[f]) {
      console.error(`JSON에 "${f}" 값이 없습니다.`)
      process.exit(1)
    }
  }
  for (const v of ORDER) {
    if (!set.variants?.[v]?.trim()) {
      console.error(`JSON에 ${v} 본문이 없습니다.`)
      process.exit(1)
    }
  }

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
  const userId = auth.user.id

  // 같은 제목의 묶음이 이미 있으면 중복 저장하지 않는다
  const { data: existing } = await supabase
    .from('passage_groups')
    .select('id')
    .eq('title', set.title)
    .limit(1)
  if (existing && existing.length > 0) {
    console.error(`같은 제목의 묶음이 이미 있습니다 (id: ${existing[0].id}). 저장하지 않았습니다.`)
    process.exit(1)
  }

  const { data: group, error: gErr } = await supabase
    .from('passage_groups')
    .insert({
      user_id: userId,
      title: set.title,
      level: set.level,
      topic: set.topic,
      source_body: set.source_body,
      status: 'generating',
    })
    .select('id')
    .single()
  if (gErr || !group) {
    console.error('묶음 저장 실패:', gErr?.message)
    process.exit(1)
  }

  const rows = ORDER.map((v) => ({
    user_id: userId,
    group_id: group.id,
    variant_level: v,
    title: set.title,
    level: set.level,
    topic: set.topic,
    body: set.variants[v],
    tagged_body: set.variants[v],
    tags: { vocab: [], grammar: [], topic: [] },
    questions: [],
    essays: [],
  }))

  const { error: pErr } = await supabase.from('passages').insert(rows)
  if (pErr) {
    console.error('지문 저장 실패:', pErr.message)
    await supabase.from('passage_groups').delete().eq('id', group.id)
    console.error('묶음을 되돌렸습니다. 아무것도 저장되지 않았습니다.')
    process.exit(1)
  }

  await supabase.from('passage_groups').update({ status: 'completed' }).eq('id', group.id)
  console.log(`저장 완료: ${set.title} (묶음 id: ${group.id}) — 4단계 지문 저장`)
  process.exit(0)
}

main()
