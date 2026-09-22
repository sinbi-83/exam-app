'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PassageSummary, PassageVariantLevel, VARIANT_LABELS } from '@/types/passageBank'
import { schoolStageBadgeClass } from '@/lib/gradeLevel'

const VARIANT_ORDER: PassageVariantLevel[] = ['school', 'academy', 'advanced', 'prestudy']
const FULL_QUESTIONS = 20
const FULL_ESSAYS = 5

type SortKey = 'created_desc' | 'updated_desc' | 'level' | 'title'

type ListRow =
  | { kind: 'single'; item: PassageSummary; sortDate: string; sortLevel: string; sortTitle: string }
  | { kind: 'group'; groupId: string; items: PassageSummary[]; sortDate: string; sortLevel: string; sortTitle: string }

function isComplete(item: Pick<PassageSummary, 'question_count' | 'essay_count'>): boolean {
  return item.question_count === FULL_QUESTIONS && item.essay_count === FULL_ESSAYS
}

function StatusBadge({ complete }: { complete: boolean }) {
  return complete ? (
    <span className="rounded border border-green-100 bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
      완성
    </span>
  ) : (
    <span className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
      문제 부족
    </span>
  )
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${schoolStageBadgeClass(level)}`}>
      {level || '학년 미정'}
    </span>
  )
}

// "⋮" 클릭 시 뜨는 작은 메뉴. 자주 안 쓰는 기능(삭제 등)을 여기 모아둔다.
function ActionMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="더보기"
        className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-10 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
              className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                it.danger ? 'text-red-500' : 'text-gray-700'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ExternalPassagesPage() {
  const [items, setItems] = useState<PassageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingSingle, setDeletingSingle] = useState<string | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)

  const [levelFilter, setLevelFilter] = useState('all')
  const [variantFilter, setVariantFilter] = useState<'all' | PassageVariantLevel>('all')
  const [searchText, setSearchText] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_desc')
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
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (levelFilter !== 'all' && item.level !== levelFilter) return false
      if (variantFilter !== 'all' && item.variant_level !== variantFilter) return false
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase()
        const tagWords = [
          ...(item.tags?.vocab ?? []),
          ...(item.tags?.grammar ?? []),
          ...(item.tags?.topic ?? []),
        ].join(' ')
        const haystack = `${item.title} ${item.topic} ${tagWords}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [items, levelFilter, variantFilter, searchText])

  // 같은 group_id 지문은 한 줄로 묶고(난이도 순서 고정), 번호표 없는 지문은 그대로 한 줄
  const rows = useMemo<ListRow[]>(() => {
    const result: ListRow[] = []
    const groups = new Map<string, Extract<ListRow, { kind: 'group' }>>()
    for (const item of filtered) {
      if (!item.group_id) {
        result.push({ kind: 'single', item, sortDate: item.updated_at, sortLevel: item.level, sortTitle: item.title })
        continue
      }
      let row = groups.get(item.group_id)
      if (!row) {
        row = { kind: 'group', groupId: item.group_id, items: [], sortDate: item.updated_at, sortLevel: item.level, sortTitle: item.title }
        groups.set(item.group_id, row)
        result.push(row)
      }
      row.items.push(item)
      if (item.created_at < row.sortDate || !row.sortDate) row.sortDate = item.created_at
      if (item.updated_at > row.sortDate) row.sortDate = item.updated_at
    }
    for (const row of groups.values()) {
      row.items.sort(
        (a, b) =>
          VARIANT_ORDER.indexOf(a.variant_level as PassageVariantLevel) -
          VARIANT_ORDER.indexOf(b.variant_level as PassageVariantLevel),
      )
    }

    const sorted = [...result]
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'updated_desc':
          return b.sortDate.localeCompare(a.sortDate)
        case 'level':
          return a.sortLevel.localeCompare(b.sortLevel)
        case 'title':
          return a.sortTitle.localeCompare(b.sortTitle)
        default:
          return b.sortDate.localeCompare(a.sortDate)
      }
    })
    return sorted
  }, [filtered, sortKey])

  function toggleGroup(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  async function handleDeleteSingle(id: string) {
    if (!confirm('이 지문을 삭제하시겠습니까? 저장된 문제와 서술형도 함께 삭제됩니다.')) return
    setDeletingSingle(id)
    try {
      const res = await fetch(`/api/passages/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) alert('삭제 실패: ' + json.error)
      else setItems((prev) => prev.filter((i) => i.id !== id))
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
    } finally {
      setDeletingSingle(null)
    }
  }

  async function handleDeleteGroup(groupId: string, title: string, variantLabels: string[]) {
    const list = variantLabels.join('·')
    if (!confirm(`"${title}" 지문 세트와 ${list} 자료가 모두 삭제됩니다. 계속하시겠습니까?`)) return
    setDeletingGroup(groupId)
    try {
      const res = await fetch(`/api/passage-groups/${groupId}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) alert('삭제 실패: ' + json.error)
      else setItems((prev) => prev.filter((i) => i.group_id !== groupId))
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
    } finally {
      setDeletingGroup(null)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-sm text-gray-400">불러오는 중…</div>
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-600">{error}</div>
  }

  return (
    <div className="mx-auto max-w-[1300px]">
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
        <select
          value={variantFilter}
          onChange={(e) => setVariantFilter(e.target.value as 'all' | PassageVariantLevel)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="all">전체 난이도</option>
          {VARIANT_ORDER.map((v) => (
            <option key={v} value={v}>{VARIANT_LABELS[v]}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="created_desc">최근 생성순</option>
          <option value="updated_desc">최근 수정순</option>
          <option value="level">학년순</option>
          <option value="title">제목순</option>
        </select>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="제목·주제·태그 검색"
          className="min-w-[200px] flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">저장된 지문이 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">
            scripts/add-passage.ts 로 지문 JSON을 저장하면 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            if (row.kind === 'group') {
              const first = row.items[0]
              const isOpen = expanded.has(row.groupId)
              const variantLabels = row.items
                .filter((i) => i.variant_level)
                .map((i) => VARIANT_LABELS[i.variant_level as PassageVariantLevel])
              const groupComplete = row.items.every(isComplete)
              const createdAt = row.items.map((i) => i.created_at).sort()[0]?.slice(0, 10)
              return (
                <div key={row.groupId} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      onClick={() => toggleGroup(row.groupId)}
                      aria-expanded={isOpen}
                      className="flex flex-1 items-start gap-3 rounded-lg p-1 text-left hover:bg-gray-50 sm:items-center"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-gray-200 text-xs text-gray-500 sm:mt-0">
                        {isOpen ? '▼' : '▶'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-800">{first.title || '(제목 없음)'}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <LevelBadge level={first.level} />
                          {first.topic && (
                            <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600">
                              {first.topic}
                            </span>
                          )}
                          <StatusBadge complete={groupComplete} />
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500">{variantLabels.join(' · ') || '(난이도 없음)'}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{createdAt}</p>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                      <Link
                        href={`/external-passages/${first.id}`}
                        className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      >
                        보기
                      </Link>
                      <Link
                        href={`/external-passages/${first.id}?edit=1`}
                        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        수정
                      </Link>
                      <ActionMenu
                        items={[
                          {
                            label: deletingGroup === row.groupId ? '삭제 중…' : '세트 전체 삭제',
                            danger: true,
                            onClick: () => handleDeleteGroup(row.groupId, first.title, variantLabels),
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {isOpen && (
                    <div className="divide-y divide-gray-100 border-t border-gray-100 bg-gray-50/60">
                      {row.items.map((child) => (
                        <div
                          key={child.id}
                          className="flex flex-col gap-2 px-4 py-3 pl-6 sm:flex-row sm:items-center sm:justify-between sm:pl-12"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium text-gray-700">
                                {child.variant_level ? VARIANT_LABELS[child.variant_level] : '(난이도 없음)'}
                              </span>
                              <StatusBadge complete={isComplete(child)} />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              문제 {child.question_count} · 서술형 {child.essay_count} · 어휘 {child.tags?.vocab?.length ?? 0} · 어법{' '}
                              {child.tags?.grammar?.length ?? 0}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                            <Link
                              href={`/external-passages/${child.id}`}
                              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-white"
                            >
                              보기
                            </Link>
                            <Link
                              href={`/external-passages/${child.id}?edit=1`}
                              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-white"
                            >
                              수정
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            const item = row.item
            return (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Link href={`/external-passages/${item.id}`} className="truncate font-medium text-gray-800 hover:underline">
                      {item.title || '(제목 없음)'}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <LevelBadge level={item.level} />
                      {item.topic && (
                        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600">
                          {item.topic}
                        </span>
                      )}
                      <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500">
                        단일 지문
                      </span>
                      <StatusBadge complete={isComplete(item)} />
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500">
                      문제 {item.question_count} · 서술형 {item.essay_count} · 어휘 {item.tags?.vocab?.length ?? 0} · 어법{' '}
                      {item.tags?.grammar?.length ?? 0}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{item.created_at?.slice(0, 10)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    <Link
                      href={`/external-passages/${item.id}`}
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      보기
                    </Link>
                    <Link
                      href={`/external-passages/${item.id}?edit=1`}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      수정
                    </Link>
                    <ActionMenu
                      items={[
                        {
                          label: deletingSingle === item.id ? '삭제 중…' : '삭제',
                          danger: true,
                          onClick: () => handleDeleteSingle(item.id),
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
