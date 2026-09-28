import HubCard from '@/app/components/HubCard'

// 큰 메뉴 "자료" 첫 화면: 지문 / 문제은행 / 단어은행
export default function MaterialsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">자료</h1>
      <p className="mb-6 text-sm text-gray-500">시험에 쓰는 지문·문제·단어를 모아 둔 곳입니다.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <HubCard
          icon="📄"
          title="지문"
          description="AI 지문과 외부지문(교과서·출판사 지문)"
          href="/materials/passages"
          extra={[
            { label: 'AI 지문', href: '/materials/passages/ai' },
            { label: '외부지문', href: '/materials/passages/external' },
          ]}
        />
        <HubCard
          icon="🏦"
          title="문제은행"
          description="AI 지문으로 만든 문제 세트와 문항 검색"
          href="/materials/questions"
          extra={[{ label: '문항 검색', href: '/materials/questions/search' }]}
        />
        <HubCard icon="📒" title="단어은행" description="단어 뜻·난이도 검수, 확인 필요 단어 사용하기" href="/materials/vocabulary" />
      </div>
    </div>
  )
}
