'use client'

import { Fragment, useEffect, useState } from 'react'

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

const GRADE_GROUPS = ['초등', '중학', '고등', '기타'] as const
type GradeGroup = (typeof GRADE_GROUPS)[number]

function gradeGroup(grade: string): GradeGroup {
  if (grade.startsWith('초')) return '초등'
  if (grade.startsWith('중')) return '중학'
  if (grade.startsWith('고')) return '고등'
  return '기타'
}

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function TuitionPage() {
  const [month, setMonth] = useState(getMonthStr(new Date()))
  const [students, setStudents] = useState<Student[]>([])
  const [records, setRecords] = useState<Record<string, TuitionRecord>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [defaultAmounts, setDefaultAmounts] = useState<Record<GradeGroup, string>>({
    초등: '200000',
    중학: '250000',
    고등: '300000',
    기타: '250000',
  })

  useEffect(() => { loadStudents() }, [])
  useEffect(() => { if (students.length > 0) loadRecords() }, [month, students])

  // 학년별 기본 원비가 바뀌면, 아직 저장되지 않은(=기본값으로 채워진) 학생 금액에만 반영
  useEffect(() => {
    setRecords((prev) => {
      const next = { ...prev }
      students.forEach((s) => {
        const rec = next[s.id]
        if (rec && !rec.id) {
          next[s.id] = { ...rec, amount: Number(defaultAmounts[gradeGroup(s.grade)]) || 0 }
        }
      })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAmounts])

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
    // 기본값 (학년군별)
    students.forEach((s) => {
      const amount = Number(defaultAmounts[gradeGroup(s.grade)]) || 0
      map[s.id] = { student_id: s.id, month, amount, status: 'unpaid', paid_at: null, note: null }
    })
    // 저장된 값 덮어쓰기
    ;(json.data ?? []).forEach((r: TuitionRecord) => {
      map[r.student_id] = r
    })
    setRecords(map)
  }

  async function updateStatus(studentId: string, status: StatusKey) {
    setSaving(studentId)
    const student = students.find((s) => s.id === studentId)
    const fallbackAmount = Number(defaultAmounts[gradeGroup(student?.grade ?? '')]) || 0
    const rec = records[studentId] ?? { student_id: studentId, month, amount: fallbackAmount, status, paid_at: null, note: null }
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

  const studentsByGroup = GRADE_GROUPS.map((g) => ({
    group: g,
    students: students.filter((s) => gradeGroup(s.grade) === g),
  })).filter((g) => g.students.length > 0)

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">원비 관리</h1>

      {/* 월 네비 + 기본 원비 */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <button onClick={() => changeMonth(-1)} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">‹</button>
        <span className="text-base font-semibold text-gray-700">{year}년 {mon}월</span>
        <button onClick={() => changeMonth(1)} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">›</button>
      </div>

      {/* 학년별 기본 원비 */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <span className="text-sm text-gray-500">학년별 기본 원비:</span>
        {(['초등', '중학', '고등'] as const).map((g) => (
          <div key={g} className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">{g}</span>
            <input
              type="number"
              value={defaultAmounts[g]}
              onChange={(e) => setDefaultAmounts((prev) => ({ ...prev, [g]: e.target.value }))}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-gray-400">원</span>
          </div>
        ))}
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
              {studentsByGroup.map(({ group, students: groupStudents }) => (
                <Fragment key={group}>
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-gray-500">
                      {group} ({groupStudents.length}명)
                    </td>
                  </tr>
                  {groupStudents.map((s) => {
                    const rec = records[s.id]
                    return (
                      <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                        <td className="px-4 py-3 text-gray-500">{s.grade || '-'}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={rec?.amount ?? Number(defaultAmounts[gradeGroup(s.grade)])}
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
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
