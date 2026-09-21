// 4단계 묶음(passage_groups) DB 구조 검증용 테스트 스크립트. AI를 호출하지 않는다.
// 기존 JSON 하나를 복사해 "[테스트]" 묶음 1개 + 4개 난이도 지문을 저장하고,
// 잘못된 저장(중복/이상한 값/반쪽 값)이 DB에서 거부되는지 확인한다.
//
// 실행: node scripts/test-passage-group.ts

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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

const VARIANTS = [
  ['school', '학교형'],
  ['academy', '일반학원형'],
  ['advanced', '상위학원형'],
  ['prestudy', '선행형'],
] as const

async function main() {
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

  const base = JSON.parse(
    readFileSync(resolve(process.cwd(), 'data/passages/uncle-rocket-investment.json'), 'utf-8'),
  )

  // 1) 묶음 만들기
  const { data: group, error: gErr } = await supabase
    .from('passage_groups')
    .insert({
      user_id: userId,
      title: `[테스트] ${base.title}`,
      level: base.level,
      topic: base.topic,
      source_body: base.body,
      status: 'completed',
    })
    .select('id')
    .single()
  if (gErr || !group) {
    console.error('묶음 저장 실패:', gErr?.message)
    process.exit(1)
  }
  console.log('묶음 저장 완료:', group.id)

  const row = (variant: string, label: string) => ({
    user_id: userId,
    group_id: group.id,
    variant_level: variant,
    title: `[테스트] ${base.title}`,
    level: base.level,
    topic: base.topic,
    body: `(${label} 테스트 본문)\n\n${base.body}`,
    tagged_body: `(${label} 테스트 본문)\n\n${base.tagged_body}`,
    tags: base.tags,
    questions: base.questions,
    essays: base.essays,
  })

  // 2) 4개 난이도 저장
  for (const [variant, label] of VARIANTS) {
    const { error } = await supabase.from('passages').insert(row(variant, label))
    console.log(error ? `❌ ${label} 저장 실패: ${error.message}` : `✅ ${label} 저장`)
  }

  // 3) 나쁜 저장이 거부되는지 확인 (거부돼야 정상)
  const dup = await supabase.from('passages').insert(row('school', '학교형-중복'))
  console.log(dup.error ? '✅ 같은 난이도 중복 → 거부됨' : '❌ 중복이 저장돼 버림!')

  const bad = await supabase.from('passages').insert(row('easy', '잘못된값'))
  console.log(bad.error ? '✅ 이상한 난이도 값 → 거부됨' : '❌ 이상한 값이 저장돼 버림!')

  const half = await supabase.from('passages').insert({ ...row('school', '반쪽'), variant_level: null })
  console.log(half.error ? '✅ 번호표만 있고 난이도 없음 → 거부됨' : '❌ 반쪽 데이터가 저장돼 버림!')

  // 4) 결과 조회
  const { data: kids } = await supabase
    .from('passages')
    .select('id, variant_level')
    .eq('group_id', group.id)
  console.log('묶음에 연결된 지문 수:', kids?.length, kids?.map((k) => k.variant_level).join(', '))

  const { count } = await supabase
    .from('passages')
    .select('id', { count: 'exact', head: true })
    .is('group_id', null)
  console.log('기존 단독 지문 수(group_id 없음):', count)

  console.log('\n테스트 묶음 id:', group.id)
  process.exit(0)
}

main()
