// 단어은행 목록 필터 보조 규칙 검사 (DB 접속 없음).
// 학년 바꿈 → '학년 범위 안' 자동 선택 / 범위별 개수 / 한 줄 요약 / 필터 바뀌면 선택 초기화.
// 실행: npm run test-vocabulary-list-filter

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  countByGradePosition,
  GRADE_RANGE_POSITIONS,
  gradeFilterAfterGradeChange,
  vocabularyFilterKey,
  vocabularyFilterSummary,
} from '../lib/vocabularyListFilter.ts'
import { gradeDifficultyRange, gradeRangePosition, VOCABULARY_GRADES } from '../config/vocabularyLevels.ts'

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

test('학년을 바꾸면: 기준표가 있으면 학년 범위 안, 없으면 전체', () => {
  assert.equal(gradeFilterAfterGradeChange(true), 'within')
  assert.equal(gradeFilterAfterGradeChange(false), 'all')
  // 실제 학년 기준표와 맞물려도 같은 규칙
  for (const g of VOCABULARY_GRADES) {
    const expected = gradeDifficultyRange(g) ? 'within' : 'all'
    assert.equal(gradeFilterAfterGradeChange(gradeDifficultyRange(g) !== null), expected, g)
  }
})

test('학년 범위 아래/안/위 개수: 경계값 포함, 난이도 없는 단어는 세지 않는다', () => {
  const range = { min: 20, max: 40 }
  const items = [5, 19, 20, 30, 40, 41, 90, null]
  const c = countByGradePosition(items, (d) => gradeRangePosition(d, range))
  assert.deepEqual(c, { below: 2, within: 3, above: 2 })
  assert.deepEqual([...GRADE_RANGE_POSITIONS], ['below', 'within', 'above'])
})

test('학년 범위 개수: 학년이 바뀌면 같은 목록이라도 개수가 달라진다', () => {
  const items = [5, 25, 45, 65, 85]
  const a = countByGradePosition(items, (d) => gradeRangePosition(d, { min: 1, max: 30 }))
  const b = countByGradePosition(items, (d) => gradeRangePosition(d, { min: 40, max: 70 }))
  assert.notDeepEqual(a, b)
  assert.equal(countByGradePosition(items, () => null).within, 0) // 기준 미설정
})

test('한 줄 요약: 기본 형태 "초5 기준 · 학년 범위 안 · N개"', () => {
  const base = { grade: '초5', hasGradeRange: true, gradeRangeLabel: '학년 범위 안', statusLabel: null, reviewLabel: null, zoneLabel: null, search: '', count: 12 }
  assert.equal(vocabularyFilterSummary(base), '초5 기준 · 학년 범위 안 · 12개')
  assert.equal(vocabularyFilterSummary({ ...base, gradeRangeLabel: null, count: 0 }), '초5 기준 · 학년 범위 전체 · 0개')
  assert.equal(
    vocabularyFilterSummary({ ...base, statusLabel: '확인 필요', reviewLabel: '교사 미확인', zoneLabel: '1~10', search: '  apple ' }),
    '초5 기준 · 학년 범위 안 · 확인 필요 · 교사 미확인 · 난이도 1~10 · 검색 “apple” · 12개',
  )
  assert.equal(vocabularyFilterSummary({ ...base, hasGradeRange: false, gradeRangeLabel: null }), '초5 기준 미설정 · 학년 범위 전체 · 12개')
})

test('선택 초기화 기준: 학년·상태·학년 범위·검수·난이도 구간·검색어 중 하나만 바뀌어도 값이 달라진다', () => {
  const f = { grade: '중1', status: 'all', gradeFilter: 'all', review: 'all', zone: 'all', customMin: '', customMax: '', search: '' }
  const key = vocabularyFilterKey(f)
  assert.equal(vocabularyFilterKey({ ...f }), key)
  const changes: Partial<typeof f>[] = [
    { grade: '초5' }, { status: 'pending' }, { gradeFilter: 'within' }, { review: 'unreviewed' },
    { zone: 'floor' }, { customMin: '3' }, { customMax: '50' }, { search: 'a' },
  ]
  for (const ch of changes) assert.notEqual(vocabularyFilterKey({ ...f, ...ch }), key, JSON.stringify(ch))
})

test('화면 연결: 학년 변경 시 자동 전환, 개수 표시, 요약 표시, 필터 변경 시 선택 초기화', () => {
  const page = readFileSync(new URL('../app/materials/vocabulary/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /setGradeFilter\(gradeFilterAfterGradeChange\(gradeDifficultyRange\(g\) !== null\)\)/)
  assert.match(page, /\{GRADE_RANGE_POSITION_LABELS\[p\]\} \{gradePositionCounts\[p\]\}/)
  assert.match(page, /\{filterSummary\}/)
  assert.match(page, /useEffect\(\(\) => \{ setChecked\(new Set\(\)\) \}, \[filterKey\]\)/)
  // '전체' 버튼은 그대로 전체로
  assert.match(page, /onClick=\{\(\) => setGradeFilter\('all'\)\}/)
  // 검색 버튼은 만들지 않는다
  assert.doesNotMatch(page, />\s*검색\s*</)
})

test('은은한 표시: 배지·초안 안내는 배경색만 2.5초로 오가고, 확인 필요 칸은 노란 점만. 빛 번짐·굵은 테두리 없음, 움직임 줄이기·인쇄 규칙', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  // 배경색만 연한 노랑 ↔ 조금 진한 노랑, 1px 연한 노랑 테두리
  assert.match(css, /@keyframes undecided-glow \{\s*0%, 100% \{ background-color: #fef9c3; \}\s*50% \{ background-color: #fef08a; \}\s*\}/)
  assert.match(css, /\.undecided-glow \{\s*border: 1px solid #fde68a;\s*background-color: #fef9c3;\s*animation: undecided-glow 2\.5s ease-in-out infinite;\s*\}/)
  // 점: 8px, 흐려졌다 진해진다
  assert.match(css, /@keyframes undecided-dot \{\s*0%, 100% \{ opacity: 0\.35; \}\s*50% \{ opacity: 1; \}\s*\}/)
  assert.match(css, /\.undecided-dot \{[^}]*width: 8px;[^}]*height: 8px;[^}]*animation: undecided-dot 2\.5s ease-in-out infinite;/)
  // 빛 번짐·굵은 테두리·멈춤 없음
  const block = css.slice(css.indexOf("/* '교사 확인이 필요한 곳'"))
  assert.doesNotMatch(block.slice(0, block.indexOf('@media print')), /box-shadow|3px|:hover|animation-play-state/)
  // 움직임 줄이기: 움직이지 않고 진한 쪽 노랑 고정 (테두리 추가 없음)
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.undecided-glow \{\s*animation: none;\s*background-color: #fef08a;\s*\}\s*\.undecided-dot \{\s*animation: none;\s*opacity: 1;\s*\}/)
  // 인쇄: 효과·점·배경색 모두 없음
  assert.match(css, /@media print \{\s*\.undecided-glow \{\s*animation: none !important;\s*background-color: transparent !important;\s*border-color: transparent !important;\s*\}\s*\.undecided-dot \{\s*display: none !important;/)

  const vocab = readFileSync(new URL('../app/materials/vocabulary/page.tsx', import.meta.url), 'utf8')
  const bank = readFileSync(new URL('../app/create/word/BankMode.tsx', import.meta.url), 'utf8')
  const mixed = readFileSync(new URL('../app/create/mixed/page.tsx', import.meta.url), 'utf8')
  assert.equal((vocab.match(/undecided-glow/g) ?? []).length, 2) // 결정 안 된 단어 배지 + 초안 안내
  assert.match(vocab, /undecided > 0 \? 'undecided-glow text-yellow-900'/) // N = 0 이면 없음, 진한 배경 클래스 없음
  assert.match(vocab, /undecided-glow[^"]*">\{grade\} 범위표: \{DRAFT_BAND_LABEL\}/)
  assert.doesNotMatch(vocab, /undecided-glow[^"']*bg-/) // 배경은 공용 효과로 통일
  // 확인 필요 칸: 원래 필터 스타일 + 점 (N = 0 이면 점 없음)
  assert.match(vocab, /<button key=\{s\} onClick=\{\(\) => setStatus\(s\)\} className=\{pill\(status === s\)\}>/)
  assert.match(vocab, /\{s === 'pending' && counts\.pending > 0 && <span className="undecided-dot" aria-hidden="true" \/>\}/)
  assert.equal((vocab.match(/undecided-dot/g) ?? []).length, 1)
  for (const [name, code] of [['단어시험', bank], ['혼합 시험', mixed]] as const) {
    assert.equal((code.match(/undecided-glow/g) ?? []).length, 1, name)
    assert.match(code, /undecided-glow[^"]*">\{[^}]+\} 레벨 범위는 \{DRAFT_BAND_LABEL\}/, name)
  }
})

console.log(`\n모두 통과: ${passed}개`)
