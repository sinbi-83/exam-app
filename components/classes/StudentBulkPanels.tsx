'use client'

// 학생관리 목록에서 고른 학생들로 하는 일: 반 만들기, 기존 반에 넣기, 퇴원 처리.

import { useState } from 'react'
import { kstDateString } from '@/lib/dashboard'
import { ClassFields, classFormBody, EMPTY_CLASS_FORM, warningText, type ClassFormState } from '@/components/classes/ClassParts'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export type ClassOption = { id: string; name: string; status: string }

type Done = () => void | Promise<void>

export function CreateClassPanel({ studentIds, onDone, onCancel }: { studentIds: string[]; onDone: Done; onCancel: () => void }) {
  const [form, setForm] = useState<ClassFormState>(EMPTY_CLASS_FORM)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/classes', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ ...classFormBody(form), student_ids: studentIds }) })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? '반 만들기에 실패했습니다.')
        return
      }
      if (json.warnings?.length) alert(`반을 만들었습니다. 학년을 확인해 주세요.\n${warningText(json.warnings)}`)
      await onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-5">
      <h2 className="mb-4 text-sm font-semibold text-blue-900">고른 {studentIds.length}명으로 새 반 만들기</h2>
      <ClassFields form={form} setForm={setForm} />
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-800 px-5 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50">{saving ? '처리 중...' : '만들기'}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
      </div>
    </form>
  )
}

export function AddToClassPanel({ studentIds, classes, onDone, onCancel }: { studentIds: string[]; classes: ClassOption[]; onDone: Done; onCancel: () => void }) {
  const running = classes.filter((c) => c.status === 'active')
  const [classId, setClassId] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!classId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/classes/${classId}/students`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ student_ids: studentIds }) })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? '반에 넣지 못했습니다.')
        return
      }
      const notes = [`${json.added}명을 넣었습니다.`]
      if (json.alreadyIn > 0) notes.push(`${json.alreadyIn}명은 이미 이 반에 있습니다.`)
      if (json.warnings?.length) notes.push(`학년을 확인해 주세요.\n${warningText(json.warnings)}`)
      alert(notes.join('\n'))
      await onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-5">
      <h2 className="mb-3 text-sm font-semibold text-blue-900">고른 {studentIds.length}명을 기존 반에 넣기</h2>
      {running.length === 0 ? (
        <p className="mb-3 text-sm text-gray-500">운영 중인 반이 없습니다. 먼저 반을 만들어 주세요.</p>
      ) : (
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" aria-label="넣을 반">
          <option value="">반 선택</option>
          {running.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !classId} className="rounded-lg bg-blue-800 px-5 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50">{saving ? '처리 중...' : '넣기'}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
      </div>
    </form>
  )
}

// 퇴원은 학생마다 DB 함수를 부른다 (학생 한 명의 상태 변경과 소속 닫기는 한 번에 처리된다). 일부만 실패하면 이름을 알려 준다.
export function WithdrawPanel({ students, onDone, onCancel }: { students: { id: string; name: string }[]; onDone: Done; onCancel: () => void }) {
  const today = kstDateString(new Date())
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    const who = students.length === 1 ? `${students[0].name} 학생을` : `${students.length}명을`
    if (!confirm(`${who} 퇴원 처리할까요? 들어 있는 모든 반에서 빠집니다. 출석·성적 등 기록은 그대로 남습니다.`)) return
    setSaving(true)
    try {
      const failed: string[] = []
      for (const s of students) {
        const res = await fetch(`/api/students/${s.id}/status`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ status: 'withdrawn', withdrawn_on: date, withdraw_note: note }),
        }).catch(() => null)
        if (!res?.ok) {
          const json = await res?.json().catch(() => null)
          failed.push(`${s.name}: ${json?.error ?? '처리하지 못했습니다.'}`)
        }
      }
      if (failed.length > 0) alert(`퇴원 처리하지 못한 학생이 있습니다.\n${failed.join('\n')}`)
      await onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-xl border border-red-100 bg-red-50/60 p-5">
      <h2 className="mb-3 text-sm font-semibold text-red-900">
        퇴원 처리: {students.length === 1 ? students[0].name : `${students.length}명`}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="withdrawn-on" className="mb-1 block text-xs font-medium text-gray-600">퇴원일 *</label>
          <input id="withdrawn-on" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="withdraw-note" className="mb-1 block text-xs font-medium text-gray-600">사유 (선택)</label>
          <input id="withdraw-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving || !date} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{saving ? '처리 중...' : '퇴원 처리'}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
      </div>
    </form>
  )
}
