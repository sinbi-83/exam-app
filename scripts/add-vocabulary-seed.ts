// 단어은행 seed JSON(data/vocabulary/*.json)을 vocabulary_entries + vocabulary_sources 에 저장한다.
// AI API 를 호출하지 않는다 — 이미 만들어진 JSON 내용을 저장만 한다.
//
// 실행: npm run add-vocabulary-seed -- data/vocabulary/bostons-teacher-seed-v1.json [--dry-run]
//
// - 새 어휘 추가 + 새 출처 추가만 한다. 이미 같은 활성 어휘가 있으면 건너뛴다 (기존 항목은 바꾸지 않는다).
// - 출처는 source_type='teacher' (BostonS teacher seed). 공식어휘(official)로 표시하지 않는다.
// - 기능 검증용으로 status='approved', approval_origin='batch' 로 넣는다. teacher_reviewed_at 은 비워 둔다
//   (향미 선생님이 /vocabulary 에서 확인·수정하면 그때 기록된다).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { findActiveDuplicates, validateEntryInput, vocabularyDbErrorMessage } from '../lib/vocabulary.ts'
import type { VocabularyEntryInput, VocabularyEntryType, VocabularyPos } from '../types/vocabulary'

interface SeedEntry {
  expression: string
  lemma: string | null
  entry_type: VocabularyEntryType
  pos: VocabularyPos | null
  meaning_ko: string
  accepted_meanings: string[]
  base_difficulty: number
  ko_en_allowed: boolean
  sense_note?: string
  surface_form?: string
}

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {}
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return env
}

async function main() {
  const filePath = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!filePath) {
    console.error('사용법: npm run add-vocabulary-seed -- <JSON 파일> [--dry-run]')
    process.exit(1)
  }
  const seed: { seed_id: string; note: string; entries: SeedEntry[] } = JSON.parse(readFileSync(resolve(process.cwd(), filePath), 'utf-8'))
  if (!seed.seed_id || !Array.isArray(seed.entries)) {
    console.error('seed_id / entries 가 필요합니다.')
    process.exit(1)
  }

  const inputs: VocabularyEntryInput[] = seed.entries.map((s) => ({
    expression: s.expression,
    lemma: s.lemma ?? null,
    entry_type: s.entry_type,
    pos: s.pos ?? null,
    meaning_ko: s.meaning_ko,
    accepted_meanings: s.accepted_meanings ?? [],
    sense_note: s.sense_note ?? null,
    example_sentence: null,
    base_difficulty: s.base_difficulty,
    ko_en_difficulty: null,
    ko_en_allowed: s.ko_en_allowed,
    status: 'approved',
    reject_reason: null,
    reject_note: null,
    approval_origin: 'batch',
    teacher_reviewed_at: null,
    archived_at: null,
    deleted_at: null,
  }))

  let invalid = 0
  inputs.forEach((input, i) => {
    const errors = validateEntryInput(input)
    if (errors.length) {
      invalid++
      console.error(`❌ ${i + 1}. ${input.expression}: ${errors.join(' / ')}`)
    }
  })
  const withinBatch = findActiveDuplicates(inputs).filter((d) => d.reason === 'within_batch')
  for (const d of withinBatch) console.error(`❌ 파일 안 중복: ${d.candidate.expression} (${d.candidate.meaning_ko})`)
  if (invalid || withinBatch.length) process.exit(1)

  const env = loadEnvLocal()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: login, error: loginError } = await supabase.auth.signInWithPassword({
    email: env.SUPABASE_LOGIN_EMAIL,
    password: env.SUPABASE_LOGIN_PASSWORD,
  })
  if (loginError || !login.user) {
    console.error('로그인 실패:', loginError?.message)
    process.exit(1)
  }
  const userId = login.user.id

  const { data: existing, error: existingError } = await supabase
    .from('vocabulary_entries')
    .select('expression, pos, meaning_ko, deleted_at')
  if (existingError) {
    console.error('기존 어휘 조회 실패:', existingError.message)
    process.exit(1)
  }
  const skip = new Set(findActiveDuplicates(inputs, existing ?? []).map((d) => d.candidate))
  const todo = inputs.map((input, i) => ({ input, seed: seed.entries[i] })).filter((x) => !skip.has(x.input))

  console.log(`파일 ${inputs.length}개 / 이미 있음(건너뜀) ${skip.size}개 / 새로 저장 ${todo.length}개${dryRun ? '  [dry-run: 저장 안 함]' : ''}`)
  if (dryRun) return

  let saved = 0
  for (const { input, seed: s } of todo) {
    const { data: entry, error } = await supabase
      .from('vocabulary_entries')
      .insert({ ...input, user_id: userId })
      .select('id')
      .single()
    if (error || !entry) {
      console.error(`❌ ${input.expression} (${input.meaning_ko}): ${vocabularyDbErrorMessage(error)}`)
      continue
    }
    const { error: sourceError } = await supabase.from('vocabulary_sources').insert({
      user_id: userId,
      entry_id: entry.id,
      source_type: 'teacher',
      source_ref: seed.seed_id,
      surface_form: s.surface_form ?? null,
      source_sentence: null,
      context_meaning: null,
      suggested_difficulty: s.base_difficulty,
      rationale: '기능 검증용 BostonS teacher seed. 난이도는 중1 임시 기준(향미 선생님 검수 전).',
      created_by: 'claude',
      official_source_name: null,
      official_source_version: null,
      official_grade: null,
    })
    if (sourceError) {
      // 출처 없이 어휘만 남지 않게 되돌린다
      await supabase.from('vocabulary_entries').delete().eq('id', entry.id)
      console.error(`❌ ${input.expression} 출처 저장 실패 → 어휘도 취소: ${vocabularyDbErrorMessage(sourceError)}`)
      continue
    }
    saved++
  }
  console.log(`✅ 저장 완료: ${saved}개`)
}

main()
