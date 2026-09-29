// 검수 샘플표 규칙 검사 (DB 접속 없음).
// 구간별 고른 배분 / 고정 씨앗(다시 뽑아도 같음) / CSV(BOM·열·따옴표) / 채점(O·X·빈칸·판정 기준) / 만든 CSV 파일 점검
// 실행: npm run test-review-sample

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { allocate, buildReviewCsv, bucketIndex, decodeReviewFile, judgeReviewCsv, normalizeVerdict, REVIEW_CSV_HEADER, stratifiedSample, tabbedToCsv } from '../lib/reviewSample.ts'
import { parseCsv } from '../lib/officialVocabulary.ts'

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

test('난이도 구간: 1~10 / 11~40 / 41~79 / 80+', () => {
  assert.deepEqual([1, 10, 11, 40, 41, 79, 80, 100].map(bucketIndex), [0, 0, 1, 1, 2, 2, 3, 3])
  assert.equal(bucketIndex(null), -1)
})

test('구간별 배분: 고르게, 모자란 구간 몫은 다른 구간으로, 전체가 모자라면 있는 만큼', () => {
  assert.deepEqual(allocate([100, 100, 100, 100], 40), [10, 10, 10, 10])
  assert.deepEqual(allocate([0, 4, 773, 200], 40), [0, 4, 18, 18])
  assert.deepEqual(allocate([509, 425, 831, 0], 40), [14, 13, 13, 0])
  assert.deepEqual(allocate([3, 2, 0, 0], 40), [3, 2, 0, 0])
})

const entries = Array.from({ length: 200 }, (_, i) => ({ id: `id-${String(i).padStart(3, '0')}`, base_difficulty: (i % 100) + 1 }))

test('고정 씨앗: 다시 뽑아도(입력 순서가 달라도) 같은 결과, 씨앗이 다르면 다른 결과', () => {
  const a = stratifiedSample(entries, 40, 7).map((e) => e.id)
  const b = stratifiedSample([...entries].reverse(), 40, 7).map((e) => e.id)
  assert.deepEqual(a, b)
  assert.equal(a.length, 40)
  assert.equal(new Set(a).size, 40)
  assert.notDeepEqual(stratifiedSample(entries, 40, 8).map((e) => e.id), a)
  // 구간별 10개씩, 난이도 순서로 정렬
  const s = stratifiedSample(entries, 40, 7)
  assert.deepEqual([0, 1, 2, 3].map((i) => s.filter((e) => bucketIndex(e.base_difficulty) === i).length), [10, 10, 10, 10])
  assert.ok(s.every((e, i) => i === 0 || (s[i - 1].base_difficulty ?? 0) <= (e.base_difficulty ?? 0)))
})

test('CSV: UTF-8 BOM, 열 순서, 따옴표 처리, 판정·메모 빈칸', () => {
  const csv = buildReviewCsv([
    { expression: 'smell', pos: '동', meaning_ko: '냄새 맡다', accepted_meanings: ['냄새가 나다', '맡다'], base_difficulty: 12, ko_en_allowed: false },
    { expression: 'say "hi"', pos: '동', meaning_ko: '말하다', accepted_meanings: [], base_difficulty: 5, ko_en_allowed: true },
  ])
  assert.ok(csv.startsWith('﻿'))
  const rows = parseCsv(csv.slice(1))
  assert.deepEqual(rows[0], [...REVIEW_CSV_HEADER])
  assert.deepEqual(rows[1], ['1', 'smell', '동', '냄새 맡다', '냄새가 나다, 맡다', '12', '불가', '', ''])
  assert.deepEqual(rows[2], ['2', 'say "hi"', '동', '말하다', '', '5', '가능', '', ''])
})

// 판정만 채운 CSV 만들기
function filled(verdicts: string[], memo: Record<number, string> = {}): string {
  const base = buildReviewCsv(verdicts.map((_, i) => ({ expression: `w${i + 1}`, pos: '명', meaning_ko: '뜻', accepted_meanings: [], base_difficulty: 10, ko_en_allowed: true })))
  const lines = base.replace(/^﻿/, '').trim().split('\r\n')
  return '﻿' + [lines[0], ...lines.slice(1).map((l, i) => l.replace(/,,$/, `,${verdicts[i]},${memo[i + 1] ?? ''}`))].join('\r\n')
}

test('채점: O/X 개수·X 비율·X 단어(메모 포함), X 2개 이하 → 일괄 사용하기 가능', () => {
  const v = Array(40).fill('O')
  v[4] = 'X'
  v[9] = 'x'
  const r = judgeReviewCsv(filled(v, { 5: '대표 뜻 바꾸기' }))
  assert.equal(r.total, 40)
  assert.equal(r.o, 38)
  assert.equal(r.x, 2)
  assert.equal(r.xRate, 2 / 40)
  assert.deepEqual(r.xWords, [{ no: '5', word: 'w5', memo: '대표 뜻 바꾸기' }, { no: '10', word: 'w10', memo: '' }])
  assert.match(r.decision, /^일괄 사용하기 가능/)
})

test('채점: X 3개 이상 → 난이도 구간별로 나눠 다시 검토, 빈칸·이상한 값이 있으면 판정 보류', () => {
  const v = Array(40).fill('O')
  v[0] = v[1] = v[2] = 'X'
  assert.match(judgeReviewCsv(filled(v)).decision, /^난이도 구간별로 나눠 다시 검토/)
  const w = Array(40).fill('O')
  w[3] = ''
  w[4] = '?'
  const r = judgeReviewCsv(filled(w))
  assert.equal(r.blank, 1)
  assert.deepEqual(r.unknown.map((u) => u.word), ['w5'])
  assert.match(r.decision, /^아직 판정할 수 없음/)
  assert.deepEqual(['O', 'o', '○', 'ㅇ', 'X', '×', ' x ', ''].map(normalizeVerdict), ['O', 'O', 'O', 'O', 'X', 'X', 'X', ''])
})

test('엑셀로 다시 저장한 파일도 읽는다: 탭 구분 · CP949(euc-kr) · 전각 Ｏ/Ｘ', () => {
  const tsv = '번호\t단어\t품사\t대표 뜻\t인정 뜻\t난이도\t한→영 가능\t판정\t메모\r\n' +
    '1\tpencil\t명\t연필\t\t2\t가능\tＯ\t\r\n' +
    '2\ttest\t명\t시험\t"검사, 테스트"\t6\t불가\tＸ\t뜻 확인\r\n'
  assert.equal(tabbedToCsv('a,b\tc'), 'a,b\tc') // 쉼표 CSV 는 그대로
  const r = judgeReviewCsv(tsv)
  assert.deepEqual([r.total, r.o, r.x], [2, 1, 1])
  assert.deepEqual(r.xWords, [{ no: '2', word: 'test', memo: '뜻 확인' }])
  // CP949 바이트: "번호" = b9 f8 c8 a3, 전각 Ｏ = a3 cf
  const cp949 = new Uint8Array([0xb9, 0xf8, 0xc8, 0xa3, 0x09, 0xa3, 0xcf])
  assert.equal(decodeReviewFile(cp949), '번호\tＯ')
  assert.equal(decodeReviewFile(new TextEncoder().encode('﻿' + 'ab,cd')), 'ab,cd') // UTF-8 BOM 은 읽을 때 빠진다
})

test('샘플표 파일: 두 파일 모두 UTF-8 BOM 쉼표 CSV · 40줄 · 번호 1~40 · 판정은 빈칸 또는 O/X', () => {
  for (const f of ['A', 'B']) {
    const text = readFileSync(new URL(`../docs/review-sample-${f}.csv`, import.meta.url), 'utf8')
    assert.ok(text.startsWith('﻿'), f)
    const rows = parseCsv(text.slice(1))
    assert.deepEqual(rows[0], [...REVIEW_CSV_HEADER], f)
    assert.equal(rows.length - 1, 40, f)
    assert.deepEqual(rows.slice(1).map((r) => r[0]), Array.from({ length: 40 }, (_, i) => String(i + 1)), f)
    assert.ok(rows.slice(1).every((r) => r.length === REVIEW_CSV_HEADER.length), f)
    // 판정은 선생님이 채운 O/X 또는 아직 빈칸
    assert.ok(rows.slice(1).every((r) => ['', 'O', 'X'].includes(r[7])), f)
    assert.equal(judgeReviewCsv(text).total, 40, f)
  }
})

console.log(`\n모두 통과: ${passed}개`)
