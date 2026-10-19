// 지문 단어장 JSON(data/wordbooks/*.json)을 passage_wordbooks 표에 저장한다 (이미 있으면 바꿔 쓴다).
// AI API 를 호출하지 않는다 — Claude Code 가 미리 쓴 뜻·품사·예문을 저장만 한다.
//
// 실행: npm run add-wordbook -- data/wordbooks/파일이름.json [--dry-run]
// 형식: data/wordbooks/README.md
//   지문 찾기: passage_id 가 있으면 그것, 없으면 title(+ variant_level) 이 정확히 같은 지문 하나.
//   이미 화면에서 고쳐 저장한 단어장이 있으면 --replace 를 붙여야 바꿔 쓴다 (선생님이 고친 뜻 보호).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { cleanWordbookWords } from '../lib/wordbook.ts'
import type { WordbookWord } from '../types/wordbook'

interface WordbookFile {
  passage_id?: string
  title?: string
  variant_level?: string | null
  words: Partial<WordbookWord>[]
}

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
    }
  } catch {
    console.error('.env.local 파일을 찾을 수 없습니다.')
  }
  return env
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('사용법: npm run add-wordbook -- data/wordbooks/파일이름.json [--dry-run] [--replace]')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')
  const replace = process.argv.includes('--replace')

  const input: WordbookFile = JSON.parse(readFileSync(resolve(process.cwd(), filePath), 'utf-8'))
  if (!input.passage_id && !input.title) {
    console.error('JSON 에 passage_id 또는 title 이 필요합니다.')
    process.exit(1)
  }
  const words = cleanWordbookWords(Array.isArray(input.words) ? input.words : [])
  if (words.length === 0) {
    console.error('words 가 비어 있습니다.')
    process.exit(1)
  }
  const emptyMeaning = words.filter((w) => !w.meaning).map((w) => w.word)
  if (emptyMeaning.length > 0) console.warn(`⚠️ 뜻이 빈 단어 ${emptyMeaning.length}개: ${emptyMeaning.join(', ')}`)

  const env = loadEnvLocal()
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_LOGIN_EMAIL || !env.SUPABASE_LOGIN_PASSWORD) {
    console.error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_LOGIN_EMAIL / SUPABASE_LOGIN_PASSWORD 가 필요합니다.')
    process.exit(1)
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: env.SUPABASE_LOGIN_EMAIL,
    password: env.SUPABASE_LOGIN_PASSWORD,
  })
  if (authError || !auth.user) {
    console.error('로그인 실패:', authError?.message)
    process.exit(1)
  }

  let query = supabase.from('passages').select('id, title, variant_level').eq('user_id', auth.user.id)
  if (input.passage_id) query = query.eq('id', input.passage_id)
  else {
    query = query.eq('title', input.title!)
    if (input.variant_level) query = query.eq('variant_level', input.variant_level)
  }
  const { data: passages, error: passageError } = await query
  if (passageError) {
    console.error('지문 찾기 실패:', passageError.message)
    process.exit(1)
  }
  if (!passages || passages.length !== 1) {
    console.error(`지문을 하나로 정할 수 없습니다 (찾은 개수: ${passages?.length ?? 0}). passage_id 나 variant_level 을 넣어 주세요.`)
    process.exit(1)
  }
  const passage = passages[0]

  const { data: existing, error: existingError } = await supabase
    .from('passage_wordbooks')
    .select('id')
    .eq('user_id', auth.user.id)
    .eq('passage_id', passage.id)
    .maybeSingle()
  if (existingError) {
    console.error('단어장 표 읽기 실패:', existingError.message, '(passage-wordbooks-migration.sql 실행 여부 확인)')
    process.exit(1)
  }
  if (existing && !replace) {
    console.error('이 지문에는 이미 저장된 단어장이 있습니다. 바꿔 쓰려면 --replace 를 붙여 주세요 (화면에서 고친 내용이 사라짐).')
    process.exit(1)
  }

  console.log(`지문: ${passage.title}${passage.variant_level ? ` (${passage.variant_level})` : ''} · ${words.length}단어${existing ? ' · 기존 단어장 바꿔 쓰기' : ''}`)
  if (dryRun) {
    console.log('--dry-run: 저장하지 않았습니다.')
    process.exit(0)
  }
  const { error } = await supabase
    .from('passage_wordbooks')
    .upsert(
      { user_id: auth.user.id, passage_id: passage.id, words, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,passage_id' },
    )
  if (error) {
    console.error('저장 실패:', error.message)
    process.exit(1)
  }
  console.log('저장 완료')
  process.exit(0)
}

main()
