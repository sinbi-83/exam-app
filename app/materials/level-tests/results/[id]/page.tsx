'use client'

// 레벨테스트 결과: 총점·영역별 점수·추천 반·강점/약점·문항별 O/X.
// 쓰기 문항은 여기서도 맞음/틀림을 고칠 수 있다 (고치면 점수·추천 반을 서버에서 다시 계산해 저장).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { CHOICE_MARKS, SECTION_LABELS, findLevelTestById, isItemCorrect, orderedItems, slugOfGrade, strengthsAndWeaknesses } from '@/lib/levelTest'
import { FormBadge, GradeBadge, givenText } from '@/components/levelTest/LevelTestParts'
import type { LevelTestOverrides, LevelTestResultRow } from '@/types/levelTest'

export default function LevelTestResultPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [row, setRow] = useState<LevelTestResultRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch(`/api/level-tests/results/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setRow(j.data)
          setMemo(j.data.memo ?? '')
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  const test = row ? findLevelTestById(row.test_id) : null
  const items = useMemo(() => (test ? orderedItems(test) : []), [test])

  if (loading) return <p className="py-20 text-center text-sm text-gray-400">불러오는 중…</p>
  if (!row) return <p className="py-20 text-center text-sm text-gray-400">결과를 찾을 수 없습니다.</p>
  if (!test) return <p className="py-20 text-center text-sm text-gray-400">이 결과의 시험지({row.test_id})를 찾을 수 없습니다.</p>

  const { strengths, weaknesses } = strengthsAndWeaknesses(row.score)
  const slug = slugOfGrade(row.grade)

  async function patch(body: { overrides?: LevelTestOverrides; memo?: string }, done: string) {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(`/api/level-tests/results/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (!res.ok) return setMessage(j.error ?? '저장하지 못했습니다.')
      setRow(j.data)
      setMessage(done)
    } finally {
      setBusy(false)
    }
  }

  function setOverride(itemId: string, v: boolean | null) {
    const next = { ...(row!.overrides ?? {}) }
    if (v === null) delete next[itemId]
    else next[itemId] = v
    patch({ overrides: next }, '채점을 고쳤어요. 점수·추천 반이 다시 계산됐습니다.')
  }

  async function remove() {
    if (!confirm(`${row!.student_name} 학생의 이 결과를 삭제할까요? 되돌릴 수 없습니다.`)) return
    const res = await fetch(`/api/level-tests/results/${id}`, { method: 'DELETE' })
    if (res.ok) router.push(slug ? `/materials/level-tests/${slug}` : '/materials/level-tests')
  }

  return (
    <div className="mx-auto max-w-4xl pb-10">
      <p className="mb-2 text-xs text-gray-400">
        <Link href="/materials/level-tests" className="hover:underline">📏 레벨테스트</Link>
        {slug && (
          <>
            {' › '}
            <Link href={`/materials/level-tests/${slug}`} className="hover:underline">{row.grade}</Link>
          </>
        )}
        {' › '}결과
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-800">{row.student_name}</h1>
        <GradeBadge grade={row.grade} />
        <FormBadge form={row.form} />
        <span className="text-sm text-gray-500">
          {new Date(row.taken_at).toLocaleDateString('ko-KR')} · {row.mode === 'online' ? '📱 태블릿 응시' : '🖨️ 종이 응시'}
        </span>
        <Link href={`/materials/level-tests/results/${id}/print`} className="ml-auto rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          🖨️ 상담용 결과지
        </Link>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-center">
          <p className="text-xs text-gray-500">총점</p>
          <p className="text-4xl font-bold text-gray-900">{row.score.total}<span className="text-base font-normal text-gray-400"> / {row.score.max}</span></p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 md:col-span-2">
          <p className="text-xs text-blue-600">추천 반</p>
          <p className="text-2xl font-bold text-blue-800">{row.recommendation.band}</p>
          <p className="mt-1 text-sm text-gray-700">{row.recommendation.summary}</p>
          {row.recommendation.advice && <p className="mt-1 text-sm font-medium text-gray-800">👉 {row.recommendation.advice}</p>}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
        <p className="mb-3 text-sm font-semibold text-gray-700">영역별 점수</p>
        <div className="space-y-2">
          {row.score.sections.map((s) => {
            const pct = s.max ? Math.round((s.score / s.max) * 100) : 0
            return (
              <div key={s.section} className="flex items-center gap-3 text-sm">
                <span className="w-14 text-gray-700">{SECTION_LABELS[s.section]}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : 'bg-orange-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-28 text-right text-gray-600">{s.score}/{s.max}점 ({s.correct}/{s.count})</span>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-sm text-gray-600">
          강점: <b>{strengths.length ? strengths.map((s) => SECTION_LABELS[s]).join(', ') : '-'}</b> · 보완할 점:{' '}
          <b>{weaknesses.length ? weaknesses.map((s) => SECTION_LABELS[s]).join(', ') : '-'}</b>
        </p>
      </div>

      <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">번호</th>
              <th className="px-3 py-2 text-left">영역</th>
              <th className="px-3 py-2 text-left">학생 답</th>
              <th className="px-3 py-2 text-left">정답</th>
              <th className="px-3 py-2 text-center">결과</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const ok = isItemCorrect(it, row.answers, row.overrides)
              return (
                <tr key={it.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-700">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-500">{SECTION_LABELS[it.section]}</td>
                  <td className="px-3 py-2 text-gray-800">{givenText(it, row.answers[it.id])}</td>
                  <td className="px-3 py-2 text-gray-500">{it.type === 'mc' ? `${CHOICE_MARKS[it.answer as number]} ${it.choices?.[it.answer as number]}` : String(it.answer)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`font-bold ${ok ? 'text-green-600' : 'text-red-500'}`}>{ok ? 'O' : 'X'}</span>
                    {it.type === 'write' && (
                      <span className="ml-2 inline-flex overflow-hidden rounded border border-gray-300 align-middle text-[11px]">
                        {([['자동', null], ['맞음', true], ['틀림', false]] as const).map(([label, v]) => {
                          const active = v === null ? !(it.id in (row.overrides ?? {})) : row.overrides?.[it.id] === v
                          return (
                            <button key={label} disabled={busy} onClick={() => setOverride(it.id, v)} className={`px-1.5 py-0.5 ${active ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>
                              {label}
                            </button>
                          )
                        })}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-gray-700">상담 메모</p>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} className="w-full rounded border border-gray-300 p-2 text-sm" placeholder="응시 태도, 학부모 요청 등 (상담용 결과지에도 나옵니다)" />
        <div className="mt-2 flex items-center gap-3">
          <button disabled={busy} onClick={() => patch({ memo }, '메모를 저장했어요.')} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">메모 저장</button>
          {message && <span className="text-sm text-green-700">{message}</span>}
          <button onClick={remove} className="ml-auto text-xs text-red-500 hover:underline">결과 삭제</button>
        </div>
      </div>
    </div>
  )
}
