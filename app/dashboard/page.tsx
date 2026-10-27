import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabaseServer'
import { loadDashboardCounts } from '@/lib/dashboardData'
import { buildDashboardItems, splitByAttention, type DashboardItem } from '@/lib/dashboard'

// 대시보드 1단계 (2026-10-27): 로그인 뒤 첫 화면. 영역 ① 오늘 할 일 + 영역 ④ 빠른 실행.
// 보여주기만 한다 — 항목을 누르면 원래 처리 화면으로 간다. 숫자 계산 규칙은 lib/dashboard.ts.
// 휴대폰: 위에서 아래로 한 줄씩 / 큰 화면: 같은 항목을 2~3칸으로 펼친다.

export const dynamic = 'force-dynamic'

const QUICK_ACTIONS = [
  { label: '시험 만들기', href: '/create', icon: '📋' },
  { label: '채점하기', href: '/grading', icon: '✏️' },
  { label: '보고서 작성', href: '/report', icon: '📝' },
  { label: '레벨테스트 인쇄', href: '/materials/level-tests', icon: '📏' },
]

function formatToday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()]
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${day})`
}

function AttentionCard({ item }: { item: DashboardItem }) {
  return (
    <Link
      href={item.href}
      className="block rounded-lg border border-blue-200 bg-blue-50 p-4 hover:border-blue-400"
    >
      <p className="text-sm font-medium text-gray-700">{item.label}</p>
      <p className="mt-1 text-2xl font-bold text-blue-700">
        {item.count}
        <span className="ml-0.5 text-base font-semibold">{item.unit}</span>
      </p>
      {item.note && <p className="mt-1 text-[11px] text-gray-500">{item.note}</p>}
    </Link>
  )
}

function QuietRow({ item }: { item: DashboardItem }) {
  return (
    <Link
      href={item.href}
      className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
    >
      <span>
        {item.label}
        {item.note && <span className="ml-1.5 text-[11px] text-gray-400">· {item.note}</span>}
      </span>
      <span className="shrink-0 font-medium text-gray-600">{item.error ?? `${item.count}${item.unit}`}</span>
    </Link>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard')

  const { today, counts, errors } = await loadDashboardCounts(supabase, user.id)
  const { attention, quiet } = splitByAttention(buildDashboardItems(counts, errors))

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">보스턴S영어 대시보드</h1>
      <p className="mb-6 text-sm text-gray-500">{formatToday(today)} · 오늘 교습소에서 처리할 일</p>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-600">① 오늘 할 일</h2>
        {attention.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((item) => (
              <AttentionCard key={item.key} item={item} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
            지금 바로 처리할 일은 없어요.
          </p>
        )}
        {quiet.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {quiet.map((item) => (
              <QuietRow key={item.key} item={item} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-600">④ 빠른 실행</h2>
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
