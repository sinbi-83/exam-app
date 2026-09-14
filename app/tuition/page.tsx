'use client'

import { useEffect, useState } from 'react'

interface Student {
  id: string
  name: string
  grade: string
}

interface TuitionRecord {
  id?: string
  student_id: string
  month: string
  amount: number
  status: 'paid' | 'unpaid' | 'partial'
  paid_at: string | null
  note: string | null
  students?: { name: string; grade: string }
}

const STATUS_CONFIG = {
  paid: { label: '납부완료', color: 'bg-green-100 text-green-700 border-green-300' },
  unpaid: { label: '미납', color: 'bg-red-100 text-red-700 border-red-300' },
  partial: { label: '부분납부', color: 'bg-amber-100 text-amber-700 border-amber-300' },
} as const

type StatusKey = keyof typeof STATUS_CONFIG

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function TuitionPage() {
  const [month, setMonth] = useState(getMonthStr(new Date()))
  const [students, setStudents] = useState<Student[]>([])
  const [records, setRecords] = useState<Record<string, TuitionRecord>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [defaultAmount, setDefaultAmount] = useState('250000')

  useEffect(() => { loadStudents() }, [])
  useEffect(() => { if (students.length > 0) loadRecords() }, [month, students])

  async function loadStudents() {
    const res = await fetch('/api/students')
    const json = await res.json()
    setStudents(json.data ?? [])
    setLoading(false)
  }

  async function loadRecords() {
    const res = await fetch(`/api/tuition?month=${month}`)
    const json = await res.json()
    const map: Record<string, TuitionRecord> = {}
    // 기본값
    students.forEach((s) => {
      map[s.id] = { student_id: s.id, month, amount: Number(defaultAmount) || 250000, status: 'unpaid', paid_at: null, note: null }
    })
    // 저장된 값 덮어쓰기
    ;(json.data ?? []).forEach((r: TuitionRecord) => {
      map[r.student_id] = r
    })
    setRecords(map)
  }

  async function updateStatus(studentId: string, status: StatusKey) {
    setSaving(studentId)
    const rec = records[studentId] ?? { student_id: studentId, month, amount: Number(defaultAmount), status, paid_at: null, note: null }
    const newRec = {
      ...rec,
      status,
      paid_at: status === 'paid' ? new Date().toISOString().slice(0, 10) : null,
    }
    const res = await fetch('/api/tuition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRec),
    })
    const json = await res.json()
    if (!json.error) {
      setRecords((prev) => ({ ...prev, [studentId]: { ...newRec, ...json.data } }))
    }
    setSaving(null)
  }

  async function updateAmount(studentId: string, amount: number) {
    const rec = records[studentId]
    if (!rec) return
    const res = await fetch('/api/tuition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rec, amount }),
    })
    const json = await res.json()
    if (!json.error) setRecords((prev) => ({ ...prev, [studentId]: { ...rec, amount, ...json.data } }))
  }

  function changeMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(getMonthStr(d))
  }

  const [year, mon] = month.split('-')
  const paidCount = Object.values(records).filter((r) => r.status === 'paid').length
  const totalPaid = Object.values(records).filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0)
  const unpaidCount = Object.values(records).filter((r) => r.status !== 'paid').length

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">원비 관리</h1>

      {/* 월 네비 + 기본 원비 */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <button onClick={() => changeMonth(-1)} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">‹</button>
        <span className="text-base font-semibold text-gray-700">{year}년 {mon}월</span>
        <button onClick={() => changeMonth(1)} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">›</button>
        <div className="ml-4 flex items-center gap-2 text-sm">
          <span className="text-gray-500">기본 원비:</span>
          <input
            type="number"
            value={defaultAmount}
            onChange={(e) => setDefaultAmount(e.target.value)}
            className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <span className="text-gray-400">원</span>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-xs text-green-600">납부완료</p>
          <p className="text-2xl font-bold text-green-700">{paidCount}명</p>
          <p className="text-xs text-green-500">{totalPaid.toLocaleString()}원</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-xs text-red-600">미납</p>
          <p className="text-2xl font-bold text-red-700">{unpaidCount}명</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-xs text-gray-500">전체 학생</p>
          <p className="text-2xl font-bold text-gray-700">{students.length}명</p>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
          등록된 학생이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">학년</th>
                <th className="px-4 py-3">원비 (원)</th>
                <th className="px-4 py-3">납부 상태</th>
                <th className="px-4 py-3">납부일</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const rec = records[s.id]
                return (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.grade || '-'}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={rec?.amount ?? Number(defaultAmount)}
                        onChange={(e) => setRecords((prev) => ({ ...prev, [s.id]: { ...prev[s.id], amount: Number(e.target.value) } }))}
                        onBlur={(e) => updateAmount(s.id, Number(e.target.value))}
                        className="w-28 rounded border border-gray-200 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {(Object.keys(STATUS_CONFIG) as StatusKey[]).map((k) => (
                          <button
                            key={k}
                            onClick={() => updateStatus(s.id, k)}
                            disabled={saving === s.id}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all disabled:opacity-50 ${
                              rec?.status === k
                                ? STATUS_CONFIG[k].color + ' ring-2 ring-offset-1'
                                : 'border-gray-200 text-gray-400 hover:border-gray-300'
                            }`}
                          >
                            {STATUS_CONFIG[k].label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {rec?.paid_at ?? '-'}
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
