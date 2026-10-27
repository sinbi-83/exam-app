// 숙제관리 화면(app/homework)의 보기 필터. 대시보드에서 ?view= 로 넘어온다 (lib/dashboard.ts 의 주소).
// 날짜는 한국 날짜 기준 — 대시보드 숫자와 목록이 같은 규칙으로 세어지게.
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (scripts/ 에서 그대로 쓰기 위해).

// pending = 마감 지남 + 임박 (대시보드 상단 '숙제 미완료' 칸)
export type HomeworkView = 'all' | 'assigned' | 'done' | 'pending' | 'overdue' | 'due'

export const HOMEWORK_VIEWS: HomeworkView[] = ['all', 'assigned', 'done', 'pending', 'overdue', 'due']

export function parseHomeworkView(v: string | null | undefined): HomeworkView {
  return HOMEWORK_VIEWS.includes(v as HomeworkView) ? (v as HomeworkView) : 'all'
}

type HomeworkLike = { status: 'assigned' | 'done'; due_date: string | null }

// 마감 지남: 미완료 + 마감일이 오늘보다 앞
export function isOverdueOn(h: HomeworkLike, today: string): boolean {
  return h.status === 'assigned' && !!h.due_date && h.due_date < today
}

// 임박: 미완료 + 마감일이 오늘 또는 내일
export function isDueSoonOn(h: HomeworkLike, today: string, tomorrow: string): boolean {
  return h.status === 'assigned' && !!h.due_date && h.due_date >= today && h.due_date <= tomorrow
}

export function inHomeworkView(h: HomeworkLike, view: HomeworkView, today: string, tomorrow: string): boolean {
  switch (view) {
    case 'all':
      return true
    case 'assigned':
    case 'done':
      return h.status === view
    case 'pending':
      return isOverdueOn(h, today) || isDueSoonOn(h, today, tomorrow)
    case 'overdue':
      return isOverdueOn(h, today)
    case 'due':
      return isDueSoonOn(h, today, tomorrow)
  }
}
