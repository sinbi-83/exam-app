'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PassageEssay,
  PassageMatchQuestion,
  PassageMultipleChoice,
  PassageOrderQuestion,
  PassageQuestion,
  PassageRecord,
} from '@/types/passageBank'
import { TaggedBody, stripTagMarkup } from '@/lib/passageTagRenderer'

export default function ExternalPassageDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [record, setRecord] = useState<PassageRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<PassageRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [showAnswers, setShowAnswers] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(`/api/passages/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        else setRecord(json.data)
      })
      .catch(() => setError('지문을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [id])

  function startEdit() {
    if (!record) return
    setDraft(JSON.parse(JSON.stringify(record)))
    setEditMode(true)
  }

  function cancelEdit() {
    setDraft(null)
    setEditMode(false)
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch(`/api/passages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title,
          level: draft.level,
          topic: draft.topic,
          tagged_body: draft.tagged_body,
          body: stripTagMarkup(draft.tagged_body),
          tags: draft.tags,
          questions: draft.questions,
          essays: draft.essays,
        }),
      })
      const json = await res.json()
      if (json.error) {
        alert('저장 실패: ' + json.error)
        return
      }
      setRecord(json.data)
      setEditMode(false)
      setDraft(null)
    } catch {
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('이 지문을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/passages/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) {
        alert('삭제 실패: ' + json.error)
        return
      }
      router.push('/external-passages')
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
    } finally {
      setDeleting(false)
    }
  }

  function updateQuestion(idx: number, updater: (q: PassageQuestion) => PassageQuestion) {
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, questions: prev.questions.map((q, i) => (i === idx ? updater(q) : q)) }
    })
  }

  function updateEssay(idx: number, updater: (e: PassageEssay) => PassageEssay) {
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, essays: prev.essays.map((e, i) => (i === idx ? updater(e) : e)) }
    })
  }

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-600">{error}</div>
  if (!record) return null

  const current = editMode && draft ? draft : record

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/external-passages" className="text-sm text-gray-500 hover:underline">
          ← 목록으로
        </Link>
        <div className="flex items-center gap-2">
          {!editMode && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={showAnswers}
                  onChange={(e) => setShowAnswers(e.target.checked)}
                />
                정답·해설 표시
              </label>
              <Link
                href={`/external-passages/${id}/print`}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                🖨️ 인쇄
              </Link>
              <button
                onClick={startEdit}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                편집
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-40"
              >
                {deleting ? '삭제 중…' : '삭제'}
              </button>
            </>
          )}
          {editMode && (
            <>
              <button
                onClick={cancelEdit}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {editMode && draft ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">제목</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">학년</label>
                <input
                  value={draft.level}
                  onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                  placeholder="예: 중1, 고2"
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">주제</label>
                <input
                  value={draft.topic}
                  onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                지문 (태그 마크업 포함: {'{{v:단어}}'} / {'{{g:구문|설명}}'} / {'{{t:구문}}'})
              </label>
              <textarea
                value={draft.tagged_body}
                onChange={(e) => setDraft({ ...draft, tagged_body: e.target.value })}
                rows={10}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm leading-6"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-lg font-semibold text-gray-800">{current.title}</h1>
              <div className="flex gap-1.5">
                <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">{current.level}</span>
                <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">{current.topic}</span>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-gray-800">
              <TaggedBody text={current.tagged_body} />
            </p>
          </>
        )}
      </div>

      {/* 문제 20개 */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">문제 ({current.questions.length}개)</h2>
        <div className="space-y-3">
          {current.questions.map((q, idx) => (
            <QuestionRow
              key={idx}
              index={idx}
              question={q}
              editMode={editMode}
              showAnswers={showAnswers}
              onChange={(updater) => updateQuestion(idx, updater)}
            />
          ))}
        </div>
      </div>

      {/* 서술형 5개 */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">서술형 ({current.essays.length}개)</h2>
        <div className="space-y-3">
          {current.essays.map((e, idx) => (
            <EssayRow
              key={idx}
              index={idx}
              essay={e}
              editMode={editMode}
              showAnswers={showAnswers}
              onChange={(updater) => updateEssay(idx, updater)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const QTYPE_LABEL: Record<PassageQuestion['type'], string> = {
  mc: '객관식',
  blank: '빈칸',
  tf: 'True/False',
  order: '순서배열',
  match: '매칭',
}

function QuestionRow({
  index,
  question,
  editMode,
  showAnswers,
  onChange,
}: {
  index: number
  question: PassageQuestion
  editMode: boolean
  showAnswers: boolean
  onChange: (updater: (q: PassageQuestion) => PassageQuestion) => void
}) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
          {index + 1}. {QTYPE_LABEL[question.type]}
        </span>
      </div>

      {question.type === 'mc' && (
        <McRow question={question} editMode={editMode} showAnswers={showAnswers} onChange={onChange} />
      )}
      {question.type === 'blank' && (
        <div>
          {editMode ? (
            <>
              <textarea
                value={question.q}
                onChange={(e) => onChange((q) => ({ ...(q as typeof question), q: e.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <input
                value={question.answer}
                onChange={(e) => onChange((q) => ({ ...(q as typeof question), answer: e.target.value }))}
                placeholder="정답"
                className="mt-1.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <textarea
                value={question.explanation}
                onChange={(e) => onChange((q) => ({ ...(q as typeof question), explanation: e.target.value }))}
                placeholder="해설"
                rows={2}
                className="mt-1.5 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
              />
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{question.q}</p>
              {showAnswers && (
                <>
                  <p className="mt-2 text-xs text-green-700">
                    <span className="font-medium text-gray-400">정답: </span>
                    {question.answer}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    <span className="font-medium text-gray-400">해설: </span>
                    {question.explanation}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}
      {question.type === 'tf' && (
        <div>
          {editMode ? (
            <>
              <textarea
                value={question.q}
                onChange={(e) => onChange((q) => ({ ...(q as typeof question), q: e.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <div className="mt-1.5 flex gap-3 text-xs text-gray-600">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={question.answer === true}
                    onChange={() => onChange((q) => ({ ...(q as typeof question), answer: true }))}
                  />
                  True
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={question.answer === false}
                    onChange={() => onChange((q) => ({ ...(q as typeof question), answer: false }))}
                  />
                  False
                </label>
              </div>
              <textarea
                value={question.explanation}
                onChange={(e) => onChange((q) => ({ ...(q as typeof question), explanation: e.target.value }))}
                placeholder="해설"
                rows={2}
                className="mt-1.5 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
              />
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{question.q}</p>
              {showAnswers && (
                <>
                  <p className="mt-2 text-xs text-green-700">
                    <span className="font-medium text-gray-400">정답: </span>
                    {question.answer ? 'True' : 'False'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    <span className="font-medium text-gray-400">해설: </span>
                    {question.explanation}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}
      {question.type === 'order' && (
        <OrderRow question={question} editMode={editMode} showAnswers={showAnswers} onChange={onChange} />
      )}
      {question.type === 'match' && (
        <MatchRow question={question} editMode={editMode} showAnswers={showAnswers} onChange={onChange} />
      )}
    </div>
  )
}

function McRow({
  question,
  editMode,
  showAnswers,
  onChange,
}: {
  question: PassageMultipleChoice
  editMode: boolean
  showAnswers: boolean
  onChange: (updater: (q: PassageQuestion) => PassageQuestion) => void
}) {
  if (editMode) {
    return (
      <div>
        <textarea
          value={question.q}
          onChange={(e) => onChange((q) => ({ ...(q as PassageMultipleChoice), q: e.target.value }))}
          rows={2}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
        <div className="mt-1.5 space-y-1">
          {question.choices.map((c, ci) => (
            <div key={ci} className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={question.answer === c}
                onChange={() => onChange((q) => ({ ...(q as PassageMultipleChoice), answer: c }))}
              />
              <input
                value={c}
                onChange={(e) =>
                  onChange((q) => {
                    const mc = q as PassageMultipleChoice
                    const choices = [...mc.choices]
                    const wasAnswer = mc.answer === choices[ci]
                    choices[ci] = e.target.value
                    return { ...mc, choices, answer: wasAnswer ? e.target.value : mc.answer }
                  })
                }
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>
        <textarea
          value={question.explanation}
          onChange={(e) => onChange((q) => ({ ...(q as PassageMultipleChoice), explanation: e.target.value }))}
          placeholder="해설"
          rows={2}
          className="mt-1.5 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
        />
      </div>
    )
  }

  return (
    <div>
      <p className="whitespace-pre-wrap text-sm text-gray-800">{question.q}</p>
      <ul className="mt-2 space-y-1">
        {question.choices.map((c, i) => (
          <li
            key={i}
            className={`rounded px-2 py-1 text-xs ${
              showAnswers && c === question.answer ? 'bg-green-50 font-medium text-green-700' : 'text-gray-600'
            }`}
          >
            {String.fromCharCode(9312 + i)} {c}
          </li>
        ))}
      </ul>
      {showAnswers && (
        <p className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-400">해설: </span>
          {question.explanation}
        </p>
      )}
    </div>
  )
}

function OrderRow({
  question,
  editMode,
  showAnswers,
  onChange,
}: {
  question: PassageOrderQuestion
  editMode: boolean
  showAnswers: boolean
  onChange: (updater: (q: PassageQuestion) => PassageQuestion) => void
}) {
  if (editMode) {
    return (
      <div>
        <p className="mb-1 text-xs text-gray-500">보여줄 순서 (뒤섞인 문장)</p>
        <div className="space-y-1">
          {question.items.map((item, ii) => (
            <input
              key={ii}
              value={item}
              onChange={(e) =>
                onChange((q) => {
                  const oq = q as PassageOrderQuestion
                  const items = [...oq.items]
                  items[ii] = e.target.value
                  return { ...oq, items }
                })
              }
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          ))}
        </div>
        <p className="mb-1 mt-2 text-xs text-gray-500">정답 순서 (올바른 문장 순서로 입력)</p>
        <div className="space-y-1">
          {question.answer.map((item, ai) => (
            <input
              key={ai}
              value={item}
              onChange={(e) =>
                onChange((q) => {
                  const oq = q as PassageOrderQuestion
                  const answer = [...oq.answer]
                  answer[ai] = e.target.value
                  return { ...oq, answer }
                })
              }
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">다음 문장을 순서대로 배열하세요.</p>
      <ul className="space-y-1">
        {question.items.map((item, i) => (
          <li key={i} className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
            {String.fromCharCode(65 + i)}. {item}
          </li>
        ))}
      </ul>
      {showAnswers && (
        <p className="mt-2 text-xs text-green-700">
          <span className="font-medium text-gray-400">정답: </span>
          {question.answer.join(' → ')}
        </p>
      )}
    </div>
  )
}

function MatchRow({
  question,
  editMode,
  showAnswers,
  onChange,
}: {
  question: PassageMatchQuestion
  editMode: boolean
  showAnswers: boolean
  onChange: (updater: (q: PassageQuestion) => PassageQuestion) => void
}) {
  if (editMode) {
    return (
      <div className="space-y-1.5">
        {question.pairs.map((p, pi) => (
          <div key={pi} className="flex items-center gap-2">
            <input
              value={p.word}
              onChange={(e) =>
                onChange((q) => {
                  const mq = q as PassageMatchQuestion
                  const pairs = mq.pairs.map((pp, i) => (i === pi ? { ...pp, word: e.target.value } : pp))
                  return { ...mq, pairs }
                })
              }
              placeholder="단어"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-gray-400">-</span>
            <input
              value={p.meaning}
              onChange={(e) =>
                onChange((q) => {
                  const mq = q as PassageMatchQuestion
                  const pairs = mq.pairs.map((pp, i) => (i === pi ? { ...pp, meaning: e.target.value } : pp))
                  return { ...mq, pairs }
                })
              }
              placeholder="뜻"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">단어와 뜻을 알맞게 연결하세요.</p>
      <div className="grid grid-cols-2 gap-3">
        <ul className="space-y-1">
          {question.pairs.map((p, i) => (
            <li key={i} className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
              {String.fromCharCode(65 + i)}. {p.word}
            </li>
          ))}
        </ul>
        <ul className="space-y-1">
          {question.pairs.map((p, i) => (
            <li key={i} className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
              {i + 1}. {showAnswers ? p.meaning : '?'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function EssayRow({
  index,
  essay,
  editMode,
  showAnswers,
  onChange,
}: {
  index: number
  essay: PassageEssay
  editMode: boolean
  showAnswers: boolean
  onChange: (updater: (e: PassageEssay) => PassageEssay) => void
}) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800">
          {index + 1}
        </span>
        {!editMode && (
          <span className="text-[11px] text-gray-400">{essay.wordLimit}자 내외</span>
        )}
      </div>

      {editMode ? (
        <div className="space-y-1.5">
          <textarea
            value={essay.q}
            onChange={(e) => onChange((es) => ({ ...es, q: e.target.value }))}
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">글자 수 제한</label>
            <input
              type="number"
              value={essay.wordLimit}
              onChange={(e) => onChange((es) => ({ ...es, wordLimit: Number(e.target.value) }))}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <textarea
            value={essay.sampleAnswer}
            onChange={(e) => onChange((es) => ({ ...es, sampleAnswer: e.target.value }))}
            placeholder="예시 답안"
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
          />
          <textarea
            value={essay.rubric}
            onChange={(e) => onChange((es) => ({ ...es, rubric: e.target.value }))}
            placeholder="채점 기준"
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
          />
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-800">{essay.q}</p>
          {showAnswers && (
            <div className="mt-2 space-y-1.5">
              <div className="rounded bg-gray-50 p-2 text-xs text-gray-600">
                <span className="font-medium text-gray-500">예시 답안: </span>
                {essay.sampleAnswer}
              </div>
              <div className="rounded bg-gray-50 p-2 text-xs text-gray-600">
                <span className="font-medium text-gray-500">채점 기준: </span>
                {essay.rubric}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
