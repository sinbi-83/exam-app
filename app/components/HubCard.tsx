import Link from 'next/link'

// 큰 메뉴 첫 화면(자료 / 시험 출제 / 지문)의 중메뉴 카드. action 이 있으면 [출제] 같은 입구 버튼을 따로 보여 준다.
export default function HubCard({
  icon,
  title,
  description,
  href,
  action,
  extra,
}: {
  icon: string
  title: string
  description: string
  href: string
  action?: { label: string; href: string }
  extra?: { label: string; href: string }[]
}) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-5">
      <Link href={href} className="group flex-1">
        <p className="text-2xl">{icon}</p>
        <p className="mt-2 font-semibold text-gray-800 group-hover:text-blue-700">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {action && (
          <Link href={action.href} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            {action.label}
          </Link>
        )}
        {(extra ?? []).map((x) => (
          <Link key={x.href} href={x.href} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            {x.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
