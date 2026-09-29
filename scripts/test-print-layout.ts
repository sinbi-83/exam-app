// 시험지 일반 인쇄(문제·혼합 시험) 모양 검사 (DB 접속 없음). docs/print-layout-notes.md
// 단어 열 배치 / 쪽 나누기(덩어리 안 자름·제목과 다음 내용 붙이기·새 쪽) / 학생용 정답 없음 / A4 미리보기 / 회귀
// 실행: npm run test-print-layout

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_WORD_COLUMNS,
  optionLayout,
  paginate,
  pointsLabel,
  SHEET,
  SHEET_CONTENT_HEIGHT_MM,
  WORD_COLUMN_CHOICES,
  wordGridRows,
} from '../lib/printPagination.ts'
import { SAMPLE_PRINT_QUESTIONS, SAMPLE_WORD_COUNT } from '../lib/printSample.ts'
import { isWordTestExam } from '../lib/wordTest.ts'

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

const sheet = readFileSync(new URL('../app/tests/[id]/print/ExamSheetPrint.tsx', import.meta.url), 'utf8')
const page = readFileSync(new URL('../app/tests/[id]/print/page.tsx', import.meta.url), 'utf8')

test('단어 열 배치: 기본 4열, 12개 → 3줄 (3열 4줄, 2열 6줄), 열 수는 2/3/4 중에서', () => {
  assert.equal(DEFAULT_WORD_COLUMNS, 4)
  assert.deepEqual([...WORD_COLUMN_CHOICES], [2, 3, 4])
  const twelve = Array.from({ length: 12 }, (_, i) => i + 1)
  assert.equal(wordGridRows(twelve, 4).length, 3)
  assert.deepEqual(wordGridRows(twelve, 4).map((r) => r.length), [4, 4, 4])
  assert.equal(wordGridRows(twelve, 3).length, 4)
  assert.equal(wordGridRows(twelve, 2).length, 6)
  assert.deepEqual(wordGridRows([1, 2, 3, 4, 5], 4).map((r) => r.length), [4, 1])
  assert.equal(SAMPLE_WORD_COUNT, 12)
  assert.equal(SAMPLE_PRINT_QUESTIONS.filter((q) => q.question_data.type === 'word').length, 12)
})

test('단어 칸: "번호. 단어 (뜻을 쓰시오/영어로 쓰시오)" + 답 밑줄, 칸마다 [단어] 배점 없음, 배점은 구역 제목에 한 번', () => {
  const cell = sheet.slice(sheet.indexOf('function WordCell'), sheet.indexOf('// ── 덩어리 목록 만들기'))
  assert.match(cell, /\(영어로 쓰시오\)' : '\(뜻을 쓰시오\)'/)
  assert.match(cell, /border-b border-gray-500/)
  assert.doesNotMatch(cell, /points|TYPE_LABELS|점/)
  assert.doesNotMatch(cell, /\.answer|accepted_answers|formatAnswer/) // 정답 없음
  assert.match(sheet, /단어 <span className="font-normal text-gray-600">\(\{pointsLabel\(words\.map\(\(w\) => w\.points\)\)\}\)/)
  assert.equal(pointsLabel([4, 4, 4]), '문항당 4점')
  assert.equal(pointsLabel([3, 5, 4]), '3~5점')
  assert.match(sheet, /gridTemplateColumns: `repeat\(\$\{wordColumns\}, minmax\(0, 1fr\)\)`/)
})

test('단어 구역은 지문 문항 뒤 (번호도 이어서), 단어가 없는 시험은 순서 그대로', () => {
  assert.match(sheet, /const nonWord = questions\.filter\(\(q\) => q\.question_data\.type !== 'word'\)/)
  assert.match(sheet, /const start = nonWord\.length/)
  assert.ok(sheet.indexOf("key: 'words-title'") > sheet.indexOf('key: `q-${eq.id}`'))
  assert.match(sheet, /key: 'words-title',[\s\S]{0,80}keepWithNext: true,\s*breakBefore: nonWord\.length > 0/)
})

test('쪽 나누기: 덩어리는 자르지 않고, 넘치면 다음 쪽으로', () => {
  const r = paginate([{ height: 60 }, { height: 30 }, { height: 20 }], 100)
  assert.deepEqual(r.pages, [[0, 1], [2]])
  assert.deepEqual(r.overflow, [false, false])
})

test('쪽 나누기: 제목·지문(keepWithNext)은 다음 덩어리와 같은 쪽에서 시작 (혼자 쪽 끝에 남지 않음)', () => {
  // 70 다음 남은 30 에 제목(10)은 들어가지만 제목+문항(10+40)은 안 들어간다 → 제목도 다음 쪽
  const r = paginate([{ height: 70 }, { height: 10, keepWithNext: true }, { height: 40 }], 100)
  assert.deepEqual(r.pages, [[0], [1, 2]])
  // 지문 + 첫 문항이 같은 쪽, 지문 뒤 문항들은 이어서
  const p = paginate([{ height: 50 }, { height: 45, keepWithNext: true }, { height: 20 }, { height: 20 }], 100)
  assert.deepEqual(p.pages, [[0], [1, 2, 3]])
})

test('쪽 나누기: breakBefore(단어 구역·정답)는 새 쪽, 한 쪽보다 큰 덩어리는 혼자 두고 overflow 표시, 빈 쪽 없음', () => {
  assert.deepEqual(paginate([{ height: 10 }, { height: 10, breakBefore: true }], 100).pages, [[0], [1]])
  assert.deepEqual(paginate([{ height: 10, breakBefore: true }], 100).pages, [[0]]) // 첫 덩어리면 새 쪽을 만들지 않음
  const big = paginate([{ height: 30 }, { height: 150, keepWithNext: true }, { height: 20 }], 100)
  assert.deepEqual(big.pages, [[0], [1], [2]])
  assert.deepEqual(big.overflow, [false, true, false])
  assert.deepEqual(paginate([], 100).pages, [[]])
})

test('break-inside 규칙: 문항·단어 칸·정답·덩어리 모두 avoid, 제목은 break-after avoid (브라우저 인쇄 보조)', () => {
  assert.match(sheet, /\.print-block \{ break-inside: avoid; page-break-inside: avoid; \}/)
  assert.match(sheet, /\.print-block\.keep-next \{ break-after: avoid; page-break-after: avoid; \}/)
  assert.match(sheet, /\.question-block, \.word-cell, \.answer-block \{ break-inside: avoid; page-break-inside: avoid; \}/)
  // 지문은 keepWithNext (첫 문항과 같은 쪽)
  assert.match(sheet, /key: `passage-\$\{gi\}`,\s*gapMm: 2\.5,\s*keepWithNext: true/)
})

test('A4 쪽 크기·인쇄 CSS: @page A4 여백 0, 쪽마다 새 장, 넘치는 쪽만 늘어남, 미리보기 표시는 인쇄 안 됨', () => {
  assert.equal(SHEET.widthMm, 210)
  assert.ok(SHEET.heightMm <= 297)
  assert.equal(SHEET_CONTENT_HEIGHT_MM, SHEET.heightMm - SHEET.padTopMm - SHEET.padBottomMm)
  assert.match(sheet, /@page \{ size: A4; margin: 0; \}/)
  assert.match(sheet, /\.sheet \{ box-shadow: none !important; border: 0 !important; break-after: page; page-break-after: always; \}/)
  assert.match(sheet, /\.sheet-wrap:last-child \.sheet \{ break-after: auto; page-break-after: auto; \}/)
  assert.match(sheet, /\.sheet\.sheet-overflow \{ height: auto;/)
  // 미리보기(기본 켜짐)의 쪽 표시 "1 / N쪽" 은 no-print
  assert.match(sheet, /const \[preview, setPreview\] = useState\(true\)/)
  assert.match(sheet, /<p className="no-print[^"]*"[^>]*>\s*\{p \+ 1\} \/ \{pages\.length\}쪽/)
  assert.match(sheet, /A4 미리보기/)
})

test('화면·인쇄·PDF 가 같은 쪽: PDF 는 .sheet 한 장씩 찍고, 저작권 문구는 쪽마다 쪽 안에', () => {
  assert.match(sheet, /document\.querySelectorAll<HTMLElement>\('\.print-area \.sheet'\)/)
  assert.match(sheet, /html2canvas\(sheet, \{ scale: 2/)
  assert.match(sheet, /<div className="sheet-footer">\{copyrightNotice\('exam'\)\}<\/div>/)
  assert.match(sheet, /saveSheetsPdf\(printFileName\(title, view\)\)/)
})

test('학생용에는 정답·해설 없음: 문항 덩어리에는 정답을 그리지 않고, 정답 구역은 includesAnswers 일 때만', () => {
  const q = sheet.slice(sheet.indexOf('function QuestionBlock'), sheet.indexOf('function WordCell'))
  assert.doesNotMatch(q, /\.answer|formatAnswer|formatExplanation|explanation/)
  const firstAnswerUse = sheet.indexOf('formatAnswer(q)')
  assert.ok(firstAnswerUse > sheet.indexOf('if (includesAnswers(view)) {'))
  assert.match(sheet, /breakBefore: includesQuestions\(view\)/) // 교사용: 정답은 새 쪽
})

test('회귀 없음: 단어만 있는 시험은 WordTestPrint (예전 PDF 방식 그대로), 그 밖은 ExamSheetPrint', () => {
  assert.equal(isWordTestExam(SAMPLE_PRINT_QUESTIONS), false)
  assert.equal(isWordTestExam([{ question_data: { type: 'word' } }]), true)
  assert.match(page, /if \(isWordTestExam\(questions\)\) \{\s*return \(\s*<WordTestPrint/)
  assert.match(page, /onPdf=\{\(name\) => downloadPdf\(name\)\}/)
  assert.match(page, /before: '\.answer-page'/) // 단어시험 PDF 옵션 그대로
  assert.match(page, /await savePdfWithFooter\(el, options, copyrightNotice\('exam'\)\)/)
  const wtp = readFileSync(new URL('../app/tests/[id]/print/WordTestPrint.tsx', import.meta.url), 'utf8')
  assert.match(wtp, /includesAnswers\(view\) && \(/)
  assert.match(wtp, /printPageCss\(copyrightNotice\('exam'\)\)/)
})

test('보기 배치: 짧으면 한 줄, 중간이면 2열, 길면 한 줄에 하나', () => {
  assert.equal(optionLayout(['조용한', '시끄러운', '빠른', '넓은', '어두운']), 'inline')
  assert.equal(optionLayout(['ask + 목적어 + to부정사', 'ask + 동명사']), 'two')
  assert.equal(optionLayout(['강을 깨끗하게 만든 학생들의 활동이 마을을 바꾸었다', '짧음']), 'stack')
})

test('샘플 화면: DB 에서 읽거나 쓰지 않는다', () => {
  const s = readFileSync(new URL('../app/tests/print-sample/page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(s, /fetch\(|supabase/)
  assert.match(s, /SAMPLE_PRINT_QUESTIONS/)
})

console.log(`\n모두 통과: ${passed}개`)
