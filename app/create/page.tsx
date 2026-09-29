import HubCard from '@/app/components/HubCard'

// 큰 메뉴 "시험 출제" 첫 화면: 문제 시험 / 단어 시험 / 혼합 시험 [출제] 입구
export default function CreateHubPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">시험 출제</h1>
      <p className="mb-6 text-sm text-gray-500">만든 시험은 시험 관리 &gt; 시험지 보관함에 모입니다.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <HubCard
          icon="📋"
          title="문제 시험"
          description="문제은행·외부지문에서 문제를 담아 시험지를 만듭니다."
          href="/create/problem"
          action={{ label: '출제', href: '/create/problem' }}
        />
        <HubCard
          icon="🔤"
          title="단어 시험"
          description="단어은행에서 학년·레벨로 단어를 골라 시험지를 만듭니다."
          href="/create/word"
          action={{ label: '출제', href: '/create/word' }}
        />
        <HubCard
          icon="🧪"
          title="혼합 시험"
          description="지문 1개의 객관식·주관식·문법 문항과 단어를 한 장에 담습니다."
          href="/create/mixed"
          action={{ label: '출제', href: '/create/mixed' }}
        />
      </div>
      <p className="mt-6 text-sm">
        <a href="/tests" className="text-blue-600 hover:underline">🗄️ 시험지 보관함 가기 →</a>
      </p>
    </div>
  )
}
