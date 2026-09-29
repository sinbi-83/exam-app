import Link from 'next/link'
import HubCard from '@/app/components/HubCard'

// 자료 > 지문 첫 화면. AI 지문(question_sets)과 외부지문(passages)은 저장 방식이 달라서 따로 관리한다.
// 함께 보기만 하는 통합 목록(읽기 전용)은 /materials/passages/all (6단계 B).
export default function PassagesHubPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">지문</h1>
      <p className="mb-6 text-sm text-gray-500">AI 지문과 외부지문을 고르세요.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <HubCard
          icon="🤖"
          title="AI 지문"
          description="AI 로 만든 지문과 문제 세트 목록"
          href="/materials/passages/ai"
          action={{ label: '+ AI 지문 생성', href: '/materials/passages/ai/new' }}
        />
        <HubCard
          icon="🧩"
          title="외부지문 저장소"
          description="교과서·출판사 지문과 문제 (보기·편집·인쇄)"
          href="/materials/passages/external"
        />
      </div>
      <Link href="/materials/passages/all" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
        📚 AI 지문과 외부지문을 한 목록에서 보기 (통합 목록, 보기 전용) →
      </Link>
    </div>
  )
}
