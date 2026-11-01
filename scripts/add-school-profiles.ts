// 학교 정보 JSON(data/school-profiles/*.json)을 school_profiles 표에 저장한다.
// 실행: npm run add-school-profiles -- data/school-profiles/파일이름.json [--dry-run] [--replace]
//   저장 전 지금 내용을 backups/ 에 남긴다.
//   이미 글이 있는 칸은 건드리지 않는다 (선생님이 화면에서 쓴 내용 보호). --replace 를 붙여야 바꿔 쓴다.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { findSchool, SCHOOL_PROFILE_SECTIONS, type SchoolProfileContent } from '../config/schools.ts'

interface SchoolProfilesFile {
  region: string
  schools: Record<string, SchoolProfileContent>
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
    console.error('사용법: npm run add-school-profiles -- data/school-profiles/파일이름.json [--dry-run] [--replace]')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')
  const replace = process.argv.includes('--replace')

  const input: SchoolProfilesFile = JSON.parse(readFileSync(resolve(process.cwd(), filePath), 'utf-8'))
  const allowedKeys = new Set<string>(SCHOOL_PROFILE_SECTIONS.map((s) => s.key))
  for (const [slug, content] of Object.entries(input.schools)) {
    if (!findSchool(input.region, slug)) {
      console.error(`config/schools.ts 에 없는 학교입니다: ${input.region}/${slug}`)
      process.exit(1)
    }
    const unknown = Object.keys(content).filter((k) => !allowedKeys.has(k))
    if (unknown.length > 0) {
      console.error(`${slug}: 없는 칸입니다: ${unknown.join(', ')}`)
      process.exit(1)
    }
  }

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

  const { data: existing, error: readError } = await supabase
    .from('school_profiles')
    .select('school_slug, content, updated_at')
    .eq('user_id', auth.user.id)
    .eq('region', input.region)
  if (readError) {
    console.error('지금 내용 읽기 실패:', readError.message)
    process.exit(1)
  }

  if (!dryRun) {
    mkdirSync(resolve(process.cwd(), 'backups'), { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = resolve(process.cwd(), `backups/school_profiles-${input.region}-${stamp}.json`)
    writeFileSync(backupPath, JSON.stringify(existing ?? [], null, 2))
    console.log(`백업: ${backupPath} (${existing?.length ?? 0}줄)`)
  }

  for (const [slug, incoming] of Object.entries(input.schools)) {
    const current = (existing?.find((row) => row.school_slug === slug)?.content ?? {}) as SchoolProfileContent
    const merged: SchoolProfileContent = { ...current }
    const written: string[] = []
    const kept: string[] = []
    for (const { key } of SCHOOL_PROFILE_SECTIONS) {
      const section = incoming[key]
      if (!section?.text?.trim()) continue
      if (current[key]?.text?.trim() && !replace) {
        kept.push(key)
        continue
      }
      merged[key] = section
      written.push(key)
    }
    console.log(`${slug}: 쓰는 칸 ${written.length}개 [${written.join(', ')}]${kept.length ? ` / 이미 있어 그대로 둠 [${kept.join(', ')}]` : ''}`)
    if (dryRun || written.length === 0) continue
    const { error } = await supabase
      .from('school_profiles')
      .upsert(
        { user_id: auth.user.id, region: input.region, school_slug: slug, content: merged, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,region,school_slug' },
      )
    if (error) {
      console.error(`${slug} 저장 실패:`, error.message)
      process.exit(1)
    }
  }
  console.log(dryRun ? '시험 실행이라 저장하지 않았습니다.' : '저장 완료')
}

main()
