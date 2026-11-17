// 포털 개편에서 기존 메뉴 연결·가장 구체적인 활성 메뉴·독립 화면을 잃지 않는지 확인.
import assert from 'node:assert/strict'
import { NAV_GROUPS, NAV_LEGACY } from '../config/navigation.ts'
import { PORTAL_SECTIONS, isStandalonePage, portalSectionFor } from '../config/portalNavigation.ts'
const original = [...NAV_GROUPS.flatMap((g) => g.items), ...NAV_LEGACY].map((i) => i.href).sort()
const connected = PORTAL_SECTIONS.flatMap((s) => s.items).map((i) => i.href).sort()
assert.deepEqual(connected, original, '기존 기능 링크를 빠짐없이 한 번씩 보존')
assert.equal(new Set(connected).size, connected.length, '메뉴 중복 없음')
for (const [path, section] of [
  ['/dashboard', 'today'], ['/materials/passages/external/123', 'materials'],
  ['/materials/questions/search', 'materials'], ['/create/mixed', 'tests'],
  ['/tests/123', 'tests'], ['/grading', 'tests'], ['/reports', 'students'],
  ['/attendance', 'students'], ['/schedule', 'operations'], ['/notifications', 'operations'],
  ['/settings', 'settings'], ['/legacy/generator', 'operations'], ['/history/123', 'operations'],
]) assert.equal(portalSectionFor(path)?.key, section, path)
for (const path of ['/login', '/parent/abc', '/tests/abc/print', '/report/print', '/materials/level-tests/e3/A/print', '/create/word/print']) assert.equal(isStandalonePage(path), true, path)
for (const path of ['/dashboard', '/materials', '/reports', '/legacy/generator']) assert.equal(isStandalonePage(path), false, path)
console.log(`포털 메뉴 ${connected.length}개 연결 · 활성 메뉴 13개 경로 · 독립/업무 화면 10개 경로 통과`)
