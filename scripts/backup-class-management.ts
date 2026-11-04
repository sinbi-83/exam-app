// 반 관리 migration 적용 전 백업 (운영 DB 를 읽기만 한다, 저장·수정 없음).
//   npm run backup-class-management                      → 계획만 보여 준다. DB 접속 없음.
//   npm run backup-class-management -- --confirm-extract → 실제 추출. 사람이 터미널에서 비밀번호를 입력해야 한다.
//   npm run backup-class-management -- --verify <파일>    → 복호화해서 표별 건수만 보여 준다. DB 접속 없음.
// 저장 위치는 프로젝트·바탕화면 밖이고, 파일은 항상 암호화한다. 비밀번호를 잃으면 복구할 수 없다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { collectSnapshot, countsOf, decryptSnapshot, encryptSnapshot, MIN_PASSPHRASE, OPTIONAL_TABLES, REQUIRED_TABLES } from './support/classBackup.ts'

const OUTPUT_DIR = join(homedir(), 'exam-app-private-backups')
const args = process.argv.slice(2)

function needTerminal(): void {
  if (process.stdin.isTTY) return
  console.error('중단: 비밀번호를 입력할 터미널이 없습니다. 사람이 직접 터미널에서 실행해야 합니다.')
  process.exit(2)
}

// 입력한 글자를 화면에 보이지 않게 읽는다
function askHidden(question: string): Promise<string> {
  return new Promise((done) => {
    process.stdout.write(question)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    let value = ''
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === '\u0003') process.exit(130)
        if (c === '\r' || c === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', onData)
          process.stdout.write('\n')
          return done(value)
        }
        if (c === '\u0008' || c === '\u007f') value = value.slice(0, -1)
        else value += c
      }
    }
    process.stdin.on('data', onData)
  })
}

function printCounts(counts: Record<string, number>, absent: string[]): void {
  for (const [table, n] of Object.entries(counts)) console.log(`  ${table}: ${n}건`)
  if (absent.length) console.log(`  표 없음 (적용 전이면 정상): ${absent.join(', ')}`)
}

// 폴더를 현재 Windows 사용자만 열 수 있게 한다. 실패하면 자료를 읽기 전에 멈춘다.
function prepareOutputDir(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  if (process.platform !== 'win32') return
  execFileSync('icacls', [OUTPUT_DIR, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(OI)(CI)F`], { stdio: 'ignore' })
}

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

if (args[0] === '--verify') {
  if (!args[1] || !existsSync(args[1])) {
    console.error('확인할 백업 파일 경로를 적어 주세요.')
    process.exit(1)
  }
  needTerminal()
  const snapshot = decryptSnapshot(readFileSync(args[1], 'utf8'), await askHidden('백업 비밀번호: '))
  console.log(`백업 시각: ${snapshot.takenAt}`)
  printCounts(countsOf(snapshot), snapshot.absent)
} else if (args[0] === '--confirm-extract') {
  needTerminal()
  const passphrase = await askHidden(`새 백업 비밀번호 (${MIN_PASSPHRASE}자 이상): `)
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`비밀번호는 ${MIN_PASSPHRASE}자 이상이어야 합니다.`)
  if (passphrase !== await askHidden('한 번 더 입력: ')) throw new Error('비밀번호가 서로 다릅니다.')

  prepareOutputDir()
  const env = readEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: loginError } = await supabase.auth.signInWithPassword({ email: env.SUPABASE_LOGIN_EMAIL, password: env.SUPABASE_LOGIN_PASSWORD })
  if (loginError) throw new Error(`로그인 실패: ${loginError.message}`)

  const snapshot = await collectSnapshot(supabase)
  const encrypted = encryptSnapshot(snapshot, passphrase)
  // 저장 전에 풀어 보고 건수가 같은지 확인한다
  if (JSON.stringify(countsOf(decryptSnapshot(encrypted, passphrase))) !== JSON.stringify(countsOf(snapshot))) throw new Error('암호화 확인 실패')
  const file = join(OUTPUT_DIR, `class-management-before-${snapshot.takenAt.replace(/[:.]/g, '-')}.enc.json`)
  writeFileSync(`${file}.tmp`, encrypted)
  renameSync(`${file}.tmp`, file)
  console.log(`저장: ${file}`)
  printCounts(countsOf(snapshot), snapshot.absent)
  console.log('비밀번호는 이 PC 밖의 안전한 곳에 적어 두세요. 잃으면 복구할 수 없습니다.')
} else {
  console.log('계획만 보여 줍니다. DB 에 접속하지 않았습니다.')
  console.log(`저장 위치: ${OUTPUT_DIR}`)
  console.log(`필수 표: ${REQUIRED_TABLES.join(', ')}`)
  console.log(`있으면 포함: ${OPTIONAL_TABLES.join(', ')}`)
  console.log('실제 추출: npm run backup-class-management -- --confirm-extract')
}
