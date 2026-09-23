// STEP 5: 이미 저장된 4단계 지문(school/academy/advanced/prestudy)에
// tagged_body(태그) + questions(20) + essays(5)를 채워 넣는다.
// 새 passages 줄을 만들지 않고, 기존 4줄을 그대로 UPDATE한다 (group_id/variant_level 유지).
// AI API를 호출하지 않는다.
//
// 실행: npm run add-passage-set-questions -- data/passage-sets/파일이름.content.json "묶음 제목"
//
// 문항 영구 ID(qid) 보호
// - content 의 문제·서술형마다 qid 가 있어야 한다 (없으면 먼저 npm run assign-qids -- <content.json>).
//   qid 없는 예전 content 를 일부러 저장할 때만 --allow-legacy.
// - 이 스크립트는 questions/essays 배열을 "통째로 교체"한다. DB에 이미 있는 qid 가 content 에 없으면
//   그 문항의 사용이력이 끊기므로 중단한다. 정말 문항을 새로 갈아끼우는 것이면 --allow-drop-qids.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { inspectQids, qidErrors } from '../lib/passageQid.ts'

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
  const contentPath = process.argv[2]
  const title = process.argv[3]
  if (!contentPath || !title) {
    console.error('사용법: npm run add-passage-set-questions -- <content.json> "묶음 제목"')
    process.exit(1)
  }
  const content = JSON.parse(readFileSync(resolve(process.cwd(), contentPath), 'utf-8'))
  for (const v of ORDER) {
    if (!content[v]) {
      console.error(`content.json에 "${v}" 데이터가 없습니다.`)
      process.exit(1)
    }
  }

  const allowLegacy = process.argv.includes('--allow-legacy')
  const allowDropQids = process.argv.includes('--allow-drop-qids')
  let qidFailed = false
  for (const v of ORDER) {
    const problems = qidErrors(inspectQids(content[v].questions ?? [], content[v].essays ?? []), !allowLegacy)
    problems.forEach((m) => console.error(`❌ ${v}: ${m}`))
    if (problems.length > 0) qidFailed = true
  }
  if (qidFailed) {
    console.error(`먼저 실행: npm run assign-qids -- ${contentPath}`)
    process.exit(1)
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

  const { data: group, error: gErr } = await supabase
    .from('passage_groups')
    .select('id')
    .eq('title', title)
    .single()
  if (gErr || !group) {
    console.error(`묶음을 찾지 못했습니다 ("${title}"):`, gErr?.message)
    process.exit(1)
  }

  const { data: rows, error: rErr } = await supabase
    .from('passages')
    .select('id, variant_level, tagged_body, tags, questions, essays')
    .eq('group_id', group.id)
  if (rErr || !rows || rows.length !== 4) {
    console.error('기존 4개 지문을 찾지 못했습니다.', rErr?.message, '개수:', rows?.length)
    process.exit(1)
  }

  // 실패 시 되돌릴 수 있도록, 지금 상태(문제 붙이기 전)를 먼저 기억해 둔다.
  const before = new Map(rows.map((r) => [r.variant_level as string, r]))

  // DB에 이미 있는 qid 가 이번 content 에서 사라지는지 확인 (통째 교체로 이력이 끊기는 것 방지)
  const itemQids = (items: { qid?: string }[] | null | undefined) =>
    (items ?? []).map((i) => i.qid).filter((q): q is string => !!q)
  let dropCount = 0
  for (const v of ORDER) {
    const row = before.get(v)
    if (!row) continue
    const incoming = new Set([...itemQids(content[v].questions), ...itemQids(content[v].essays)])
    const dropped = [...itemQids(row.questions), ...itemQids(row.essays)].filter((q) => !incoming.has(q))
    if (dropped.length > 0) console.error(`⚠️ ${v}: DB에 있는 qid ${dropped.length}개가 이번 content 에 없습니다.`)
    dropCount += dropped.length
  }
  if (dropCount > 0 && !allowDropQids) {
    console.error('DB에 이미 저장된 문항 ID(qid)가 사라지므로 중단했습니다. 아무것도 바뀌지 않았습니다.')
    console.error('content 파일이 DB보다 예전 것인지 먼저 확인하세요. 문항을 새로 갈아끼우는 것이 맞다면 --allow-drop-qids.')
    process.exit(1)
  }
  const done: string[] = []

  for (const v of ORDER) {
    const row = before.get(v)
    if (!row) {
      console.error(`❌ ${v} 줄을 찾지 못했습니다. 여기까지 반영됨: [${done.join(', ') || '없음'}]`)
      await rollback()
      process.exit(1)
    }
    const c = content[v]
    const { error } = await supabase
      .from('passages')
      .update({
        tagged_body: c.tagged_body,
        tags: c.tags,
        questions: c.questions,
        essays: c.essays,
      })
      .eq('id', row.id)
    if (error) {
      console.error(`❌ ${v} 저장 실패: ${error.message}`)
      console.error(`여기까지 반영됨: [${done.join(', ') || '없음'}] — 지금부터 되돌립니다.`)
      await rollback()
      process.exit(1)
    }
    done.push(v)
    console.log(`✅ ${v} 저장 완료`)
  }

  console.log(`\n저장 완료: "${title}" 4단계 모두 문제·서술형·태그 반영됨 (묶음 id: ${group.id})`)
  process.exit(0)

  async function rollback() {
    for (const v of done) {
      const row = before.get(v)!
      await supabase
        .from('passages')
        .update({
          tagged_body: row.tagged_body,
          tags: row.tags,
          questions: row.questions,
          essays: row.essays,
        })
        .eq('id', row.id)
      console.log(`↩️  ${v} 원래 상태로 되돌림`)
    }
  }
}

main()
