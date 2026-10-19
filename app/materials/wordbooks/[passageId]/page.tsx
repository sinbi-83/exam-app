'use client'

// 지문 단어장 편집: 지문 🔵 단어 자동 발췌(단어은행 뜻 채움) → 단어 빼기·추가·뜻 고치기 → 저장 → 단어지 / 단어 테스트지 출력

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { VARIANT_LABELS, type PassageVariantLevel } from '@/types/passageBank'
import type { WordbookDraftWord, WordbookWord } from '@/types/wordbook'
import { cleanWordbookWords } from '@/lib/wordbook'
import { wordbookPrintKey, type WordbookPrintPayload } from './print/printPayload'

interface PassageInfo {
  id: string
  title: string
  level: string
  topic: string
  group_id: string | null
  variant_level: PassageVariantLevel | null
}

type Row = WordbookWord & { origin?: WordbookDraftWord['origin']; key: number }

let rowSeq = 0
const toRows = (words: (WordbookWord | WordbookDraftWord)[]): Row[] => words.map((w) => ({ ...w, key: ++rowSeq }))

export default function WordbookEditPage() {
  const { passageId } = useParams<{ passageId: string }>()
  const [passage, setPassage] = useState<PassageInfo | null>(null)
  const [draft, setDraft] = useState<WordbookDraftWord[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [tableMissing, setTableMissing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/wordbooks/${passageId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setMessage({ kind: 'error', text: json.error })
          return
        }
        const d = json.data
        setPassage(d.passage)
        setDraft(d.draft)
        setTableMissing(d.tableMissing)
        setSavedAt(d.saved?.updated_at ?? null)
        setRows(toRows(d.saved ? d.saved.words : d.draft))
        setDirty(false)
      })
      .catch(() => setMessage({ kind: 'error', text: '단어장을 불러오지 못했습니다.' }))
      .finally(() => setLoading(false))
  }, [passageId])

  useEffect(() => { load() }, [load])

  const update = (key: number, patch: Partial<WordbookWord>) => {
    // 뜻을 직접 고치면 '단어은행 뜻' 표시를 뗀다
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, origin: patch.meaning !== undefined ? undefined : r.origin } : r)))
    setDirty(true)
  }
  const remove = (key: number) => { setRows((prev) => prev.filter((r) => r.key !== key)); setDirty(true) }
  const move = (key: number, dir: -1 | 1) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setDirty(true)
  }
  const addRow = () => {
    setRows((prev) => [...prev, { word: '', surface: '', pos: '', meaning: '', sentence: '', key: ++rowSeq }])
    setDirty(true)
  }
  // 자동 발췌에는 있는데 지금 목록에서 뺀 단어 (다시 넣기용)
  const removedDraft = useMemo(() => {
    const now = new Set(rows.map((r) => r.word.trim().toLowerCase()))
    return draft.filter((d) => !now.has(d.word.trim().toLowerCase()))
  }, [draft, rows])

  const cleaned = useMemo(() => cleanWordbookWords(rows), [rows])
  const emptyMeaning = cleaned.filter((w) => !w.meaning).length

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/wordbooks/${passageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: cleaned }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장하지 못했습니다.')
      setRows(toRows(json.data.words))
      setSavedAt(json.data.updated_at)
      setDirty(false)
      setMessage({ kind: 'ok', text: '저장했습니다.' })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : '저장하지 못했습니다.' })
    } finally {
      setBusy(false)
    }
  }

  async function resetToDraft() {
    if (!confirm('저장한 단어장을 지우고 지문에서 다시 자동 발췌할까요? (고친 뜻·추가한 단어가 사라집니다)')) return
    setBusy(true)
    await fetch(`/api/wordbooks/${passageId}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    load()
  }

  function openPrint(mode: 'list' | 'test') {
    if (!passage) return
    // 저장 전 내용도 그대로 출력되도록 인쇄 탭에 넘긴다 (localStorage, 같은 브라우저 안에서만)
    const payload: WordbookPrintPayload = {
      title: passage.title,
      level: passage.level,
      variant: passage.variant_level ? VARIANT_LABELS[passage.variant_level] : null,
      words: cleaned,
    }
    try { localStorage.setItem(wordbookPrintKey(passageId), JSON.stringify(payload)) } catch { /* 인쇄 화면이 서버에서 다시 읽는다 */ }
    window.open(`/materials/wordbooks/${passageId}/print?mode=${mode}`, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>
  if (!passage) return <div className="py-20 text-center text-sm text-red-500">{message?.text ?? '지문을 찾을 수 없습니다.'}</div>

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/materials/wordbooks" className="text-xs text-gray-500 hover:text-blue-600">← 지문 단어장 목록</Link>
      <div className="mb-4 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">{passage.title}</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {passage.level} · {passage.topic}
            {passage.variant_level && ` · ${VARIANT_LABELS[passage.variant_level]}`}
            {' · '}
            <Link href={`/materials/passages/external/${passage.id}`} className="text-blue-600 hover:underline">지문 보기</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openPrint('list')}
            disabled={cleaned.length === 0}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
          >
            🖨️ 단어지 출력
          </button>
          <button
            onClick={() => openPrint('test')}
            disabled={cleaned.length === 0}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            📝 단어 테스트지 출력
          </button>
        </div>
      </div>

      {tableMissing && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          저장 표가 아직 없어서 <b>저장</b>은 안 되지만, 지금 화면 내용 그대로 출력은 됩니다.
          (Supabase SQL Editor 에서 <code>passage-wordbooks-migration.sql</code>의 한 줄 SQL 실행 후 저장 가능)
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>총 <b className="text-gray-800">{cleaned.length}</b>단어</span>
        {emptyMeaning > 0 && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
            뜻 빈칸 {emptyMeaning}개 — 직접 채워 주세요 (빈칸인 단어는 한→영 문제에서도 영→한으로 나와요)
          </span>
        )}
        <span>· {savedAt ? `저장됨 ${new Date(savedAt).toLocaleString('ko-KR')}` : '아직 저장 안 함 (지문에서 자동 발췌한 초안)'}</span>
        {dirty && <span className="text-orange-600">· 고친 내용 있음</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              <th className="w-10 px-2 py-2">#</th>
              <th className="w-40 px-2 py-2 text-left">단어</th>
              <th className="w-16 px-2 py-2 text-left">품사</th>
              <th className="w-48 px-2 py-2 text-left">뜻</th>
              <th className="px-2 py-2 text-left">지문 속 예문</th>
              <th className="w-24 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-b border-gray-100 align-top last:border-0">
                <td className="px-2 py-1.5 text-center text-xs text-gray-400">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <input value={r.word} onChange={(e) => update(r.key, { word: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-1" />
                  {r.surface && r.surface.toLowerCase() !== r.word.toLowerCase() && (
                    <p className="mt-0.5 text-[10px] text-gray-400">지문: {r.surface}</p>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <input value={r.pos} onChange={(e) => update(r.key, { pos: e.target.value })} placeholder="명" className="w-full rounded border border-gray-200 px-2 py-1" />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={r.meaning}
                    onChange={(e) => update(r.key, { meaning: e.target.value })}
                    placeholder="뜻 입력"
                    className={`w-full rounded border px-2 py-1 ${r.meaning ? 'border-gray-200' : 'border-amber-300 bg-amber-50'}`}
                  />
                  {r.origin === 'bank' && <p className="mt-0.5 text-[10px] text-blue-500">단어은행 뜻</p>}
                </td>
                <td className="px-2 py-1.5">
                  <textarea
                    value={r.sentence}
                    onChange={(e) => update(r.key, { sentence: e.target.value })}
                    rows={2}
                    className="w-full resize-y rounded border border-gray-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-center">
                  <button onClick={() => move(r.key, -1)} disabled={i === 0} className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="위로">▲</button>
                  <button onClick={() => move(r.key, 1)} disabled={i === rows.length - 1} className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="아래로">▼</button>
                  <button onClick={() => remove(r.key)} className="px-1 text-gray-400 hover:text-red-500" aria-label="빼기">✕</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-gray-400">
                  이 지문에는 🔵 어휘 표시가 없어요. 아래 [+ 단어 추가]로 직접 넣어 주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={addRow} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">+ 단어 추가</button>
          {removedDraft.length > 0 && (
            <span className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
              뺀 단어 다시 넣기:
              {removedDraft.map((d) => (
                <button
                  key={d.word}
                  onClick={() => { setRows((prev) => [...prev, ...toRows([d])]); setDirty(true) }}
                  className="rounded border border-gray-200 px-1.5 py-0.5 hover:bg-blue-50"
                >
                  + {d.word}
                </button>
              ))}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <button onClick={resetToDraft} disabled={busy} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40">
              지문에서 다시 발췌
            </button>
          )}
          <button
            onClick={save}
            disabled={busy || cleaned.length === 0 || tableMissing}
            className="rounded bg-gray-800 px-5 py-1.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-40"
          >
            {busy ? '저장 중…' : '💾 저장'}
          </button>
        </div>
      </div>
      {message && (
        <p className={`mt-2 text-right text-sm ${message.kind === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{message.text}</p>
      )}
    </div>
  )
}
