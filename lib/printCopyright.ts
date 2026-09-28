// 인쇄물 모든 쪽 맨 아래에 카피라이트 문구 넣기 (문구는 config/copyright.ts).
//
// - 브라우저 인쇄: 쪽 아래 여백(PRINT_FOOTER_MM)을 비워 두고 그 여백에 문구를 찍는다 (@page 여백 상자, Chrome·Edge).
//   문제 내용은 여백 위에서 끝나므로 문구가 내용을 가리지 않는다.
// - PDF 저장: html2pdf 로 쪽을 나눈 뒤, 각 쪽 아래 여백에 문구 그림을 붙인다.
//   (jsPDF 기본 글꼴은 한글이 없어서 글자 대신 그림으로 넣는다)
// - 쪽 한 장(.page)의 최소 높이는 A4(297mm) − 여백 → 빈 장이 한 장 더 생기지 않게.

export const PRINT_FOOTER_MM = 7
export const PRINT_PAGE_MIN_HEIGHT = `${297 - PRINT_FOOTER_MM}mm`

const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// 인쇄 화면의 <style> 안에 넣는 @page 규칙 (기존 "@page { size: A4; margin: 0; }" 대신)
// margin: 쪽 여백을 브라우저 기본값에 맡기던 화면(문항 검색·AI 지문 인쇄)은 여백을 직접 준다.
export function printPageCss(footerText: string, margin: string = `0 0 ${PRINT_FOOTER_MM}mm 0`): string {
  return `@page { size: A4; margin: ${margin}; @bottom-center { content: ${cssString(footerText)}; font-family: 'Noto Sans KR', sans-serif; font-size: 7pt; color: #9ca3af; vertical-align: middle; } }`
}
// 브라우저 기본 여백(약 10mm)과 비슷하게, 아래만 조금 넉넉하게
export const PRINT_MARGIN_WITH_BROWSER_DEFAULT = '10mm 10mm 12mm 10mm'

// 글자를 그림(PNG)으로: 폭·높이는 mm
function footerImage(text: string): { dataUrl: string; widthMm: number; heightMm: number } | null {
  if (typeof document === 'undefined') return null
  const heightMm = 2.8
  const fontPx = 40
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const font = `${fontPx}px 'Noto Sans KR', 'Malgun Gothic', sans-serif`
  ctx.font = font
  const widthPx = Math.ceil(ctx.measureText(text).width) + 8
  const heightPx = Math.ceil(fontPx * 1.4)
  canvas.width = widthPx
  canvas.height = heightPx
  ctx.font = font // 크기를 바꾸면 설정이 지워지므로 다시
  ctx.fillStyle = '#9ca3af'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 4, heightPx / 2)
  return { dataUrl: canvas.toDataURL('image/png'), widthMm: (widthPx / heightPx) * heightMm, heightMm }
}

// jsPDF 문서의 모든 쪽 아래 여백 가운데에 문구를 붙인다
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stampPdfFooter(pdf: any, footerText: string): void {
  const img = footerImage(footerText)
  if (!img) return
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const total = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    pdf.addImage(img.dataUrl, 'PNG', (pageW - img.widthMm) / 2, pageH - PRINT_FOOTER_MM + (PRINT_FOOTER_MM - img.heightMm) / 2, img.widthMm, img.heightMm)
  }
}

// html2pdf 로 PDF 저장 + 모든 쪽 아래 문구. options 의 margin 은 아래 여백으로 바꾼다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function savePdfWithFooter(el: HTMLElement, options: any, footerText: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default
  // html2pdf 여백 순서: [위, 왼쪽, 아래, 오른쪽] (mm)
  const opts = { ...options, margin: [0, 0, PRINT_FOOTER_MM, 0] }
  // 타입 정의에는 get() 이 Promise 로 적혀 있지만 실제로는 이어 쓸 수 있는 worker 를 돌려준다 (html2pdf 공식 예제 방식)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worker: any = html2pdf().set(opts).from(el).toPdf()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await worker.get('pdf').then((pdf: any) => stampPdfFooter(pdf, footerText)).save()
}
