// 5단계 메뉴 개편 점검 (DB·서버 접속 없음, 파일만 본다).
//   1) 0단계 보고서의 옛 주소 15개가 모두 새 주소로 연결되는지 (config/legacyRoutes.json)
//   2) 연결되는 새 주소마다 실제 화면 파일(page.tsx)이 있는지
//   3) 메뉴(config/navigation.ts)의 모든 주소에 화면 파일이 있는지
//   4) 코드 안에 옛 주소로 가는 직접 링크가 남아 있지 않은지
//   5) 인쇄 화면 sessionStorage 키 2개(printData, searchPrintData)를 쓰는 쪽과 읽는 쪽이 같은지
// 실행: npm run test-legacy-routes

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { activeNavGroup, isNavItemActive, NAV_GROUPS, NAV_LEGACY } from '../config/navigation.ts'

const ROOT = process.cwd()
const legacy = JSON.parse(readFileSync(resolve(ROOT, 'config/legacyRoutes.json'), 'utf-8')) as {
  redirects: { source: string; destination: string }[]
}

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

// 0단계 보고서 4장 Q4 "자동 연결이 필요한 주소 목록" 15개
const STAGE0_OLD_ROUTES = [
  '/ai-passage', '/passages', '/external-passages', '/external-passages/:id', '/external-passages/:id/print',
  '/questions', '/questions/:id', '/question-search', '/question-search/print',
  '/exams', '/exams/:id', '/exams/:id/print', '/vocabulary', '/vocab-test', '/vocab-test/print',
]

// "/tests/:id/print" → app/tests/[id]/print/page.tsx 가 있는지
function pageExists(route: string): boolean {
  const segs = route.split('/').filter(Boolean)
  let dir = resolve(ROOT, 'app')
  for (const s of segs) {
    if (s.startsWith(':')) {
      const dyn = existsSync(dir) ? readdirSync(dir).find((d) => /^\[[^\].]+\]$/.test(d)) : undefined
      if (!dyn) return false
      dir = join(dir, dyn)
    } else {
      dir = join(dir, s)
    }
  }
  return existsSync(join(dir, 'page.tsx'))
}

// 옛 주소 규칙에 실제 주소 하나를 대입해 본다 (Next redirects 와 같은 방식: :id 는 한 칸)
function redirectOf(path: string): string | null {
  for (const r of legacy.redirects) {
    const re = new RegExp('^' + r.source.replace(/:[a-z]+/g, '([^/]+)') + '$')
    const m = path.match(re)
    if (m) {
      let i = 1
      return r.destination.replace(/:[a-z]+/g, () => m[i++])
    }
  }
  return null
}

test('0단계 옛 주소 15개가 모두 연결 목록에 있다', () => {
  const sources = new Set(legacy.redirects.map((r) => r.source))
  const missing = STAGE0_OLD_ROUTES.filter((r) => !sources.has(r))
  assert.deepEqual(missing, [])
  assert.equal(STAGE0_OLD_ROUTES.length, 15)
})

test('연결되는 새 주소마다 화면 파일이 있다', () => {
  const broken = legacy.redirects.filter((r) => !pageExists(r.destination)).map((r) => `${r.source} → ${r.destination}`)
  assert.deepEqual(broken, [])
})

test('옛 주소 예시가 정확한 새 주소로 간다 (주소 뒤 값 유지는 Next 기본 동작)', () => {
  const id = '6f1c2b1e-0000-4000-8000-000000000001'
  const cases: [string, string][] = [
    ['/exams', '/tests'],
    [`/exams/${id}`, `/tests/${id}`],
    [`/exams/${id}/print`, `/tests/${id}/print`],
    ['/vocab-test', '/create/word'],
    ['/vocab-test/print', '/create/word/print'],
    ['/vocabulary', '/materials/vocabulary'],
    ['/questions', '/materials/questions'],
    [`/questions/${id}`, `/materials/questions/${id}`],
    ['/question-search', '/materials/questions/search'],
    ['/question-search/print', '/materials/questions/search/print'],
    ['/passages', '/materials/passages/ai'],
    ['/ai-passage', '/materials/passages/ai/new'],
    ['/ai-passage/print', '/materials/passages/ai/print'],
    ['/external-passages', '/materials/passages/external'],
    [`/external-passages/${id}`, `/materials/passages/external/${id}`],
    [`/external-passages/${id}/print`, `/materials/passages/external/${id}/print`],
  ]
  for (const [from, to] of cases) assert.equal(redirectOf(from), to, from)
  // 새 주소는 다시 연결되지 않는다 (돌고 도는 연결 없음)
  for (const [, to] of cases) assert.equal(redirectOf(to), null, to)
})

test('메뉴의 모든 주소에 화면 파일이 있다 (큰 메뉴 첫 화면 포함)', () => {
  const hrefs = [...NAV_GROUPS.flatMap((g) => [...(g.href ? [g.href] : []), ...g.items.map((i) => i.href)]), ...NAV_LEGACY.map((i) => i.href)]
  const missing = hrefs.filter((h) => !pageExists(h))
  assert.deepEqual(missing, [])
})

test('모바일·데스크탑 메뉴가 같은 목록을 쓴다 (외부지문 포함)', () => {
  for (const f of ['app/components/SidebarNav.tsx', 'app/components/MobileNav.tsx']) {
    const code = readFileSync(resolve(ROOT, f), 'utf-8')
    assert.match(code, /from '@\/config\/navigation'/, f)
    assert.doesNotMatch(code, /const menuGroups/, f)
  }
  assert.ok(pageExists('/materials/passages/external'))
})

// 코드 안 직접 링크: href="/exams/..", `/exams/${..}`, router.push('/vocab-test') 등
test('코드 안에 옛 주소로 가는 직접 링크가 없다', () => {
  const OLD = /['"`](\/(?:exams|vocab-test|vocabulary|questions|question-search|passages|external-passages|ai-passage))(?=[/'"`?$])/
  const hits: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (name === 'api') continue // API 주소(/api/passages 등)는 화면 주소가 아니다
        walk(p)
      } else if (/\.tsx?$/.test(name)) {
        readFileSync(p, 'utf-8').split('\n').forEach((line, i) => {
          if (OLD.test(line) && !line.includes('/api/')) hits.push(`${relative(ROOT, p)}:${i + 1}: ${line.trim()}`)
        })
      }
    }
  }
  walk(resolve(ROOT, 'app'))
  walk(resolve(ROOT, 'lib'))
  assert.deepEqual(hits, [])
})

test('6단계 A: 문항 검색·외부지문저장소가 자료 메뉴 안에 있고, 옛 주소가 그리로 연결된다', () => {
  const materials = NAV_GROUPS.find((g) => g.title === '자료')!
  const hrefs = materials.items.map((i) => i.href)
  assert.ok(hrefs.includes('/materials/questions/search'))
  assert.ok(hrefs.includes('/materials/passages/external'))
  assert.equal(redirectOf('/question-search'), '/materials/questions/search')
  assert.equal(redirectOf('/question-search/print'), '/materials/questions/search/print')
  assert.ok(pageExists('/materials/questions/search') && pageExists('/materials/questions/search/print'))
  // 모바일·데스크탑 모두 같은 목록(NAV_GROUPS)을 그리므로 모바일에도 나온다
  for (const f of ['app/components/SidebarNav.tsx', 'app/components/MobileNav.tsx']) {
    assert.match(readFileSync(resolve(ROOT, f), 'utf-8'), /NAV_GROUPS\.map/, f)
  }
})

test('지금 화면 표시는 가장 구체적인 메뉴 하나만', () => {
  const item = (href: string) => NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === href)!
  const activeOn = (path: string) => NAV_GROUPS.flatMap((g) => g.items).filter((i) => isNavItemActive(i, path)).map((i) => i.label)
  assert.deepEqual(activeOn('/materials/questions/search'), ['문항 검색'])
  assert.deepEqual(activeOn('/materials/questions/search/print'), ['문항 검색'])
  assert.deepEqual(activeOn('/materials/questions/abc'), ['문제은행'])
  assert.deepEqual(activeOn('/materials/passages/external/abc'), ['외부지문저장소'])
  assert.deepEqual(activeOn('/materials/passages/ai'), ['지문'])
  assert.deepEqual(activeOn('/tests/abc/print'), ['시험지 보관함'])
  assert.equal(activeNavGroup('/materials/questions/search'), '자료')
  assert.ok(!isNavItemActive(item('/materials/questions'), '/materials/questions/search'))
})

test('문항 검색 화면의 오래된 결과 무시 처리와 인쇄 키는 그대로', () => {
  const code = readFileSync(resolve(ROOT, 'app/materials/questions/search/page.tsx'), 'utf-8')
  assert.match(code, /searchSeq/)
  assert.match(code, /if \(seq !== searchSeq\.current\) return/)
  assert.match(code, /sessionStorage\.setItem\('searchPrintData'/)
})

test('sessionStorage 키 2개: 쓰는 곳과 읽는 곳이 짝이 맞다', () => {
  const all: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(name)) all.push(readFileSync(p, 'utf-8'))
    }
  }
  walk(resolve(ROOT, 'app'))
  const code = all.join('\n')
  for (const key of ['printData', 'searchPrintData']) {
    assert.match(code, new RegExp(`sessionStorage\\.setItem\\('${key}'`), `${key} 쓰기`)
    assert.match(code, new RegExp(`sessionStorage\\.getItem\\('${key}'`), `${key} 읽기`)
  }
})

console.log(`\n모두 통과: ${passed}개`)
