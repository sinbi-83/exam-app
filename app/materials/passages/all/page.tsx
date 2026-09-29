'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  filterUnifiedRows,
  gradeSortKey,
  PASSAGE_KIND_LABELS,
  UNIFIED_DIFFICULTY_LABELS,
  type PassageKind,
  type UnifiedDifficulty,
  type UnifiedFilter,
  type UnifiedPassageRow,
} from '@/lib/passageUnified'

// 6단계 B: 지문 통합 목록 (읽기 전용). AI 지문과 외부지문을 한 목록에서 함께 본다.
// 수정·삭제·보관은 여기서 하지 않고 원래 화면으로 보낸다 (두 저장 방식이 달라서).
const KIND_BADGE: Record<PassageKind, string> = {
  ai: 'bg-purple-100 text-purple-700',
  external: 'bg-teal-100 text-teal-700',
}

export default function UnifiedPassagesPage() {
  const [rows, setRows] = useState<UnifiedPassageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<UnifiedFilter>({ kind: 'all', grade: 'all', difficulty: 'all', includeArchived: false })

  useEffect(() => {
    fetch('/api/passages-unified', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        else setRows(json.data ?? [])
      })
      .catch(() => setError('목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const gradeOptions = useMemo(
    () => [...new Set(rows.map((r) => r.grade).filter((g): g is string => g !== null))].sort((a, b) => gradeSortKey(a) - gradeSortKey(b)),
    [rows],
  )
  const hasUnknownGrade = rows.some((r) => r.grade === null)
  const shown = useMemo(() => filterUnifiedRows(rows, filter), [rows, filter])
  const kindCount = (k: PassageKind | 'all') => filterUnifiedRows(rows, { ...filter, kind: k }).length

  const set = (patch: Partial<UnifiedFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-gray-800">지문 통합 목록</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/materials/passages/ai" className="rounded border border-gray-300 px-3 py-1.5 text-gray-600 hover:bg-gray-50">AI 지문 목록</Link>
          <Link href="/materials/passages/external" className="rounded border border-gray-300 px-3 py-1.5 text-gray-600 hover:bg-gray-50">외부지문 목록</Link>
        </div>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        보기 전용입니다. 수정·삭제·보관은 각 지문의 &lsquo;열기&rsquo;로 원래 화면에서 하세요.
        난이도는 두 체계를 한 눈금으로 맞춘 값입니다 (기초 = 학교형·AI 쉬움, 표준 = 일반학원형·AI 보통, 심화 = 상위학원형·AI 어려움, 선행 = 선행형).
      </p>

      {/* 필터 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">종류</span>
        {(['all', 'ai', 'external'] as const).map((k) => (
          <button key={k} onClick={() => set({ kind: k })} className={pill(filter.kind === k)}>
            {k === 'all' ? '전체' : PASSAGE_KIND_LABELS[k]} {kindCount(k)}
          </button>
        ))}
        <span className="ml-2 text-xs text-gray-500">학년</span>
        <select
          value={filter.grade}
          onChange={(e) => set({ grade: e.target.value })}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="all">전체</option>
          {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          {hasUnknownGrade && <option value="unknown">학년 미정</option>}
        </select>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">난이도</span>
        {(['all', 1, 2, 3, 4, 'unknown'] as const).map((d) => (
          <button key={d} onClick={() => set({ difficulty: d })} className={pill(filter.difficulty === d)}>
            {d === 'all' ? '전체' : d === 'unknown' ? '미정' : UNIFIED_DIFFICULTY_LABELS[d as UnifiedDifficulty]}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={filter.includeArchived} onChange={(e) => set({ includeArchived: e.target.checked })} />
          보관된 외부지문도 보기
        </label>
      </div>

      {!loading && !error && <p className="mb-1 text-xs font-medium text-gray-600">{shown.length}개</p>}
      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <p className="p-6 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">해당하는 지문이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2">종류</th>
                <th className="px-3 py-2">학년</th>
                <th className="px-3 py-2">제목·주제</th>
                <th className="px-3 py-2">난이도</th>
                <th className="px-3 py-2 text-center">문항 수</th>
                <th className="px-3 py-2">만든 날</th>
                <th className="px-3 py-2 text-center">원래 화면</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.kind}:${r.id}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_BADGE[r.kind]}`}>{PASSAGE_KIND_LABELS[r.kind]}</span>
                    {r.archived && <span className="ml-1 rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600">보관</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600" title={r.gradeRaw ?? ''}>{r.grade ?? r.gradeRaw ?? '학년 미정'}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.title}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {r.difficulty ? UNIFIED_DIFFICULTY_LABELS[r.difficulty] : '미정'}
                    {r.difficultyRaw && <span className="ml-1 text-[11px] text-gray-400">({r.difficultyRaw})</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600">{r.questionCount}</td>
                  <td className="px-3 py-2 text-gray-500">{r.createdAt.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-center">
                    <Link href={r.href} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">열기</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
