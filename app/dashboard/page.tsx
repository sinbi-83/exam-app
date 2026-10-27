import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabaseServer'
import { loadDashboardCounts } from '@/lib/dashboardData'
import {
  buildSummaryTiles,
  buildTaskItems,
  formatTime,
  type SummaryTile,
  type TaskItem,
  type TaskTone,
  type TodayEvent,
} from '@/lib/dashboard'

// 대시보드 (1단계 2026-10-27, 1차 조정 2026-10-28): 로그인 뒤 첫 화면.
// 상단 지표 3칸 → 처리할 일(60%) | 오늘 수업 시간표(40%) → 빠른 실행.
// 보여주기만 한다 — 숫자를 누르면 그 학생들만 골라 보이는 처리 화면으로 간다. 계산 규칙은 lib/dashboard.ts.
// 휴대폰: 위에서 아래로 한 줄씩 / 큰 화면: 약 1,400px 폭으로 펼친다.

export const dynamic = 'force-dynamic'

const QUICK_ACTIONS = [
  { label: '시험 만들기', href: '/create', icon: '📋' },
  { label: '채점하기', href: '/grading', icon: '✏️' },
  { label: '보고서 작성', href: '/report', icon: '📝' },
  { label: '레벨테스트 인쇄', href: '/materials/level-tests', icon: '📏' },
]

const TONE_CLASS: Record<TaskTone, { row: string; count: string }> = {
  danger: { row: 'border-red-200 bg-red-50 hover:border-red-400', count: 'text-red-700' },
  neutral: { row: 'border-gray-200 bg-white hover:border-gray-400', count: 'text-gray-800' },
  muted: { row: 'border-gray-200 bg-gray-50 hover:border-gray-300', count: 'text-gray-500' },
}

const EVENT_TYPE_LABEL: Record<string, string> = { class: '수업', exam: '시험', holiday: '휴일', other: '기타' }

function formatToday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()]
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${day})`
}

function SummaryCard({ tile }: { tile: SummaryTile }) {
  return (
    <Link href={tile.href} className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300">
      <p className="text-sm font-medium text-gray-600">{tile.label}</p>
      {tile.error ? (
        <p className="mt-1 text-sm text-gray-400">{tile.error}</p>
      ) : (
        <p className="mt-1 text-2xl font-bold text-gray-800">
          {tile.count}
          <span className="ml-0.5 text-base font-semibold">{tile.unit}</span>
        </p>
      )}
    </Link>
  )
}

function TaskRow({ item }: { item: TaskItem }) {
  const tone = TONE_CLASS[item.tone]
  return (
    <Link href={item.href} className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${tone.row}`}>
      <span className="text-sm font-medium text-gray-700">
        {item.label}
        {item.note && <span className="ml-1.5 text-[11px] font-normal text-gray-400">· {item.note}</span>}
      </span>
      {item.error ? (
        <span className="shrink-0 text-sm text-gray-400">{item.error}</span>
      ) : (
        <span className={`shrink-0 text-xl font-bold ${tone.count}`}>
          {item.count}
          <span className="ml-0.5 text-sm font-semibold">{item.unit}</span>
        </span>
      )}
    </Link>
  )
}

function EventRow({ event }: { event: TodayEvent }) {
  const start = formatTime(event.start_time)
  const end = formatTime(event.end_time)
  return (
    <li className="flex items-center gap-3 border-b border-gray-100 py-2.5 last:border-0">
      <span className="w-24 shrink-0 text-sm font-medium tabular-nums text-gray-700">
        {start ? (end ? `${start}~${end}` : start) : '시간 미정'}
      </span>
      <span className="flex-1 truncate text-sm text-gray-800">{event.title}</span>
      {event.event_type !== 'class' && (
        <span className="shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500">
          {EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}
        </span>
      )}
    </li>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard')

  const { today, counts, errors, events, eventsError } = await loadDashboardCounts(supabase, user.id)
  const tiles = buildSummaryTiles(counts, errors)
  const tasks = buildTaskItems(counts, errors)

  return (
    <div className="mx-auto max-w-[1400px]">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">보스턴S영어 대시보드</h1>
      <p className="mb-6 text-sm text-gray-500">{formatToday(today)} · 오늘 교습소에서 처리할 일</p>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <SummaryCard key={tile.key} tile={tile} />
        ))}
      </section>

      <div className="mb-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="mb-3 text-sm font-semibold text-gray-600">처리할 일</h2>
          {tasks.length > 0 ? (
            <div className="space-y-2">
              {tasks.map((item) => (
                <TaskRow key={item.key} item={item} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
              현재 처리 대기 중인 업무가 없습니다
            </p>
          )}
        </section>

        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-600">오늘 수업 시간표</h2>
            <Link href="/schedule" className="text-xs text-gray-400 hover:text-blue-600">
              일정 관리 →
            </Link>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-1">
            {eventsError ? (
              <p className="py-3 text-sm text-gray-400">{eventsError}</p>
            ) : events.length > 0 ? (
              <ul>
                {events.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-gray-500">오늘 등록된 수업 일정 없음</p>
            )}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-600">빠른 실행</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href + a.label}
              href={a.href}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50"
            >
              <span>{a.icon}</span>
              {a.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
