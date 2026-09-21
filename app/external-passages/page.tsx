'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PassageSummary, PassageVariantLevel, VARIANT_LABELS } from '@/types/passageBank'

const VARIANT_ORDER: PassageVariantLevel[] = ['school', 'academy', 'advanced', 'prestudy']

type ListRow =
  | { kind: 'single'; item: PassageSummary }
  | { kind: 'group'; groupId: string; items: PassageSummary[] }

export default function ExternalPassagesPage() {
  const [items, setItems] = useState<PassageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const [levelFilter, setLevelFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/passages')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        else setItems(json.data ?? [])
      })
      .catch(() => setError('목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const levelOptions = useMemo(() => {
    const set = new Set(items.map((i) => i.level).filter(Boolean))
    return Array.from(set)
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (levelFilter !== 'all' && item.level !== levelFilter) return false
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase()
        const haystack = `${item.title} ${item.topic}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [items, levelFilter, searchText])

  // 같은 group_id 지문은 한 줄로 묶고(난이도 순서 고정), 번호표 없는 지문은 그대로 한 줄
  const rows = useMemo<ListRow[]>(() => {
    const result: ListRow[] = []
    const groups = new Map<string, Extract<ListRow, { kind: 'group' }>>()
    for (const item of filtered) {
      if (!item.group_id) {
        result.push({ kind: 'single', item })
        continue
      }
      let row = groups.get(item.group_id)
      if (!row) {
        row = { kind: 'group', groupId: item.group_id, items: [] }
        groups.set(item.group_id, row)
        result.push(row)
      }
      row.items.push(item)
    }
    for (const row of groups.values()) {
      row.items.sort(
        (a, b) =>
          VARIANT_ORDER.indexOf(a.variant_level as PassageVariantLevel) -
          VARIANT_ORDER.indexOf(b.variant_level as PassageVariantLevel),
      )
    }
    return result
  }, [filtered])

  function toggleGroup(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('이 지문을 삭제하시겠습니까? 저장된 문제와 서술형도 함께 삭제됩니다.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/passages/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) {
        alert('삭제 실패: ' + json.error)
      } else {
        setItems((prev) => prev.filter((i) => i.id !== id))
      }
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
    } finally {
      setDeleting(null)
    }
  }

  function tagSummary(item: PassageSummary): string {
    const vocab = item.tags?.vocab?.length ?? 0
    const grammar = item.tags?.grammar?.length ?? 0
    const topics = item.tags?.topic ?? []
    const parts = [`🔵 어휘 ${vocab}`, `🔴 어법 ${grammar}`]
    if (topics.length > 0) parts.push(`💚 ${topics.slice(0, 2).join(', ')}`)
    return parts.join(' · ')
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-sm text-gray-400">불러오는 중…</div>
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-600">{error}</div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800">외부지문저장소</h1>
        <p className="mt-1 text-sm text-gray-500">
          미리 만들어 저장한 지문과 문제 세트를 조회·수정·인쇄합니다. (API 호출 없음)
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="all">전체 학년</option>
          {levelOptions.map((lv) => (
            <option key={lv} value={lv}>{lv}</option>
          ))}
        </select>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="제목 또는 주제 검색"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">저장된 지문이 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">
            scripts/add-passage.ts 로 지문 JSON을 저장하면 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">제목</th>
                <th className="px-4 py-3">학년</th>
                <th className="px-4 py-3">주제</th>
                <th className="px-4 py-3">태그 요약</th>
                <th className="px-4 py-3">만든 날짜</th>
                <th className="px-4 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.kind === 'group') {
                  const first = row.items[0]
                  const isOpen = expanded.has(row.groupId)
                  return (
                    <Fragment key={row.groupId}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          <button
                            onClick={() => toggleGroup(row.groupId)}
                            aria-expanded={isOpen}
                            className="flex items-center gap-2 text-left hover:underline"
                          >
                            <span className="w-3 text-xs text-gray-500">{isOpen ? '▼' : '▶'}</span>
                            {first.title || '(제목 없음)'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{first.level || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{first.topic || '-'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{row.items.length}단계</td>
                        <td className="px-4 py-3 text-gray-500">
                          {row.items.map((i) => i.created_at).sort()[0]?.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleGroup(row.groupId)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                          >
                            {isOpen ? '접기' : '펼치기'}
                          </button>
                        </td>
                      </tr>
                      {isOpen &&
                        row.items.map((child) => (
                          <tr key={child.id} className="border-b border-gray-100 bg-gray-50/60 last:border-0">
                            <td className="py-2 pl-12 pr-4 text-gray-700">
                              <Link href={`/external-passages/${child.id}`} className="hover:underline">
                                {child.variant_level ? VARIANT_LABELS[child.variant_level] : '(난이도 없음)'}
                              </Link>
                            </td>
                            <td className="px-4 py-2 text-gray-500">{child.level || '-'}</td>
                            <td className="px-4 py-2 text-gray-500">{child.topic || '-'}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{tagSummary(child)}</td>
                            <td className="px-4 py-2 text-gray-400">{child.created_at?.slice(0, 10)}</td>
                            <td className="px-4 py-2 text-center">
                              <Link
                                href={`/external-passages/${child.id}`}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                              >
                                보기
                              </Link>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                }
                const item = row.item
                return (
                <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <Link href={`/external-passages/${item.id}`} className="hover:underline">
                      {item.title || '(제목 없음)'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.level || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{item.topic || '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{tagSummary(item)}</td>
                  <td className="px-4 py-3 text-gray-500">{item.created_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Link
                        href={`/external-passages/${item.id}`}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        보기
                      </Link>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting === item.id}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40"
                      >
                        {deleting === item.id ? '삭제 중…' : '삭제'}
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
