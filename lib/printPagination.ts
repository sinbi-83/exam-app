// 시험지 일반 인쇄(문제·혼합 시험)의 쪽 나누기 규칙 (docs/print-layout-notes.md).
//
// 화면에서 각 덩어리(머리말·지문·문항·단어 줄·정답 줄)의 높이를 재고, 여기서 A4 쪽마다 어떤 덩어리가 들어갈지 정한다.
// 같은 쪽 나누기 결과를 화면 A4 미리보기 · 브라우저 인쇄 · PDF 저장이 모두 그대로 쓴다 → 세 가지 모양이 같다.
//   - 덩어리는 쪽 중간에서 자르지 않는다 (번호는 앞 장, 내용은 뒷장 같은 일이 없다)
//   - keepWithNext(구역 제목·지문)는 다음 덩어리와 같은 쪽에서 시작한다
//   - breakBefore(단어 구역·정답 장)는 새 쪽에서 시작한다
//   - 한 덩어리가 한 쪽보다 크면(아주 긴 지문 등) 새 쪽에 혼자 두고 overflow 로 표시한다 (그 쪽만 인쇄 때 자연스럽게 넘어감)
//
// 이 파일은 다른 모듈을 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

export interface PrintBlockSpec {
  height: number // px (margin 없이, 덩어리 안 아래 여백 포함)
  keepWithNext?: boolean
  breakBefore?: boolean
}

export interface Pagination {
  pages: number[][] // 쪽마다 덩어리 번호
  overflow: boolean[] // 쪽마다: 한 쪽보다 큰 덩어리가 있어 넘치는지
}

export function paginate(blocks: readonly PrintBlockSpec[], capacity: number): Pagination {
  const pages: number[][] = [[]]
  const overflow: boolean[] = [false]
  let used = 0
  const newPage = () => {
    pages.push([])
    overflow.push(false)
    used = 0
  }
  const cur = () => pages[pages.length - 1]

  let i = 0
  while (i < blocks.length) {
    if (blocks[i].breakBefore && cur().length > 0) newPage()
    // 한 단위 = keepWithNext 가 이어지는 덩어리들 + 그 다음 덩어리
    let j = i
    while (j < blocks.length - 1 && blocks[j].keepWithNext) j++
    const unit = blocks.slice(i, j + 1)
    const unitHeight = unit.reduce((s, b) => s + b.height, 0)
    if (used + unitHeight > capacity && cur().length > 0) newPage()
    if (unitHeight <= capacity) {
      for (let k = i; k <= j; k++) cur().push(k)
      used += unitHeight
    } else {
      // 단위가 한 쪽보다 크다 → 덩어리마다 넣되, 넘치면 다음 쪽으로. 한 덩어리가 한 쪽보다 크면 그 쪽은 overflow
      for (let k = i; k <= j; k++) {
        if (used + blocks[k].height > capacity && cur().length > 0) newPage()
        cur().push(k)
        used += blocks[k].height
        if (blocks[k].height > capacity) overflow[overflow.length - 1] = true
      }
    }
    i = j + 1
  }
  if (pages.length > 1 && cur().length === 0) {
    pages.pop()
    overflow.pop()
  }
  return { pages, overflow }
}

// 단어 구역: 한 줄에 cols 칸 (12개·4열 → 3줄)
export const WORD_COLUMN_CHOICES = [2, 3, 4] as const
export type WordColumns = (typeof WORD_COLUMN_CHOICES)[number]
export const DEFAULT_WORD_COLUMNS: WordColumns = 4

export function wordGridRows<T>(items: readonly T[], cols: number): T[][] {
  const n = Math.max(1, Math.floor(cols))
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n))
  return rows
}

// 객관식 보기 배치: 짧으면 한 줄, 중간이면 2열, 길면 한 줄에 하나
export type OptionLayout = 'inline' | 'two' | 'stack'
export function optionLayout(options: readonly string[]): OptionLayout {
  const longest = Math.max(0, ...options.map((o) => [...o].length))
  const total = options.reduce((s, o) => s + [...o].length, 0)
  if (longest <= 12 && total <= 50) return 'inline'
  if (longest <= 26) return 'two'
  return 'stack'
}

// 배점 표시: 모두 같으면 "문항당 4점", 다르면 "3~5점"
export function pointsLabel(points: readonly number[]): string {
  if (points.length === 0) return ''
  const min = Math.min(...points)
  const max = Math.max(...points)
  return min === max ? `문항당 ${min}점` : `${min}~${max}점`
}

// A4 쪽 크기 (mm). 높이를 1mm 줄여 브라우저 인쇄 반올림으로 빈 장이 생기지 않게 한다
export const SHEET = {
  widthMm: 210,
  heightMm: 296,
  padTopMm: 12,
  padSideMm: 14,
  padBottomMm: 14, // 아래 저작권 문구 자리 포함
} as const
export const SHEET_CONTENT_WIDTH_MM = SHEET.widthMm - SHEET.padSideMm * 2
export const SHEET_CONTENT_HEIGHT_MM = SHEET.heightMm - SHEET.padTopMm - SHEET.padBottomMm
