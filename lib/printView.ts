// 시험 인쇄 출력 방식 (학생용 / 교사용 / 답안지만).
// 저장된 시험 문항(question_data snapshot)은 그대로 두고, 인쇄할 때 무엇을 보여줄지만 정한다.
// 주소에 ?view= 가 없거나 모르는 값이면 항상 학생용(문제만) → 그냥 인쇄해도 답이 찍히지 않는다.

export type PrintView = 'student' | 'teacher' | 'answers'

export const PRINT_VIEWS: readonly PrintView[] = ['student', 'teacher', 'answers']

export const PRINT_VIEW_LABELS: Record<PrintView, string> = {
  student: '학생용',
  teacher: '교사용',
  answers: '답안지만',
}

export const PRINT_VIEW_HINTS: Record<PrintView, string> = {
  student: '문제만 인쇄합니다',
  teacher: '문제 + 뒷장에 정답·해설',
  answers: '정답·해설만 인쇄합니다',
}

export function parsePrintView(value: string | null | undefined): PrintView {
  return value === 'teacher' || value === 'answers' ? value : 'student'
}

export function includesQuestions(view: PrintView): boolean {
  return view !== 'answers'
}

export function includesAnswers(view: PrintView): boolean {
  return view !== 'student'
}

// PDF 파일 이름: 학생용은 시험 제목 그대로 (나눠줄 파일)
export function printFileName(title: string, view: PrintView): string {
  if (view === 'teacher') return `${title} (교사용)`
  if (view === 'answers') return `${title} (정답)`
  return title
}

const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

// 정답 한 줄: 객관식은 보기 번호를 붙인다 ("② apple"). 보기에 없거나 주관식이면 답 그대로.
export function formatAnswer(q: { answer?: string | null; options?: string[] | null }): string {
  const answer = (q.answer ?? '').trim()
  if (!answer) return '-'
  const idx = Array.isArray(q.options) ? q.options.indexOf(answer) : -1
  if (idx === -1) return answer
  return `${CHOICE_MARK[idx] ?? `(${idx + 1})`} ${answer}`
}

// 해설: 비어 있으면 null (해설 칸 자체를 그리지 않는다)
export function formatExplanation(q: { explanation?: string | null }): string | null {
  const e = (q.explanation ?? '').trim()
  return e ? e : null
}
