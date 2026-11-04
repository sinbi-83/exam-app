// 시험용 DB 에 붙여넣을 한 줄 SQL 파일을 만든다. DB 에 접속하지 않는다.
//   npm run build-test-db-sql
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EMPTY_DB_CHECK, MARKER_CHECK, SCHEMA_FILES, SCHEMA_TAIL, toOneLine } from './support/testDbSql.ts'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const write = (file: string, sql: string) => {
  writeFileSync(resolve(process.cwd(), file), sql)
  console.log(`${file} (${sql.length.toLocaleString()}자)`)
}

write('supabase/test-db/01-schema.oneline.sql', toOneLine(EMPTY_DB_CHECK, SCHEMA_FILES.map(read), SCHEMA_TAIL))
write('supabase/test-db/02-class-management.oneline.sql', toOneLine(MARKER_CHECK, [read('class-management-migration.sql')]))
write('supabase/test-db/03-class-management-rollback.oneline.sql', toOneLine(MARKER_CHECK, [read('class-management-rollback.sql')]))
