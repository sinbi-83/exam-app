'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { VocabularyEntryRecord, VocabularyRejectReason, VocabularyStatus } from '@/types/vocabulary'
import { VOCABULARY_REJECT_REASON_LABELS, VOCABULARY_STATUS_LABELS } from '@/lib/vocabulary'
import { bandsContaining, VOCABULARY_BANDS_NOTE } from '@/config/vocabularyLevels'
import { VARIANT_LABELS } from '@/types/passageBank'
import { POS_LABELS_KO } from '@/lib/wordTest'

type StatusFilter = VocabularyStatus | 'all'

const STATUS_BADGE: Record<VocabularyStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  archived: 'bg-gray-200 text-gray-600',
}

// 숫자 난이도 → "중1 학교형·일반학원형" (임시 기준표 기준)
function levelText(difficulty: number | null): string {
  if (difficulty === null) return '난이도 없음'
  const bands = bandsContaining(difficulty, 'en_ko')
  if (bands.length === 0) return '기준표 범위 밖'
  return `${bands[0].grade} ${bands.map((b) => VARIANT_LABELS[b.level]).join('·')}`
}

export default function VocabularyPage() {
  const [entries, setEntries] = useState<VocabularyEntryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 상세 편집값
  const [meaning, setMeaning] = useState('')
  const [accepted, setAccepted] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [koEn, setKoEn] = useState(false)
  const [rejectReason, setRejectReason] = useState<VocabularyRejectReason | ''>('')
  const [rejectNote, setRejectNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/vocabulary')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패')
      setEntries(json.data ?? [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: entries.length, pending: 0, approved: 0, rejected: 0, archived: 0 }
    for (const e of entries) c[e.status]++
    return c
  }, [entries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) =>
      (status === 'all' || e.status === status) &&
      (!q || e.expression.toLowerCase().includes(q) || e.meaning_ko.includes(q) || e.accepted_meanings.some((m) => m.includes(q))),
    )
  }, [entries, status, search])

  const selected = entries.find((e) => e.id === selectedId) ?? null

  // 선택이 바뀌면 편집칸을 그 항목 값으로 채운다
  useEffect(() => {
    if (!selected) return
    setMeaning(selected.meaning_ko)
    setAccepted(selected.accepted_meanings.join(', '))
    setDifficulty(selected.base_difficulty === null ? '' : String(selected.base_difficulty))
    setKoEn(selected.ko_en_allowed)
    setRejectReason('')
    setRejectNote('')
    setMessage(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function patch(body: Record<string, unknown>, doneText: string) {
    if (!selected) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/vocabulary/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장 실패')
      setEntries((prev) => prev.map((e) => (e.id === selected.id ? json.data : e)))
      setMessage({ ok: true, text: doneText })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setSaving(false)
    }
  }

  function editedFields(): Record<string, unknown> | string {
    if (!selected) return {}
    const out: Record<string, unknown> = {}
    const m = meaning.trim()
    if (!m) return '대표 뜻을 입력하세요.'
    if (m !== selected.meaning_ko) out.meaning_ko = m
    const acc = accepted.split(',').map((s) => s.trim()).filter(Boolean)
    if (acc.join('\u0000') !== selected.accepted_meanings.join('\u0000')) out.accepted_meanings = acc
    const d = difficulty.trim() === '' ? null : Number(difficulty)
    if (d !== null && !(Number.isInteger(d) && d >= 1 && d <= 100)) return '난이도는 1~100 정수로 입력하세요.'
    if (d !== selected.base_difficulty) out.base_difficulty = d
    if (koEn !== selected.ko_en_allowed) out.ko_en_allowed = koEn
    return out
  }

  function saveEdits() {
    const f = editedFields()
    if (typeof f === 'string') return setMessage({ ok: false, text: f })
    if (Object.keys(f).length === 0) return setMessage({ ok: false, text: '바뀐 내용이 없습니다.' })
    patch(f, '저장했습니다.')
  }

  // 상태 버튼은 편집 중인 값도 함께 저장한다
  function runAction(action: string, doneText: string, extra: Record<string, unknown> = {}) {
    const f = editedFields()
    if (typeof f === 'string') return setMessage({ ok: false, text: f })
    patch({ ...f, ...extra, action }, doneText)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">단어은행</h1>
          <p className="mt-1 text-xs text-gray-500">레벨 표시는 {VOCABULARY_BANDS_NOTE} 기준입니다.</p>
        </div>
        <a href="/vocab-test" className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50">
          단어시험 만들기 →
        </a>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['all', 'pending', 'approved', 'rejected', 'archived'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-sm ${
              status === s ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s === 'all' ? '전체' : VOCABULARY_STATUS_LABELS[s]} {counts[s]}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="영어 표현 또는 뜻 검색"
          className="ml-auto w-full rounded border border-gray-300 px-3 py-1.5 text-sm sm:w-64"
        />
      </div>

      {loadError && <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{loadError}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* 목록 */}
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          {loading ? (
            <p className="p-6 text-center text-sm text-gray-400">불러오는 중…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">해당하는 어휘가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="px-3 py-2 text-left">표현</th>
                  <th className="px-3 py-2 text-left">품사</th>
                  <th className="px-3 py-2 text-left">대표 뜻</th>
                  <th className="px-3 py-2 text-right">난이도</th>
                  <th className="px-3 py-2 text-left">레벨</th>
                  <th className="px-3 py-2 text-center">한→영</th>
                  <th className="px-3 py-2 text-left">상태</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    className={`cursor-pointer border-b border-gray-100 last:border-0 hover:bg-blue-50 ${
                      e.id === selectedId ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-3 py-1.5 font-medium text-gray-800">{e.expression}</td>
                    <td className="px-3 py-1.5 text-gray-500">{e.pos ? POS_LABELS_KO[e.pos] : '-'}</td>
                    <td className="px-3 py-1.5 text-gray-700">{e.meaning_ko}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{e.base_difficulty ?? '-'}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-500">{levelText(e.base_difficulty)}</td>
                    <td className="px-3 py-1.5 text-center">{e.ko_en_allowed ? '○' : '–'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[e.status]}`}>
                        {VOCABULARY_STATUS_LABELS[e.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 상세 */}
        <div className="h-fit rounded border border-gray-200 bg-white p-4 lg:sticky lg:top-4">
          {!selected ? (
            <p className="py-10 text-center text-sm text-gray-400">목록에서 어휘를 선택하세요.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-gray-900">{selected.expression}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[selected.status]}`}>
                    {VOCABULARY_STATUS_LABELS[selected.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {selected.pos ?? '품사 없음'} · {selected.entry_type}
                  {selected.sense_note ? ` · ${selected.sense_note}` : ''}
                </p>
                <p className="text-xs text-gray-400">
                  {selected.teacher_reviewed_at ? '교사 확인됨' : '교사 미확인 (seed 값)'}
                  {selected.status === 'rejected' && selected.reject_reason
                    ? ` · 반려 사유: ${VOCABULARY_REJECT_REASON_LABELS[selected.reject_reason]}${selected.reject_note ? ` (${selected.reject_note})` : ''}`
                    : ''}
                </p>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">대표 뜻 (시험 기본 정답)</span>
                <input value={meaning} onChange={(e) => setMeaning(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">추가로 인정할 뜻 (쉼표로 구분)</span>
                <input value={accepted} onChange={(e) => setAccepted(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">난이도 (1~100)</span>
                <input
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  inputMode="numeric"
                  className="w-24 rounded border border-gray-300 px-2 py-1.5"
                />
                <span className="ml-2 text-xs text-gray-500">
                  {levelText(difficulty.trim() === '' ? null : Number(difficulty) || null)}
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={koEn} onChange={(e) => setKoEn(e.target.checked)} />
                <span className="text-sm text-gray-700">한→영 출제 가능</span>
                <span className="text-xs text-gray-400">(정답 영어가 하나로 정해질 때만)</span>
              </label>

              <button
                onClick={saveEdits}
                disabled={saving}
                className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                수정 저장
              </button>

              <div className="space-y-2 border-t border-gray-100 pt-3">
                {selected.status === 'pending' && (
                  <>
                    <button
                      onClick={() => runAction('approve', '승인했습니다.')}
                      disabled={saving}
                      className="w-full rounded bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                    >
                      승인
                    </button>
                    <div className="flex gap-2">
                      <select
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value as VocabularyRejectReason | '')}
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">반려 사유 선택</option>
                        {Object.entries(VOCABULARY_REJECT_REASON_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          rejectReason
                            ? runAction('reject', '반려했습니다.', { reject_reason: rejectReason, reject_note: rejectNote })
                            : setMessage({ ok: false, text: '반려 사유를 선택하세요.' })
                        }
                        disabled={saving}
                        className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        반려
                      </button>
                    </div>
                    <input
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="반려 메모 (선택)"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </>
                )}
                {selected.status === 'approved' && (
                  <button
                    onClick={() => runAction('archive', '아카이브했습니다. 자동시험에 더 이상 나오지 않습니다.')}
                    disabled={saving}
                    className="w-full rounded border border-gray-400 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    아카이브 (자동시험에서 제외)
                  </button>
                )}
                {selected.status === 'archived' && (
                  <button
                    onClick={() => runAction('restore', '다시 승인 상태로 복원했습니다.')}
                    disabled={saving}
                    className="w-full rounded border border-green-600 py-2 text-sm text-green-700 hover:bg-green-50 disabled:opacity-40"
                  >
                    복원 (승인으로)
                  </button>
                )}
                {selected.status === 'rejected' && (
                  <button
                    onClick={() => runAction('reopen', '검토대기로 되돌렸습니다.')}
                    disabled={saving}
                    className="w-full rounded border border-amber-500 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                  >
                    재검토 (검토대기로)
                  </button>
                )}
              </div>

              {message && (
                <p className={`text-sm ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
