'use client'

// 태블릿·휴대폰 응시: 선생님이 로그인한 기기를 학생에게 건네 한 문항씩 푼다 → 제출하면 자동 채점·저장 → 결과 화면.
// 푸는 중인 답은 이 기기 브라우저에 임시 저장 (새로고침해도 이어서). 쓰기 문항은 결과 화면에서 선생님이 맞음/틀림을 고칠 수 있다.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { CHOICE_MARKS, SECTION_LABELS, findLevelTest, gradeBySlug, orderedItems, recommendLevel, scoreLevelTest } from '@/lib/levelTest'
import { FormBadge, ItemHead, PassageBox, StudentPicker } from '@/components/levelTest/LevelTestParts'
import type { LevelTestAnswers } from '@/types/levelTest'

interface Draft {
  name: string
  studentId: string | null
  answers: LevelTestAnswers
  index: number
  started: boolean
}

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
function writeDraft(key: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(key, JSON.stringify(d))
    else localStorage.removeItem(key)
  } catch {
    // 저장이 막힌 브라우저(비공개 창 등)에서도 풀이는 그대로 된다
  }
}

export default function LevelTestTakePage() {
  const { grade: slug, form } = useParams<{ grade: string; form: string }>()
  const router = useRouter()
  const info = gradeBySlug(slug)
  const test = info ? findLevelTest(info.grade, form) : null
  const items = useMemo(() => (test ? orderedItems(test) : []), [test])
  const draftKey = `level-test-draft:${test?.id ?? ''}`

  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<LevelTestAnswers>({})
  const [index, setIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [showList, setShowList] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [localResult, setLocalResult] = useState<{ total: number; band: string } | null>(null)

  useEffect(() => {
    if (!test) return
    const d = readDraft(draftKey)
    if (d) {
      setName(d.name)
      setStudentId(d.studentId)
      setAnswers(d.answers ?? {})
      setIndex(Math.min(d.index ?? 0, items.length - 1))
      setStarted(!!d.started)
    }
  }, [test, draftKey, items.length])

  useEffect(() => {
    if (test && (started || name)) writeDraft(draftKey, { name, studentId, answers, index, started })
  }, [test, draftKey, name, studentId, answers, index, started])

  if (!test || !info) return <p className="py-20 text-center text-sm text-gray-400">시험지를 찾을 수 없습니다.</p>

  const item = items[index]
  const answeredCount = items.filter((it) => answers[it.id] !== undefined && answers[it.id] !== '').length
  const passage = item?.passageId ? test.passages.find((p) => p.id === item.passageId) : null

  function setAnswer(id: string, v: number | string) {
    setAnswers((a) => ({ ...a, [id]: v }))
  }

  async function submit() {
    const left = items.length - answeredCount
    if (!confirm(left > 0 ? `아직 ${left}문항을 안 풀었어요. 그래도 제출할까요?` : '제출할까요?')) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/level-tests/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: test!.id, student_name: name, student_id: studentId, mode: 'online', answers }),
      })
      const j = await res.json()
      if (!res.ok) {
        if (j.tableMissing) {
          // 저장 표가 없어도 점수는 보여 준다
          const score = scoreLevelTest(test!, answers)
          setLocalResult({ total: score.total, band: recommendLevel(test!.form, score.percent, test!.grade).band })
        }
        setError(j.error ?? '저장하지 못했습니다.')
        return
      }
      writeDraft(draftKey, null)
      router.push(`/materials/level-tests/results/${j.data.id}`)
    } catch {
      setError('저장하지 못했습니다. 인터넷 연결을 확인해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  function restart() {
    if (!confirm('처음부터 다시 풀까요? 지금까지 고른 답이 지워집니다.')) return
    writeDraft(draftKey, null)
    setAnswers({})
    setIndex(0)
    setStarted(false)
    setName('')
    setStudentId(null)
    setLocalResult(null)
  }

  // ── 시작 화면 ──
  if (!started) {
    return (
      <div className="mx-auto max-w-xl px-1">
        <p className="mb-2 text-xs text-gray-400">
          <Link href={`/materials/level-tests/${slug}`} className="hover:underline">← {info.grade} 폴더</Link>
        </p>
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="text-4xl">📏</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-800">{test.title}</h1>
          <p className="mt-1 flex items-center justify-center gap-2 text-sm text-gray-500">
            <FormBadge form={test.form} /> {test.items.length}문항 · {test.timeMinutes}분
          </p>
          <p className="mt-6 mb-2 text-left text-sm font-medium text-gray-700">이름을 쓰고 시작하세요</p>
          <StudentPicker name={name} studentId={studentId} onChange={(v) => { setName(v.name); setStudentId(v.studentId) }} large />
          <button
            disabled={!name.trim()}
            onClick={() => setStarted(true)}
            className="mt-6 w-full rounded-xl bg-blue-600 py-4 text-xl font-bold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            시작하기
          </button>
        </div>
      </div>
    )
  }

  // ── 문제 화면 ──
  return (
    <div className="mx-auto max-w-2xl px-1 pb-10">
      <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
        <span className="font-medium text-gray-700">{name}</span>
        <button onClick={() => setShowList((v) => !v)} className="rounded border border-gray-300 bg-white px-3 py-1.5">
          문항 목록 ({answeredCount}/{items.length})
        </button>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${((index + 1) / items.length) * 100}%` }} />
      </div>

      {showList && (
        <div className="mb-4 grid grid-cols-5 gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-10">
          {items.map((it, i) => {
            const done = answers[it.id] !== undefined && answers[it.id] !== ''
            return (
              <button
                key={it.id}
                onClick={() => { setIndex(i); setShowList(false) }}
                className={`rounded-lg py-2 text-base font-semibold ${i === index ? 'ring-2 ring-blue-500' : ''} ${done ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="mb-2 text-sm font-semibold text-blue-600">
          {SECTION_LABELS[item.section]} · {index + 1} / {items.length}
        </p>
        {passage && (
          <div className="mb-4">
            <PassageBox passage={passage} large />
          </div>
        )}
        <ItemHead item={item} num={index + 1} large />

        {item.type === 'mc' ? (
          <div className="mt-5 grid gap-3">
            {(item.choices ?? []).map((c, i) => {
              const picked = answers[item.id] === i
              return (
                <button
                  key={i}
                  onClick={() => setAnswer(item.id, i)}
                  className={`rounded-xl border-2 px-4 py-4 text-left text-lg ${picked ? 'border-blue-500 bg-blue-50 font-semibold text-blue-800' : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'}`}
                >
                  <span className="mr-2">{CHOICE_MARKS[i]}</span>
                  {c}
                </button>
              )
            })}
          </div>
        ) : (
          <input
            value={String(answers[item.id] ?? '')}
            onChange={(e) => setAnswer(item.id, e.target.value)}
            placeholder="여기에 쓰세요"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="mt-5 w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-xl focus:border-blue-500 focus:outline-none"
          />
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex-1 rounded-xl border border-gray-300 bg-white py-4 text-lg font-medium text-gray-700 disabled:opacity-40"
        >
          ← 이전
        </button>
        {index < items.length - 1 ? (
          <button onClick={() => setIndex((i) => i + 1)} className="flex-1 rounded-xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700">
            다음 →
          </button>
        ) : (
          <button onClick={submit} disabled={submitting} className="flex-1 rounded-xl bg-green-600 py-4 text-lg font-bold text-white hover:bg-green-700 disabled:opacity-50">
            {submitting ? '제출 중…' : '제출하기'}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-center text-sm text-red-500">{error}</p>}
      {localResult && (
        <p className="mt-2 text-center text-sm text-gray-700">
          (저장은 안 됐지만) 점수 {localResult.total}점 · 추천 반 {localResult.band}
        </p>
      )}
      <p className="mt-6 text-center">
        <button onClick={restart} className="text-xs text-gray-400 hover:underline">처음부터 다시 풀기</button>
      </p>
    </div>
  )
}
