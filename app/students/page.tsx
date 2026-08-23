'use client'

import { useEffect, useState } from 'react'

interface Student {
  id: string
  name: string
  grade: string
  pin: string
  created_at: string
}

type CopiedState = { id: string; type: 'link' | 'message' } | null

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState<CopiedState>(null)

  async function fetchStudents() {
    setLoading(true)
    try {
      const res = await fetch('/api/students')
      const result = await res.json()
      if (res.ok) {
        setStudents(result.data || [])
      }
    } catch {
      // 조용히 실패 (목록이 비어있는 것으로 표시됨)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStudents()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, grade }),
      })
      const result = await res.json()
      if (!res.ok) {
        alert(result.error || '등록에 실패했습니다.')
        return
      }
      setName('')
      setGrade('')
      fetchStudents()
    } catch {
      alert('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 학생을 삭제하시겠습니까? 관련 성적 기록도 함께 삭제됩니다.')) return

    try {
      const res = await fetch(`/api/students/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchStudents()
      }
    } catch {
      alert('삭제 중 문제가 발생했어요.')
    }
  }

  // 순수 링크만 복사 (테스트/직접 접속용)
  function handleCopyLinkOnly(student: Student) {
    const link = `${window.location.origin}/parent/${student.id}`
    navigator.clipboard.writeText(link)
    setCopied({ id: student.id, type: 'link' })
    setTimeout(() => setCopied(null), 2000)
  }

  // 학부모께 보낼 안내문구 복사 (카톡/문자용, 설명+링크+PIN 포함)
  function handleCopyMessage(student: Student) {
    const link = `${window.location.origin}/parent/${student.id}`
    const text = `[${student.name} 학생 성적 조회 링크]\n${link}\nPIN 번호: ${student.pin}`
    navigator.clipboard.writeText(text)
    setCopied({ id: student.id, type: 'message' })
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-800">학생 관리</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-8 flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-6"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="학생 이름"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          placeholder="학년 (예: 중학교 1학년)"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? '등록 중...' : '학생 등록'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : students.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          등록된 학생이 없습니다. 위에서 학생을 등록해보세요.
        </p>
      ) : (
        <div className="space-y-3">
          {students.map((student) => (
            <div
              key={student.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-gray-800">{student.name}</p>
                <p className="text-sm text-gray-500">
                  {student.grade} · PIN {student.pin}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopyLinkOnly(student)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {copied?.id === student.id && copied.type === 'link' ? '복사됨!' : '링크만 복사'}
                </button>
                <button
                  onClick={() => handleCopyMessage(student)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {copied?.id === student.id && copied.type === 'message' ? '복사됨!' : '학부모 안내문구 복사'}
                </button>
                <button
                  onClick={() => handleDelete(student.id)}
                  className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}