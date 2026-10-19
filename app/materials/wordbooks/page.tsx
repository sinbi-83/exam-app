'use client'

// 지문 단어장 목록: 외부지문저장소 지문을 고르면 그 지문의 🔵 단어로 단어장을 만든다.
// 4단계 세트는 버전(학교형·일반학원형·상위학원형·선행형)마다 단어가 달라서 버전별로 단어장이 따로 있다.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PassageSummary, VARIANT_LABELS, type PassageVariantLevel } from '@/types/passageBank'
import { buildPickerRows, pickerLevelOptions } from '@/lib/externalPassagePicker'
import { schoolStageBadgeClass } from '@/lib/gradeLevel'

interface SavedSummary {
  passage_id: string
  word_count: number
  updated_at: string
}

function isArchived(item: PassageSummary): boolean {
  return item.group_id ? !!item.group_archived : !!item.archived
}

function WordbookLink({ item, saved, label }: { item: PassageSummary; saved?: SavedSummary; label: string }) {
  const tagCount = item.tags?.vocab?.length ?? 0
  return (
    <Link
      href={`/materials/wordbooks/${item.id}`}
      className="flex items-center justify-between gap-2 rounded border border-gray-200 px-3 py-2 text-sm hover:border-blue-300 hover:bg-blue-50"
    >
      <span className="text-gray-800">{label}</span>
      {saved ? (
        <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700">저장됨 · {saved.word_count}단어</span>
      ) : (
        <span className="text-[11px] text-gray-400">{tagCount > 0 ? `🔵 ${tagCount}단어` : '단어 표시 없음'}</span>
      )}
    </Link>
  )
}

export default function WordbooksPage() {
  const [items, setItems] = useState<PassageSummary[]>([])
  const [saved, setSaved] = useState<Map<string, SavedSummary>>(new Map())
  const [tableMissing, setTableMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    Promise.all([fetch('/api/passages').then((r) => r.json()), fetch('/api/wordbooks').then((r) => r.json())])
      .then(([p, w]) => {
        if (p.error) setError(p.error)
        else setItems(p.data ?? [])
        if (!w.error) {
          setSaved(new Map((w.data as SavedSummary[]).map((s) => [s.passage_id, s])))
          setTableMissing(!!w.tableMissing)
        }
      })
      .catch(() => setError('목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => items.filter((i) => showArchived || !isArchived(i)), [items, showArchived])
  const rows = useMemo(() => buildPickerRows(visible, { search, level }), [visible, search, level])
  const levels = useMemo(() => pickerLevelOptions(visible), [visible])

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">📗 지문 단어장</h1>
      <p className="mb-4 text-sm text-gray-500">
        지문의 🔵 어휘 표시를 모아 단어장을 만들고, A4 <b>단어지</b>(예습·복습)와 <b>단어 테스트지</b>로 출력합니다.
      </p>

      {tableMissing && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          단어장 저장 표가 아직 없어요. 단어장 만들기·출력은 되지만 <b>저장</b>은 Supabase SQL Editor 에서
          <code className="mx-1">passage-wordbooks-migration.sql</code>의 한 줄 SQL 을 실행한 뒤부터 됩니다.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제목·주제·단어 검색"
          className="w-56 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
          <option value="all">전체 학년</option>
          {levels.map((lv) => (
            <option key={lv} value={lv}>{lv}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          보관한 지문도 보기
        </label>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : error ? (
        <p className="py-16 text-center text-sm text-red-500">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">
          지문이 없습니다. <Link href="/materials/passages/external" className="text-blue-600 underline">외부지문저장소</Link>에 지문을 먼저 저장해 주세요.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const head = row.kind === 'single' ? row.item : row.items[0]
            return (
              <div key={row.key} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${schoolStageBadgeClass(head.level)}`}>
                    {head.level || '학년 미정'}
                  </span>
                  <span className="font-medium text-gray-800">{head.title}</span>
                  {head.topic && <span className="text-xs text-gray-400">{head.topic}</span>}
                  {row.kind === 'group' && <span className="text-[11px] text-gray-400">4단계 세트</span>}
                </div>
                {row.kind === 'single' ? (
                  <WordbookLink item={row.item} saved={saved.get(row.item.id)} label="단어장 열기" />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {row.items.map((it) => (
                      <WordbookLink
                        key={it.id}
                        item={it}
                        saved={saved.get(it.id)}
                        label={VARIANT_LABELS[it.variant_level as PassageVariantLevel] ?? '버전'}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
