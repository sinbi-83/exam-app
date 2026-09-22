// STEP 6-B 보관함(archived) 기능 DB 레벨 왕복 테스트. AI를 호출하지 않는다.
// 1) 테스트 그룹([테스트] My Uncle and the Rocket Launch)을 보관 → 확인 → 복원 → 확인
// 2) 그룹 자식 지문(학교형 등)을 직접 보관하려는 시도가 DB 제약으로 거부되는지 확인
// 3) 단독 지문 1개를 보관 → 확인 → 복원 → 확인 (끝나면 원래 상태로 되돌아온다)
//
// 실행: node scripts/test-archive.ts

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

  // ---------- 1) 테스트 그룹 보관/복원 ----------
  const { data: group, error: gErr } = await supabase
    .from('passage_groups')
    .select('id, title, archived, archived_at')
    .eq('user_id', userId)
    .ilike('title', '%My Uncle and the Rocket Launch%')
    .limit(1)
    .maybeSingle()

  if (gErr || !group) {
    console.log('⚠️  테스트 그룹([테스트] My Uncle and the Rocket Launch)을 찾지 못했습니다. 그룹 보관 테스트를 건너뜁니다.')
  } else {
    console.log('테스트 그룹 찾음:', group.title, group.id, '(원래 archived=', group.archived, ')')

    const archiveRes = await supabase
      .from('passage_groups')
      .update({ archived: true, archived_at: new Date().toISOString() })
      .eq('id', group.id)
      .select('archived, archived_at')
      .single()
    console.log(
      archiveRes.error ? `❌ 그룹 보관 실패: ${archiveRes.error.message}` : `✅ 그룹 보관됨 (archived=${archiveRes.data?.archived}, archived_at=${archiveRes.data?.archived_at})`,
    )

    const { data: kids } = await supabase.from('passages').select('id, variant_level, archived').eq('group_id', group.id)
    const kidsStillFalse = (kids ?? []).every((k) => k.archived === false)
    console.log(
      kidsStillFalse
        ? `✅ 그룹 보관 중에도 자식 지문(${kids?.length}개) archived=false 유지됨 (정상)`
        : '❌ 자식 지문의 archived 값이 바뀌었습니다!',
    )

    // 그룹 자식을 개별적으로 archived=true 로 만들려는 시도 → DB 제약(passages_group_archived_check)으로 거부되어야 정상
    if (kids && kids.length > 0) {
      const badAttempt = await supabase
        .from('passages')
        .update({ archived: true, archived_at: new Date().toISOString() })
        .eq('id', kids[0].id)
      console.log(
        badAttempt.error
          ? `✅ 그룹 자식 개별 보관 시도 → 거부됨 (${badAttempt.error.message})`
          : '❌ 그룹 자식이 개별적으로 보관돼 버렸습니다! (설계 위반)',
      )
    }

    const restoreRes = await supabase
      .from('passage_groups')
      .update({ archived: false, archived_at: null })
      .eq('id', group.id)
      .select('archived, archived_at')
      .single()
    console.log(
      restoreRes.error
        ? `❌ 그룹 복원 실패: ${restoreRes.error.message}`
        : `✅ 그룹 복원됨 (archived=${restoreRes.data?.archived}, archived_at=${restoreRes.data?.archived_at})`,
    )
  }

  // ---------- 2) 단독 지문 1개 보관/복원 ----------
  const { data: single, error: sErr } = await supabase
    .from('passages')
    .select('id, title, archived, archived_at')
    .eq('user_id', userId)
    .is('group_id', null)
    .limit(1)
    .maybeSingle()

  if (sErr || !single) {
    console.log('⚠️  단독 지문을 찾지 못했습니다. 단독 지문 보관 테스트를 건너뜁니다.')
  } else {
    console.log('\n단독 지문 찾음:', single.title, single.id, '(원래 archived=', single.archived, ')')

    const archiveRes = await supabase
      .from('passages')
      .update({ archived: true, archived_at: new Date().toISOString() })
      .eq('id', single.id)
      .select('archived, archived_at')
      .single()
    console.log(
      archiveRes.error
        ? `❌ 단독 지문 보관 실패: ${archiveRes.error.message}`
        : `✅ 단독 지문 보관됨 (archived=${archiveRes.data?.archived}, archived_at=${archiveRes.data?.archived_at})`,
    )

    const restoreRes = await supabase
      .from('passages')
      .update({ archived: false, archived_at: null })
      .eq('id', single.id)
      .select('archived, archived_at')
      .single()
    console.log(
      restoreRes.error
        ? `❌ 단독 지문 복원 실패: ${restoreRes.error.message}`
        : `✅ 단독 지문 복원됨 (archived=${restoreRes.data?.archived}, archived_at=${restoreRes.data?.archived_at})`,
    )
  }

  // ---------- 3) 잘못된 조합(archived=false + archived_at 값 있음) 거부 확인 ----------
  if (single) {
    const badPair = await supabase.from('passages').update({ archived: false, archived_at: new Date().toISOString() }).eq('id', single.id)
    console.log(
      badPair.error
        ? `✅ archived=false 인데 archived_at 값이 있는 잘못된 조합 → 거부됨`
        : '❌ 어긋난 조합이 저장돼 버렸습니다!',
    )
    // 만약 거부되지 않았다면(이론상 없어야 함) 원래 상태로 되돌린다.
    if (!badPair.error) {
      await supabase.from('passages').update({ archived: false, archived_at: null }).eq('id', single.id)
    }
  }

  console.log('\n테스트 완료.')
  process.exit(0)
}

main()
