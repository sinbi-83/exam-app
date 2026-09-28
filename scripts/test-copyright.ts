// 카피라이트 문구 검사 (DB 접속 없음).
// 실행: npm run test-copyright

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { copyrightLine, copyrightNotice, copyrightYears } from '../config/copyright.ts'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✅ ${name}`)
  } catch (err) {
    console.error(`❌ ${name}`)
    throw err
  }
}

test('연도: 2026년은 "2026", 이후는 "2026–올해"', () => {
  assert.equal(copyrightYears(new Date('2026-12-31T12:00:00')), '2026')
  assert.equal(copyrightYears(new Date('2027-01-01T12:00:00')), '2026–2027')
  assert.equal(copyrightYears(new Date('2030-06-01T12:00:00')), '2026–2030')
})

test('문구 4종 + 앱 하단 한 줄', () => {
  const d = new Date('2026-09-28T12:00:00')
  assert.equal(copyrightLine(d), '© 2026 보스턴S영어 · 서향미')
  assert.equal(copyrightNotice('vocabulary', d), '© 2026 보스턴S영어 · 서향미. 이 단어 데이터베이스의 무단 복제·배포를 금지합니다.')
  assert.equal(copyrightNotice('questions', d), '© 2026 보스턴S영어 · 서향미. 이 문제 데이터베이스의 무단 복제·배포를 금지합니다.')
  assert.equal(copyrightNotice('exam', d), '© 2026 보스턴S영어 · 서향미. 이 시험지의 무단 복제·배포를 금지합니다.')
  assert.equal(copyrightNotice('report', d), '© 2026 보스턴S영어 · 서향미. 이 보고서의 무단 복제·배포를 금지합니다.')
})

// 화면·코드에서 교습소 이름으로 "학원"을 쓰면 안 된다 (레벨 이름 "일반학원형/상위학원형"은 괜찮다)
test('app/·config/·lib/·public/ 에 "학원"(레벨 이름 제외)이 없다', () => {
  const hits: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(tsx?|json|css)$/.test(name)) {
        readFileSync(p, 'utf-8').split('\n').forEach((line, i) => {
          if (/학원(?!형)/.test(line) && !line.includes('"학원"') && !line.includes('학원" 명칭')) hits.push(`${p}:${i + 1}`)
        })
      }
    }
  }
  for (const d of ['app', 'config', 'lib', 'public']) walk(resolve(process.cwd(), d))
  assert.deepEqual(hits, [])
})

console.log(`\n모두 통과: ${passed}개`)
