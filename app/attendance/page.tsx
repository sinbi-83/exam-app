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
  present: { label: '출석', color: 'bg-green-100 text-green-700 border-green-300' },
  absent: { label: '결석', color: 'bg-red-100 text-red-700 border-red-300' },
  late: { label: '지각', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  excused: { label: '공결', color: 'bg-blue-100 text-blue-700 border-blue-300' },
} as const

type StatusKey = keyof typeof STATUS_LABELS

export default function AttendancePage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [students, setStudents] = useState<Student[]>([])
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({})
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
    // 기본값: 전원 출석
    const defaults: Record<string, AttendanceRecord> = {}
    list.forEach((s) => {
      defaults[s.id] = { student_id: s.id, status: 'present', note: '' }
    })
    setRecords(defaults)
    setLoading(false)
  }

  async function loadAttendance() {
    const res = await fetch(`/api/attendance?date=${date}`)
    const json = await res.json()
    if (json.data && json.data.length > 0) {
      const loaded: Record<string, AttendanceRecord> = {}
      // 기본값 복사
      students.forEach((s) => {
        loaded[s.id] = { student_id: s.id, status: 'present', note: '' }
      })
      // 저장된 값 덮어쓰기
      json.data.forEach((r: { student_id: string; status: StatusKey; note: string | null }) => {
        loaded[r.student_id] = { student_id: r.student_id, status: r.status, note: r.note ?? '' }
      })
      setRecords(loaded)
    } else {
      // 저장된 출석 없으면 기본값(전원 출석)
      const defaults: Record<string, AttendanceRecord> = {}
      students.forEach((s) => {
        defaults[s.id] = { student_id: s.id, status: 'present', note: '' }
      })
      setRecords(defaults)
    }
  }

  function setStatus(studentId: string, status: StatusKey) {
    setRecords((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], status },
    }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    const recordsList = Object.values(records).map((r) => ({ ...r, date }))
    await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: recordsList }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const counts = Object.values(records).reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc },
    {} as Record<string, number>
  )

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">출석관리</h1>

      {/* 날짜 선택 + 요약 */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="flex gap-3 text-sm">
          {(Object.keys(STATUS_LABELS) as StatusKey[]).map((k) => (
            <span key={k} className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_LABELS[k].color}`}>
              {STATUS_LABELS[k].label} {counts[k] ?? 0}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '저장 중…' : saved ? '✓ 저장됨' : '저장'}
        </button>
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">등록된 학생이 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">학생관리에서 먼저 학생을 추가해주세요.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">학년</th>
                <th className="px-4 py-3">출결 상태</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const rec = records[s.id]
                return (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.grade || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {(Object.keys(STATUS_LABELS) as StatusKey[]).map((k) => (
                          <button
                            key={k}
                            onClick={() => setStatus(s.id, k)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                              rec?.status === k
                                ? STATUS_LABELS[k].color + ' ring-2 ring-offset-1'
                                : 'border-gray-200 text-gray-400 hover:border-gray-300'
                            }`}
                          >
                            {STATUS_LABELS[k].label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
