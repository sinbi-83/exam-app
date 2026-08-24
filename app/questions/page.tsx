'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getDifficultyLabel, getDifficultyBadgeClass, computeSetStats } from '@/lib/tagDisplay'

interface QuestionLike {
  type: string
  difficulty: string
}

interface QuestionSetSummary {
  id: string
  grade: string
  topic: string
  created_at: string
  questions: QuestionLike[] | null
}

type SortOption = 'newest' | 'oldest' | 'title'

export default function QuestionsPage() {
  const [items, setItems] = useState<QuestionSetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [searchText, setSearchText] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'vocab' | 'grammar'>('all')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [sortOption, setSortOption] = useState<SortOption>('newest')

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

  const gradeOptions = useMemo(() => {
    const set = new Set(items.map((i) => i.grade).filter(Boolean))
    return Array.from(set)
  }, [items])

  const filteredAndSorted = useMemo(() => {
    let result = items.filter((item) => {
      const stats = computeSetStats(item.questions)

      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase()
        const matchesText =
          item.topic?.toLowerCase().includes(q) || item.grade?.toLowerCase().includes(q)
        if (!matchesText) return false
      }

      if (gradeFilter !== 'all' && item.grade !== gradeFilter) return false
      if (typeFilter !== 'all' && !(stats.countByType[typeFilter] > 0)) return false
      if (difficultyFilter !== 'all' && stats.dominantDifficulty !== difficultyFilter) return false

      return true
    })

    result = [...result].sort((a, b) => {
      if (sortOption === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (sortOption === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      return (a.topic || '').localeCompare(b.topic || '', 'ko')
    })

    return result
  }, [items, searchText, gradeFilter, typeFilter, difficultyFilter, sortOption])

  if (loading) {
    return <p className="p-8 text-sm text-gray-500">불러오는 중...</p>
  }

  if (error) {
    return <p className="p-8 text-sm text-red-500">{error}</p>
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-lg font-medium text-gray-700">문제은행</p>
        <p className="mt-2 text-sm text-gray-400">
          아직 저장된 문제가 없습니다. AI 지문 생성에서 문제를 만들어보세요.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-lg font-bold">문제은행</h1>

      <div className="mb-5 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="제목·주제로 검색"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />

        <div className="flex flex-wrap gap-2">
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600"
          >
            <option value="all">전체 학년</option>
            {gradeOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'vocab' | 'grammar')}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600"
          >
            <option value="all">전체 유형</option>
            <option value="vocab">어휘</option>
            <option value="grammar">어법</option>
          </select>

          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600"
          >
            <option value="all">전체 난이도</option>
            <option value="beginner">초급</option>
            <option value="intermediate">중급</option>
            <option value="advanced">고급</option>
          </select>

          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="ml-auto rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600"
          >
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="title">제목순</option>
          </select>
        </div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          조건에 맞는 문제가 없습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {filteredAndSorted.map((item) => {
            const stats = computeSetStats(item.questions)
            const vocabCount = stats.countByType['vocab'] || 0
            const grammarCount = stats.countByType['grammar'] || 0

            const tagPreview = [
              item.topic,
              vocabCount > 0 ? '어휘' : null,
              grammarCount > 0 ? '어법' : null,
              stats.dominantDifficulty ? getDifficultyLabel(stats.dominantDifficulty) : null,
            ].filter(Boolean)

            return (
              <Link
                key={item.id}
                href={`/questions/${item.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800">{item.topic}</p>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {item.grade} · {new Date(item.created_at).toLocaleDateString('ko-KR')}
                    </p>
                    <p className="mt-1.5 text-xs text-gray-500">
                      문제 {stats.total}개
                      {vocabCount > 0 && ` · 어휘 ${vocabCount}`}
                      {grammarCount > 0 && ` · 어법 ${grammarCount}`}
                    </p>
                    {tagPreview.length > 0 && (
                      <p className="mt-1.5 truncate text-xs text-gray-400">
                        태그: {tagPreview.join(', ')}
                      </p>
                    )}
                  </div>

                  {stats.dominantDifficulty && (
                    <span
                      className={`shrink-0 rounded px-2 py-1 text-[11px] font-medium ${getDifficultyBadgeClass(
                        stats.dominantDifficulty
                      )}`}
                    >
                      {getDifficultyLabel(stats.dominantDifficulty)}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}