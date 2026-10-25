'use client'

// 종이 시험지 채점: 학생이 고른 보기 번호를 누르고, 쓰기 답을 옮겨 적으면 바로 점수가 계산된다.
// 쓰기 답은 자동 비교(대소문자·끝 마침표 무시) 결과가 기본이고, 선생님이 [맞음]/[틀림]으로 바꿀 수 있다.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { CHOICE_MARKS, SECTION_LABELS, SECTION_ORDER, findLevelTest, gradeBySlug, isItemCorrect, orderedItems, recommendLevel, scoreLevelTest } from '@/lib/levelTest'
import { FormBadge, StudentPicker } from '@/components/levelTest/LevelTestParts'
import type { LevelTestAnswers, LevelTestOverrides } from '@/types/levelTest'

export default function LevelTestPaperGradePage() {
  const { grade: slug, form } = useParams<{ grade: string; form: string }>()
  const router = useRouter()
  const info = gradeBySlug(slug)
  const test = info ? findLevelTest(info.grade, form) : null
  const items = useMemo(() => (test ? orderedItems(test) : []), [test])

  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [takenAt, setTakenAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [answers, setAnswers] = useState<LevelTestAnswers>({})
  const [overrides, setOverrides] = useState<LevelTestOverrides>({})
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const score = useMemo(() => (test ? scoreLevelTest(test, answers, overrides) : null), [test, answers, overrides])
  if (!test || !info || !score) return <p className="py-20 text-center text-sm text-gray-400">시험지를 찾을 수 없습니다.</p>
  const rec = recommendLevel(test.form, score.percent)

  function setOverride(id: string, v: boolean | null) {
    setOverrides((o) => {
      const next = { ...o }
      if (v === null) delete next[id]
      else next[id] = v
      return next
    })
  }

  async function save() {
    if (!name.trim()) return setError('학생 이름을 입력해 주세요.')
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/level-tests/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: test!.id, student_name: name, student_id: studentId, mode: 'paper', answers, overrides, memo, taken_at: new Date(takenAt).toISOString() }),
      })
      const j = await res.json()
      if (!res.ok) return setError(j.error ?? '저장하지 못했습니다.')
      router.push(`/materials/level-tests/results/${j.data.id}`)
    } catch {
      setError('저장하지 못했습니다. 인터넷 연결을 확인해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  let num = 0
  return (
    <div className="mx-auto max-w-4xl pb-16">
      <p className="mb-2 text-xs text-gray-400">
        <Link href={`/materials/level-tests/${slug}`} className="hover:underline">← {info.grade} 폴더</Link>
      </p>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold text-gray-800">
        ✏️ 종이 답 입력·채점 <FormBadge form={test.form} />
      </h1>
      <p className="mb-4 text-sm text-gray-500">{test.title} — 학생 답안지를 보며 고른 번호를 누르고, 쓰기 답은 그대로 옮겨 적으세요.</p>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <StudentPicker name={name} studentId={studentId} onChange={(v) => { setName(v.name); setStudentId(v.studentId) }} />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          응시일
          <input type="date" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
      </div>

      <div className="space-y-4">
        {SECTION_ORDER.map((section) => {
          const list = items.filter((i) => i.section === section)
          if (list.length === 0) return null
          return (
            <div key={section} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-gray-700">{SECTION_LABELS[section]}</p>
              <div className="space-y-2">
                {list.map((it) => {
                  num++
                  const ok = isItemCorrect(it, answers, overrides)
                  const answered = answers[it.id] !== undefined && answers[it.id] !== ''
                  return (
                    <div key={it.id} className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2 text-sm">
                      <span className="w-7 font-semibold text-gray-700">{num}.</span>
                      {it.type === 'mc' ? (
                        <div className="flex gap-1">
                          {(it.choices ?? []).map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setAnswers((a) => ({ ...a, [it.id]: i }))}
                              className={`h-9 w-9 rounded-full border text-base ${answers[it.id] === i ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                            >
                              {CHOICE_MARKS[i]}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <>
                          <input
                            value={String(answers[it.id] ?? '')}
                            onChange={(e) => setAnswers((a) => ({ ...a, [it.id]: e.target.value }))}
                            placeholder="학생이 쓴 답"
                            className="w-56 rounded border border-gray-300 px-2 py-1.5"
                          />
                          <div className="flex overflow-hidden rounded border border-gray-300 text-xs">
                            {([['자동', null], ['맞음', true], ['틀림', false]] as const).map(([label, v]) => {
                              const active = v === null ? !(it.id in overrides) : overrides[it.id] === v
                              return (
                                <button key={label} onClick={() => setOverride(it.id, v)} className={`px-2 py-1 ${active ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                          <span className="text-xs text-gray-400">모범답: {String(it.answer)}</span>
                        </>
                      )}
                      <span className={`ml-auto text-sm font-semibold ${!answered && !(it.id in overrides) ? 'text-gray-300' : ok ? 'text-green-600' : 'text-red-500'}`}>
                        {!answered && !(it.id in overrides) ? '—' : ok ? 'O' : 'X'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="상담 메모 (선택): 응시 태도, 학부모 요청 등"
        className="mt-4 w-full rounded border border-gray-300 p-3 text-sm"
        rows={3}
      />

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <span className="text-2xl font-bold text-gray-900">{score.total}<span className="text-sm font-normal text-gray-400"> / 100</span></span>
        <span className="text-sm text-gray-600">
          {score.sections.map((s) => `${SECTION_LABELS[s.section]} ${s.score}/${s.max}`).join(' · ')}
        </span>
        <span className="rounded bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-700">추천: {rec.band}</span>
        <button onClick={save} disabled={saving} className="ml-auto rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? '저장 중…' : '결과 저장'}
        </button>
        {error && <p className="w-full text-sm text-red-500">{error}</p>}
      </div>
    </div>
  )
}
