'use client'

// 반 상세: 명단(넣기·빼기·옮기기), 요일·시간, 종료. 삭제 버튼은 일부러 없다.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { kstDateString } from '@/lib/dashboard'
import { formatSchedule, STUDENT_STATUS_LABELS, studentStatusOf, type ScheduleInput } from '@/lib/classManagement'
import { ClassFields, classFormBody, EMPTY_CLASS_FORM, NotReadyNotice, warningText, type ClassFormState, type MemberWarningView } from '@/components/classes/ClassParts'

type Student = { id: string; name: string; grade: string | null; school_name?: string | null; status?: string | null }
type Member = { id: string; student_id: string; joined_on: string; left_on: string | null; student: Student | null }
type ClassDetail = {
  id: string
  name: string
  target_grades: string[]
  teacher_name: string | null
  status: 'active' | 'closed'
  closed_on: string | null
  note: string | null
  schedules: ScheduleInput[]
  members: Member[]
  past_members: Member[]
}
type OtherClass = { id: string; name: string; status: string }

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [cls, setCls] = useState<ClassDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ClassFormState>(EMPTY_CLASS_FORM)
  const [busy, setBusy] = useState(false)
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [otherClasses, setOtherClasses] = useState<OtherClass[]>([])
  const [addIds, setAddIds] = useState<string[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closedOn, setClosedOn] = useState(() => kstDateString(new Date()))
  const [moving, setMoving] = useState<string | null>(null)
  const [moveTo, setMoveTo] = useState('')

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const res = await fetch(`/api/classes/${id}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) setLoadError(json.error ?? '불러오지 못했어요')
      else if (json.needsMigration) setNeedsMigration(true)
      else setCls(json.data)
    } catch {
      setLoadError('불러오지 못했어요')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
    fetch('/api/students').then((r) => r.json()).then((j) => setAllStudents(j.data ?? [])).catch(() => setAllStudents([]))
    fetch('/api/classes', { cache: 'no-store' }).then((r) => r.json()).then((j) => setOtherClasses(j.data ?? [])).catch(() => setOtherClasses([]))
  }, [load])

  // 요청 하나를 보내고, 실패하면 알린 뒤 false. 성공하면 다시 읽는다.
  async function send(url: string, method: string, body: unknown): Promise<{ warnings?: MemberWarningView[] } | null> {
    setBusy(true)
    try {
      const res = await fetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? '처리하지 못했습니다.')
        await load()
        return null
      }
      await load()
      return json
    } catch {
      alert('처리하지 못했습니다. 잠시 후 다시 해 주세요.')
      return null
    } finally {
      setBusy(false)
    }
  }

  function startEdit() {
    if (!cls) return
    setForm({
      name: cls.name,
      target_grades: cls.target_grades,
      teacher_name: cls.teacher_name ?? '',
      note: cls.note ?? '',
      schedules: cls.schedules.map((s) => ({ weekday: s.weekday, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5) })),
    })
    setEditing(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (await send(`/api/classes/${id}`, 'PATCH', classFormBody(form))) setEditing(false)
  }

  async function addStudents() {
    const result = await send(`/api/classes/${id}/students`, 'POST', { student_ids: addIds })
    if (!result) return
    setAddIds([])
    setShowAdd(false)
    if (result.warnings?.length) alert(`넣었습니다. 학년을 확인해 주세요.\n${warningText(result.warnings)}`)
  }

  async function removeStudent(member: Member) {
    if (!confirm(`${member.student?.name ?? '이 학생'} 학생을 이 반에서 뺄까요? 지난 소속 기록은 남습니다.`)) return
    await send(`/api/classes/${id}/students`, 'PATCH', { student_ids: [member.student_id] })
  }

  async function moveStudent(member: Member) {
    if (!moveTo) return
    const result = await send(`/api/classes/${id}/students/move`, 'POST', { student_ids: [member.student_id], to_class_id: moveTo })
    if (!result) return
    setMoving(null)
    setMoveTo('')
    if (result.warnings?.length) alert(`옮겼습니다. 학년을 확인해 주세요.\n${warningText(result.warnings)}`)
  }

  async function closeClass() {
    if (!confirm('이 반을 종료할까요? 지금 명단의 학생은 모두 이 반에서 빠지고 기록은 남습니다. 종료는 되돌릴 수 없습니다.')) return
    if (await send(`/api/classes/${id}`, 'PATCH', { action: 'close', closed_on: closedOn })) setClosing(false)
  }

  const back = <Link href="/classes" className="text-sm text-gray-400 hover:text-blue-600">← 반 목록</Link>

  if (loading) return <p className="py-12 text-center text-sm text-gray-400">불러오는 중...</p>
  if (needsMigration) return <div className="mx-auto max-w-3xl space-y-4">{back}<NotReadyNotice /></div>
  if (loadError || !cls) return <div className="mx-auto max-w-3xl space-y-4">{back}<p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">{loadError || '반을 찾을 수 없습니다.'}</p></div>

  const isRunning = cls.status === 'active'
  const memberIds = new Set(cls.members.map((m) => m.student_id))
  const addable = allStudents.filter((s) => !memberIds.has(s.id) && studentStatusOf(s) !== 'withdrawn')
  const moveTargets = otherClasses.filter((c) => c.id !== cls.id && c.status === 'active')

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">{back}</div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        {editing ? (
          <form onSubmit={saveEdit}>
            <ClassFields form={form} setForm={setForm} />
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={busy} className="rounded-lg bg-blue-800 px-5 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50">저장</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-800">{cls.name}</h1>
                {!isRunning && <p className="mt-0.5 text-sm text-gray-500">{cls.closed_on} 종료</p>}
              </div>
              <button onClick={startEdit} className="shrink-0 rounded-md border border-blue-200 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50">✏️ 수정</button>
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <Info label="요일·시간" value={cls.schedules.map(formatSchedule).join(', ') || '시간 미정'} />
              <Info label="대상 학년" value={cls.target_grades.join('·') || '정하지 않음'} />
              <Info label="담당 선생님" value={cls.teacher_name || '-'} />
              <Info label="메모" value={cls.note || '-'} />
            </dl>
          </>
        )}
      </div>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600">명단 {cls.members.length}명</h2>
          {isRunning && (
            <button onClick={() => setShowAdd(!showAdd)} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">+ 학생 넣기</button>
          )}
        </div>

        {showAdd && (
          <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            {addable.length === 0 ? (
              <p className="text-sm text-gray-500">넣을 수 있는 학생이 없습니다.</p>
            ) : (
              <div className="grid max-h-60 gap-1 overflow-y-auto sm:grid-cols-2">
                {addable.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-gray-700 hover:bg-white">
                    <input
                      type="checkbox"
                      checked={addIds.includes(s.id)}
                      onChange={(e) => setAddIds(e.target.checked ? [...addIds, s.id] : addIds.filter((x) => x !== s.id))}
                    />
                    {s.name}{s.grade && <span className="text-xs text-gray-400">{s.grade}</span>}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button onClick={addStudents} disabled={busy || addIds.length === 0} className="rounded-lg bg-blue-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50">
                {addIds.length}명 넣기
              </button>
              <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">취소</button>
            </div>
          </div>
        )}

        {cls.members.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">명단이 비어 있습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {cls.members.map((m) => {
              const status = m.student ? studentStatusOf(m.student) : 'active'
              return (
                <li key={m.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-medium text-gray-800">{m.student?.name ?? '(학생 정보 없음)'}</span>
                      {m.student?.grade && <span className="ml-1.5 text-xs text-blue-800">{m.student.grade}</span>}
                      {status !== 'active' && <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{STUDENT_STATUS_LABELS[status]}</span>}
                      <span className="ml-1.5 text-xs text-gray-400">{m.joined_on} 입반</span>
                    </div>
                    {isRunning && (
                      <div className="flex gap-3 text-xs">
                        {moveTargets.length > 0 && (
                          <button onClick={() => { setMoving(moving === m.id ? null : m.id); setMoveTo('') }} className="text-blue-600 hover:underline">옮기기</button>
                        )}
                        <button onClick={() => removeStudent(m)} disabled={busy} className="text-gray-400 hover:text-red-500 disabled:opacity-50">빼기</button>
                      </div>
                    )}
                  </div>
                  {moving === m.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" aria-label="옮길 반">
                        <option value="">옮길 반 선택</option>
                        {moveTargets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button onClick={() => moveStudent(m)} disabled={busy || !moveTo} className="rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">옮기기</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {cls.past_members.length > 0 && (
        <section className="mb-6">
          <button onClick={() => setShowPast(!showPast)} className="text-sm font-medium text-gray-500 hover:text-gray-700">
            지난 소속 기록 {cls.past_members.length}건 {showPast ? '▲' : '▼'}
          </button>
          {showPast && (
            <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {cls.past_members.map((m) => (
                <li key={m.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="text-gray-700">{m.student?.name ?? '(학생 정보 없음)'}</span>
                  <span className="text-xs text-gray-400">{m.joined_on} ~ {m.left_on}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isRunning && (
        <section className="border-t border-gray-200 pt-4">
          {closing ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-gray-600" htmlFor="closed-on">종료일</label>
              <input id="closed-on" type="date" value={closedOn} onChange={(e) => setClosedOn(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
              <button onClick={closeClass} disabled={busy || !closedOn} className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">반 종료</button>
              <button onClick={() => setClosing(false)} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">취소</button>
            </div>
          ) : (
            <button onClick={() => setClosing(true)} className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">반 종료</button>
          )}
        </section>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-xs leading-5 text-gray-400">{label}</dt>
      <dd className="min-w-0 text-gray-700">{value}</dd>
    </div>
  )
}
