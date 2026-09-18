'use client'

import { useEffect, useState } from 'react'

interface Student {
  id: string
  name: string
  grade: string
}

interface AttendanceRecord {
  student_id: string
  status: 'present' | 'absent' | 'late' | 'excused'
  note: string
}

const STATUS_LABELS = {
  present: { label: '출석', color: 'bg-green-100 text-green-700 border-green-300', dot: 'bg-green-500' },
  absent: { label: '결석', color: 'bg-red-100 text-red-700 border-red-300', dot: 'bg-red-500' },
  late: { label: '지각', color: 'bg-amber-100 text-amber-700 border-amber-300', dot: 'bg-amber-500' },
  excused: { label: '공결', color: 'bg-blue-100 text-blue-700 border-blue-300', dot: 'bg-blue-500' },
} as const

type StatusKey = keyof typeof STATUS_LABELS

function makeDefaults(list: Student[]): Record<string, AttendanceRecord> {
  const defaults: Record<string, AttendanceRecord> = {}
  list.forEach((s) => {
    defaults[s.id] = { student_id: s.id, status: 'present', note: '' }
  })
  return defaults
}

export default function AttendancePage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [students, setStudents] = useState<Student[]>([])
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({})
  const [savedRecords, setSavedRecords] = useState<Record<string, AttendanceRecord>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadStudents()
  }, [])

  useEffect(() => {
    if (students.length > 0) loadAttendance()
  }, [date, students])

  async function loadStudents() {
    const res = await fetch('/api/students')
    const json = await res.json()
    const list: Student[] = json.data ?? []
    setStudents(list)
    const defaults = makeDefaults(list)
    setRecords(defaults)
    setSavedRecords(defaults)
    setLoading(false)
  }

  async function loadAttendance() {
    const res = await fetch(`/api/attendance?date=${date}`)
    const json = await res.json()
    const loaded = makeDefaults(students)
    if (json.data && json.data.length > 0) {
      json.data.forEach((r: { student_id: string; status: StatusKey; note: string | null }) => {
        loaded[r.student_id] = { student_id: r.student_id, status: r.status, note: r.note ?? '' }
      })
    }
    setRecords(loaded)
    setSavedRecords(loaded)
    setOpenId(null)
  }

  function setStatus(studentId: string, status: StatusKey) {
    setRecords((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], status },
    }))
    setSaved(false)
    setOpenId(null)
  }

  function markAllPresent() {
    setRecords((prev) => {
      const next = { ...prev }
      students.forEach((s) => {
        next[s.id] = { ...next[s.id], status: 'present' }
      })
      return next
    })
    setSaved(false)
    setOpenId(null)
  }

  function revertChanges() {
    setRecords(savedRecords)
    setSaved(false)
    setOpenId(null)
  }

  async function handleSave() {
    setSaving(true)
    const recordsList = Object.values(records).map((r) => ({ ...r, date }))
    await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: recordsList }),
    })
    setSavedRecords(records)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const counts = Object.values(records).reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc },
    {} as Record<string, number>
  )
  const total = students.length
  const presentCount = counts.present ?? 0
  const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0
  const hasUnsaved = Object.values(records).some(
    (r) => savedRecords[r.student_id]?.status !== r.status
  )
  const abnormalKeys: StatusKey[] = ['absent', 'late', 'excused']

  // 학년별 그룹 (등장 순서 유지)
  const grouped: { grade: string; students: Student[] }[] = []
  students.forEach((s) => {
    const key = s.grade || '학년 미지정'
    let group = grouped.find((g) => g.grade === key)
    if (!group) {
      group = { grade: key, students: [] }
      grouped.push(group)
    }
    group.students.push(s)
  })

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">출석관리</h1>

      {/* 날짜 + 요약 카드 */}
      <div className="mb-6 flex flex-wrap items-center gap-6 rounded-lg border border-gray-200 bg-white p-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />

        {/* 출석률 도넛 */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(#16a34a ${rate * 3.6}deg, #e5e7eb 0deg)` }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-semibold text-gray-800">
              {rate}%
            </div>
          </div>
          <div className="text-xs text-gray-400">
            출석률<br />
            <span className="text-gray-600">{presentCount}/{total}명</span>
          </div>
        </div>

        {/* 이상 상태만 강조 */}
        <div className="flex gap-2 text-sm">
          {abnormalKeys.map((k) => (
            (counts[k] ?? 0) > 0 && (
              <span key={k} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_LABELS[k].color}`}>
                {STATUS_LABELS[k].label} {counts[k]}
              </span>
            )
          ))}
          {abnormalKeys.every((k) => !(counts[k] ?? 0)) && (
            <span className="text-xs text-gray-400">이상 없음 · 전원 출석</span>
          )}
        </div>

        <div className="flex-1" />

        {/* 일괄 처리 */}
        <div className="flex items-center gap-2">
          <button
            onClick={markAllPresent}
            className="rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            전원 출석
          </button>
          <button
            onClick={revertChanges}
            disabled={!hasUnsaved}
            className="rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            변경 취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중…' : saved ? '✓ 저장됨' : hasUnsaved ? '저장 *' : '저장'}
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">등록된 학생이 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">학생관리에서 먼저 학생을 추가해주세요.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.grade} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
                {group.grade} · {group.students.length}명
              </div>
              <div>
                {group.students.map((s) => {
                  const rec = records[s.id]
                  const isAbnormal = rec?.status !== 'present'
                  const isOpen = openId === s.id
                  const changed = savedRecords[s.id]?.status !== rec?.status
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-0 ${
                        isAbnormal ? 'bg-red-50/30' : ''
                      }`}
                    >
                      {/* 미저장 변경 표시 */}
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${changed ? 'bg-orange-400' : 'bg-transparent'}`} />

                      <span className={`flex-1 text-sm ${isAbnormal ? 'font-medium text-gray-800' : 'text-gray-400'}`}>
                        {s.name}
                      </span>

                      {!isOpen ? (
                        <button
                          onClick={() => setOpenId(s.id)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${
                            isAbnormal ? STATUS_LABELS[rec.status].color : 'border-gray-200 bg-gray-50 text-gray-400'
                          }`}
                        >
                          {STATUS_LABELS[rec?.status ?? 'present'].label}
                        </button>
                      ) : (
                        <div className="flex gap-1.5">
                          {(Object.keys(STATUS_LABELS) as StatusKey[]).map((k) => (
                            <button
                              key={k}
                              onClick={() => setStatus(s.id, k)}
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                                rec?.status === k
                                  ? STATUS_LABELS[k].color + ' ring-2 ring-offset-1'
                                  : 'border-gray-200 text-gray-400 hover:border-gray-300'
                              }`}
                            >
                              {STATUS_LABELS[k].label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
