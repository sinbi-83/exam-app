'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface QuestionSetSummary {
  id: string
  grade: string
  topic: string
  created_at: string
}

export default function QuestionsPage() {
  const [items, setItems] = useState<QuestionSetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchList() {
      try {
        const res = await fetch('/api/question-sets')
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || '목록을 불러오지 못했습니다.')
          return
        }
        setItems(data.data)
      } catch {
        setError('서버와 통신 중 문제가 발생했어요.')
      } finally {
        setLoading(false)
      }
    }
    fetchList()
  }, [])

  if (loading) {
    return <p className="p-8 text-sm text-gray-500">불러오는 중...</p>
  }

  if (error) {
    return <p className="p-8 text-sm text-red-500">{error}</p>
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-lg font-medium text-gray-700">문제은행</p>
        <p className="mt-2 text-sm text-gray-400">
          아직 저장된 문제가 없습니다. AI 지문 생성에서 문제를 만들어보세요.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold">문제은행</h1>
      <div className="space-y-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/questions/${item.id}`}
            className="block rounded-lg border border-gray-200 bg-white p-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{item.topic}</p>
                <p className="text-sm text-gray-500">{item.grade}</p>
              </div>
              <p className="text-xs text-gray-400">
                {new Date(item.created_at).toLocaleDateString('ko-KR')}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}