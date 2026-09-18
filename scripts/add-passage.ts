// 지문 JSON 파일을 읽어 Supabase passages 테이블에 그대로 저장하는 스크립트.
// AI API를 호출하지 않는다 — 이미 만들어진 JSON 내용을 저장만 한다.
//
// 실행: node scripts/add-passage.ts data/passages/파일이름.json

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { PassageInput } from '../types/passageBank'

function loadEnvLocal(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env.local')
  const env: Record<string, string> = {}
  try {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim()
      env[key] = value
    }
  } catch {
    console.error('.env.local 파일을 찾을 수 없습니다.')
  }
  return env
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('사용법: node scripts/add-passage.ts <JSON 파일 경로>')
    process.exit(1)
  }

  const env = loadEnvLocal()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const loginEmail = env.SUPABASE_LOGIN_EMAIL
  const loginPassword = env.SUPABASE_LOGIN_PASSWORD

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다.')
    process.exit(1)
  }
  if (!loginEmail || !loginPassword) {
    console.error('.env.local 에 SUPABASE_LOGIN_EMAIL / SUPABASE_LOGIN_PASSWORD 값을 채워주세요.')
    process.exit(1)
  }

  const raw = readFileSync(resolve(process.cwd(), filePath), 'utf-8')
  const input: PassageInput = JSON.parse(raw)

  const requiredFields: (keyof PassageInput)[] = [
    'title', 'level', 'topic', 'body', 'tagged_body', 'tags', 'questions', 'essays',
  ]
  for (const field of requiredFields) {
    if (input[field] === undefined) {
      console.error(`JSON에 "${field}" 필드가 없습니다.`)
      process.exit(1)
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password: loginPassword,
  })
  if (authError || !authData.user) {
    console.error('로그인 실패:', authError?.message)
    process.exit(1)
  }

  const { data, error } = await supabase
    .from('passages')
    .insert({
      user_id: authData.user.id,
      title: input.title,
      level: input.level,
      topic: input.topic,
      body: input.body,
      tagged_body: input.tagged_body,
      tags: input.tags,
      questions: input.questions,
      essays: input.essays,
    })
    .select('id, title')
    .single()

  if (error) {
    console.error('저장 실패:', error.message)
    process.exit(1)
  }

  console.log(`저장 완료: ${data.title} (id: ${data.id})`)
  process.exit(0)
}

main()
