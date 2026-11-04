// 반 관리 적용 전 백업의 핵심 (표 목록, 읽기, 암호화). 실행은 scripts/backup-class-management.ts.
// 학생 개인정보·성적·원비가 들어 있으므로 평문 파일을 만들지 않고, 값을 화면에 찍지 않는다 (건수만).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { selectAllPages } from '../../lib/supabasePaging.ts'

// 학생과 연결된 기존 표 전부 + 일정. 복원 순서대로 적는다 (students 가 먼저).
export const REQUIRED_TABLES = ['students', 'attendance', 'homework', 'tuition_records', 'parent_notifications', 'exam_assignments', 'exam_results', 'wrong_answer_records', 'reports', 'level_test_results', 'schedule_events'] as const
// migration 적용 뒤에만 있는 표. 없으면 "없음"으로 기록한다.
export const OPTIONAL_TABLES = ['classes', 'class_schedules', 'class_students'] as const
export const MIN_PASSPHRASE = 12

type Row = Record<string, unknown>
type DbError = { message: string; code?: string }
export type Snapshot = { takenAt: string; tables: Record<string, Row[]>; absent: string[] }

// 칸이나 표가 없을 때의 오류인지 (lib/classManagement.ts 의 판단과 같은 기준, 이 파일은 앱 코드를 import 하지 않는다)
const isMissingTable = (e: DbError) => e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readTable(supabase: any, table: string): Promise<{ rows: Row[]; error: DbError | null }> {
  const { data, error } = await selectAllPages<Row>((from, to) => supabase.from(table).select('*').order('id').range(from, to))
  return { rows: data, error }
}

// 하나라도 실패하거나 건수가 맞지 않으면 예외를 던진다 → 일부만 담긴 백업 파일을 만들지 않는다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function collectSnapshot(supabase: any, now: Date = new Date()): Promise<Snapshot> {
  const snapshot: Snapshot = { takenAt: now.toISOString(), tables: {}, absent: [] }
  for (const table of [...REQUIRED_TABLES, ...OPTIONAL_TABLES]) {
    const { rows, error } = await readTable(supabase, table)
    if (error) {
      if ((OPTIONAL_TABLES as readonly string[]).includes(table) && isMissingTable(error)) {
        snapshot.absent.push(table)
        continue
      }
      throw new Error(`${table} 읽기 실패: ${error.message}`)
    }
    const counted = await supabase.from(table).select('id', { count: 'exact', head: true })
    if (counted.error) throw new Error(`${table} 건수 확인 실패: ${counted.error.message}`)
    if (counted.count !== rows.length) throw new Error(`${table} 건수 불일치: 읽음 ${rows.length}, DB ${counted.count}`)
    snapshot.tables[table] = rows
  }
  return snapshot
}

export function countsOf(snapshot: Snapshot): Record<string, number> {
  return Object.fromEntries(Object.entries(snapshot.tables).map(([t, rows]) => [t, rows.length]))
}

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 2 ** 27 }
const deriveKey = (passphrase: string, salt: Buffer) => scryptSync(passphrase, salt, 32, SCRYPT)

export function encryptSnapshot(snapshot: Snapshot, passphrase: string): string {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`비밀번호는 ${MIN_PASSPHRASE}자 이상이어야 합니다.`)
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(snapshot), 'utf8'), cipher.final()])
  return JSON.stringify({ format: 'exam-app-class-backup-v1', cipher: 'aes-256-gcm', kdf: 'scrypt', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), body: body.toString('base64') })
}

// 비밀번호가 틀리거나 파일이 손상되면 예외를 던진다.
export function decryptSnapshot(fileText: string, passphrase: string): Snapshot {
  const f = JSON.parse(fileText)
  if (f.format !== 'exam-app-class-backup-v1') throw new Error('백업 파일 형식이 아닙니다.')
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, Buffer.from(f.salt, 'base64')), Buffer.from(f.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(f.tag, 'base64'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(f.body, 'base64')), decipher.final()]).toString('utf8'))
}
