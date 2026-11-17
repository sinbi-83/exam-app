import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabaseServer'
import { loadDashboardCounts } from '@/lib/dashboardData'
import { buildTaskItems, formatTime, GRADING_WAITING_HREF, REPORTS_TO_SEND_HREF, type TodayEvent } from '@/lib/dashboard'
import PortalIcon from '../components/PortalIcon'

export const dynamic = 'force-dynamic'
const QUICK_ACTIONS = [
  { label: '시험 만들기', href: '/create', icon: 'exam' },
  { label: '채점하기', href: '/grading', icon: 'check' },
  { label: '보고서 작성', href: '/report', icon: 'mail' },
  { label: '레벨테스트', href: '/materials/level-tests', icon: 'book' },
]
const EVENT_TYPE_LABEL: Record<string, string> = { class: '수업', exam: '시험', holiday: '휴일', other: '일정' }
function EventRow({ event }: { event: TodayEvent }) {
  const start = formatTime(event.start_time)
  const end = formatTime(event.end_time)
  return <tr>
    <td className="portal-schedule-time">{start || '시간 미정'}{end && <small>~ {end}</small>}</td>
    <td><Link href="/schedule" className="portal-event-title">{event.title}</Link><span className="portal-event-type">{EVENT_TYPE_LABEL[event.event_type] ?? '일정'}</span></td>
    <td className="portal-schedule-action"><Link href={event.event_type === 'class' ? '/attendance' : '/schedule'}>{event.event_type === 'class' ? '출석 확인' : '일정 보기'}<PortalIcon name="arrow" width="15" height="15" /></Link></td>
  </tr>
}
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard')
  const { today, counts, errors, events, eventsError } = await loadDashboardCounts(supabase, user.id)
  const tasks = buildTaskItems(counts, errors)
  const date = new Date(`${today}T00:00:00Z`)
  const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' }).format(date)
  const summaries = [
    { label: '오늘 수업', count: counts.todayClasses, href: '/schedule', error: errors.todayClasses, icon: 'calendar' },
    { label: '채점 대기', count: counts.gradingWaiting, href: GRADING_WAITING_HREF, error: errors.gradingWaiting, icon: 'check' },
    { label: '보낼 보고서', count: counts.reportsToSend, href: REPORTS_TO_SEND_HREF, error: errors.reportsToSend, icon: 'mail' },
  ]
  return (
    <div className="portal-dashboard">
      <div className="portal-page-heading">
        <div><p className="portal-eyebrow">보스턴S영어 · 오늘의 교습소</p><h1>오늘의 수업과 업무</h1><p className="portal-page-description">{dateLabel} · 수업 준비부터 채점까지, 오늘 필요한 일을 한곳에서</p></div>
        <Link href="/create" className="portal-primary"><PortalIcon name="plus" />시험 만들기</Link>
      </div>
      <section className="portal-summary" aria-label="오늘 업무 요약">
        {summaries.map((item) => <Link key={item.label} href={item.href}>
          <PortalIcon name={item.icon} /><span>{item.label}</span>
          {item.error ? <small className="portal-summary-error">불러오기 실패</small> : item.count === null ? <small className="portal-summary-error">집계 준비 중</small> : <strong>{item.count}</strong>}
        </Link>)}
      </section>
      <div className="portal-dashboard-grid">
        <section className="portal-panel" aria-labelledby="today-schedule-title">
          <div className="portal-panel-heading"><h2 id="today-schedule-title"><PortalIcon name="calendar" />오늘의 수업 일정</h2><Link href="/schedule">일정 관리<PortalIcon name="arrow" width="14" height="14" /></Link></div>
          {eventsError ? <div className="portal-empty"><p>{eventsError}</p><Link href="/schedule">일정 화면에서 확인하기 →</Link></div> : events.length ? <div className="portal-table-scroll"><table className="portal-schedule"><thead><tr><th scope="col">시간</th><th scope="col">수업·일정</th><th scope="col">바로가기</th></tr></thead><tbody>{events.map((event) => <EventRow key={event.id} event={event} />)}</tbody></table></div> : <div className="portal-empty"><PortalIcon name="calendar" width="32" height="32" /><p>오늘 등록된 수업 일정 없음</p><span>수업 일정을 등록하면 이곳에 표시됩니다.</span><Link href="/schedule">수업 일정 등록하기 →</Link></div>}
        </section>
        <section className="portal-panel" aria-labelledby="priority-tasks-title">
          <div className="portal-panel-heading"><h2 id="priority-tasks-title"><PortalIcon name="check" />우선 처리 업무</h2></div>
          {tasks.length ? <ul className="portal-tasks">{tasks.map((item) => <li key={item.key}><Link href={item.href} className={item.tone === 'danger' ? 'is-urgent' : ''}>
            <span className="portal-task-marker" aria-hidden="true" /><span className="portal-task-copy"><strong>{item.label}</strong>{item.note && <small>{item.note}</small>}{item.error && <small className="portal-task-error">{item.error}</small>}</span>
            {!item.error && <span className="portal-task-count">{item.count}<small>{item.unit}</small></span>}<PortalIcon name="arrow" width="17" height="17" />
          </Link></li>)}</ul> : <div className="portal-empty"><PortalIcon name="check" width="32" height="32" /><p>현재 처리 대기 중인 업무가 없습니다</p><span>필요한 일이 생기면 이곳에서 바로 확인할 수 있어요.</span></div>}
        </section>
      </div>
      <section className="portal-quick-section" aria-label="자주 하는 작업"><h2>빠른 실행</h2><div className="portal-quick-actions">{QUICK_ACTIONS.map((action) => <Link href={action.href} key={action.href}><PortalIcon name={action.icon} width="27" height="27" /><span>{action.label}</span><PortalIcon name="arrow" width="16" height="16" /></Link>)}</div></section>
    </div>
  )
}