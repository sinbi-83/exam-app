'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Student {
  id: string
  name: string
  grade: string
  pin: string
  created_at: string
  school_name: string
  student_phone: string
  parent_phone: string
  enrolled_at: string | null
  notes: string
}

const GRADE_GROUPS = [
  { label: '초등', grades: ['초1', '초2', '초3', '초4', '초5', '초6'] },
  { label: '중학', grades: ['중1', '중2', '중3'] },
  { label: '고등', grades: ['고1', '고2', '고3'] },
]

const EMPTY_FORM = {
  name: '', grade: '', school_name: '',
  student_phone: '', parent_phone: '', enrolled_at: '', notes: '',
}

type FormState = typeof EMPTY_FORM
type CopiedState = { id: string; type: 'link' | 'message' } | null

function GradeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      {GRADE_GROUPS.map(group => (
        <div key={group.label} className="flex items-center gap-2">
          <span className="w-8 text-xs text-gray-400 shrink-0">{group.label}</span>
          <div className="flex flex-wrap gap-1">
            {group.grades.map(g => (
              <button
                key={g} type="button"
                onClick={() => onChange(value === g ? '' : g)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                  value === g
                    ? 'bg-blue-800 text-white border-blue-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-500 hover:text-blue-700'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StudentForm({
  form, setForm, onSubmit, onCancel, submitting, isNew,
}: {
  form: FormState
  setForm: (f: FormState) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  submitting?: boolean
  isNew?: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">학생 이름 *</label>
          <input
            type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="홍길동"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">학교명</label>
          <input
            type="text" value={form.school_name} onChange={e => setForm({ ...form, school_name: e.target.value })}
            placeholder="○○중학교"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">학년</label>
        <GradeSelector value={form.grade} onChange={v => setForm({ ...form, grade: v })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">학생 연락처</label>
          <input
            type="tel" value={form.student_phone} onChange={e => setForm({ ...form, student_phone: e.target.value })}
            placeholder="010-0000-0000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">학부모 연락처</label>
          <input
            type="tel" value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })}
            placeholder="010-0000-0000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">등록일</label>
          <input
            type="date" value={form.enrolled_at} onChange={e => setForm({ ...form, enrolled_at: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">특이사항</label>
          <input
            type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder="알레르기, 성향 등"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit" disabled={submitting}
          className="px-5 py-2 rounded-lg bg-blue-800 text-white text-sm font-medium hover:bg-blue-900 disabled:opacity-50"
        >
          {submitting ? '처리 중...' : isNew ? '등록' : '저장'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">
          취소
        </button>
      </div>
    </form>
  )
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState<CopiedState>(null)
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function fetchStudents() {
    setLoading(true)
    try {
      const res = await fetch('/api/students')
      const result = await res.json()
      if (res.ok) setStudents(result.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStudents() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setForm(EMPTY_FORM)
        setShowForm(false)
        fetchStudents()
      } else {
        const r = await res.json()
        alert(r.error || '등록에 실패했습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 학생을 삭제하시겠습니까?')) return
    await fetch(`/api/students/${id}`, { method: 'DELETE' })
    fetchStudents()
  }

  function handleEditStart(student: Student) {
    setEditId(student.id)
    setEditForm({
      name: student.name,
      grade: student.grade,
      school_name: student.school_name || '',
      student_phone: student.student_phone || '',
      parent_phone: student.parent_phone || '',
      enrolled_at: student.enrolled_at || '',
      notes: student.notes || '',
    })
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const res = await fetch(`/api/students/${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (res.ok) { setEditId(null); fetchStudents() }
    else alert('저장에 실패했습니다.')
  }

  function handleCopyLink(student: Student) {
    navigator.clipboard.writeText(`${window.location.origin}/parent/${student.id}`)
    setCopied({ id: student.id, type: 'link' })
    setTimeout(() => setCopied(null), 2000)
  }

  function handleCopyMessage(student: Student) {
    const link = `${window.location.origin}/parent/${student.id}`
    const text = `[${student.name} 학생 성적 조회]\n링크: ${link}\nPIN: ${student.pin}`
    navigator.clipboard.writeText(text)
    setCopied({ id: student.id, type: 'message' })
    setTimeout(() => setCopied(null), 2000)
  }

  const filtered = students.filter(s =>
    s.name.includes(search) || s.grade.includes(search) || (s.school_name || '').includes(search)
  )

  const gradeCounts: Record<string, number> = {}
  students.forEach(s => {
    const group = s.grade.startsWith('초') ? '초등' : s.grade.startsWith('중') ? '중학' : s.grade.startsWith('고') ? '고등' : ''
    if (group) gradeCounts[group] = (gradeCounts[group] || 0) + 1
  })

  return (
    <div className="max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">학생 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            총 {students.length}명
            {Object.entries(gradeCounts).map(([g, n]) => (
              <span key={g} className="ml-2 text-gray-400">· {g} {n}명</span>
            ))}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setForm(EMPTY_FORM) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-800 text-white text-sm font-medium hover:bg-blue-900 transition-colors"
        >
          <span className="text-base leading-none">+</span> 학생 등록
        </button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/60 p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-4">새 학생 등록</h2>
          <StudentForm
            form={form} setForm={setForm}
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
            submitting={submitting}
            isNew
          />
        </div>
      )}

      {/* 검색 */}
      <div className="mb-4">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  이름, 학년, 학교로 검색"
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 학생 목록 */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">
          {search ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(student => (
            <div key={student.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">

              {/* 카드 헤더 - 클릭 시 펼침 */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expandedId === student.id ? null : student.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-800 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {student.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{student.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {student.grade && <span className="font-medium text-blue-800 mr-1.5">{student.grade}</span>}
                      {student.school_name && <span className="mr-1.5">{student.school_name}</span>}
                      <span className="text-gray-400">PIN {student.pin}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/analytics?student_id=${student.id}`}
                    onClick={e => e.stopPropagation()}
                    className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">
                    📈 성적
                  </Link>
                  <Link href={`/report?student_id=${student.id}`}
                    onClick={e => e.stopPropagation()}
                    className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">
                    📝 보고서
                  </Link>
                  <span className="text-gray-300 text-sm">{expandedId === student.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* 펼쳐진 상세 */}
              {expandedId === student.id && (
                <div className="border-t border-gray-100 px-5 py-4">
                  {editId === student.id ? (
                    <StudentForm
                      form={editForm} setForm={setEditForm}
                      onSubmit={handleEditSave}
                      onCancel={() => setEditId(null)}
                    />
                  ) : (
                    <div className="space-y-3">
                      {/* 정보 그리드 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        {student.student_phone && (
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400 text-xs w-20 shrink-0">학생 연락처</span>
                            <a href={`tel:${student.student_phone}`} className="text-gray-700 hover:text-blue-700 font-medium">
                              {student.student_phone}
                            </a>
                          </div>
                        )}
                        {student.parent_phone && (
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400 text-xs w-20 shrink-0">학부모 연락처</span>
                            <a href={`tel:${student.parent_phone}`} className="text-gray-700 hover:text-blue-700 font-medium">
                              {student.parent_phone}
                            </a>
                          </div>
                        )}
                        {student.enrolled_at && (
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400 text-xs w-20 shrink-0">등록일</span>
                            <span className="text-gray-700">{student.enrolled_at}</span>
                          </div>
                        )}
                        {student.notes && (
                          <div className="flex items-center gap-3 sm:col-span-2">
                            <span className="text-gray-400 text-xs w-20 shrink-0">특이사항</span>
                            <span className="text-gray-700">{student.notes}</span>
                          </div>
                        )}
                        {!student.student_phone && !student.parent_phone && !student.enrolled_at && !student.notes && (
                          <p className="sm:col-span-2 text-xs text-gray-400">추가 정보가 없습니다. 수정 버튼으로 입력해보세요.</p>
                        )}
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                        <button onClick={() => handleCopyLink(student)}
                          className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
                          {copied?.id === student.id && copied.type === 'link' ? '✅ 복사됨' : '🔗 링크 복사'}
                        </button>
                        <button onClick={() => handleCopyMessage(student)}
                          className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
                          {copied?.id === student.id && copied.type === 'message' ? '✅ 복사됨' : '💬 학부모 안내문 복사'}
                        </button>
                        <button onClick={() => handleEditStart(student)}
                          className="px-3 py-1.5 rounded-md border border-blue-200 text-xs text-blue-700 hover:bg-blue-50">
                          ✏️ 수정
                        </button>
                        <button onClick={() => handleDelete(student.id)}
                          className="px-3 py-1.5 rounded-md border border-red-200 text-xs text-red-500 hover:bg-red-50 ml-auto">
                          🗑 삭제
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
