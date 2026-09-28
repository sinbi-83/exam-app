'use client'

// 시험 출제 > 문제 시험: 시험 이름·날짜를 정해 새 시험을 만들고, 바로 문항 구성(문제은행·외부지문 담기) 화면으로 간다.
// (예전 /exams 화면의 "+ 새 시험 만들기" 양식을 옮겨 왔다. 저장 API 는 같다: POST /api/exams → exam_type 'problem')

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function CreateProblemTestPage() {
  const router = useRouter()
  const [form, setForm] = useState({ title: '', exam_date: '', max_score: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return setError('시험명을 입력하세요.')
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          exam_date: form.exam_date || null,
          max_score: form.max_score ? Number(form.max_score) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? '저장 실패')
      // 만든 시험의 문항 구성 화면으로
      router.push(`/tests/${json.data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">문제 시험 출제</h1>
      <p className="mb-6 text-sm text-gray-500">
        시험을 만든 뒤 다음 화면에서 문제은행·외부지문의 문제를 담습니다. 만든 시험은{' '}
        <Link href="/tests" className="text-blue-600 hover:underline">시험지 보관함</Link>에 모입니다.
      </p>

      <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-blue-200 bg-blue-50 p-5">
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-gray-600">시험명 *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="예) 2026년 2학기 중간고사 대비"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-600">시험일</label>
          <input
            type="date"
            value={form.exam_date}
            onChange={(e) => setForm((f) => ({ ...f, exam_date: e.target.value }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-600">만점</label>
          <input
            type="number"
            value={form.max_score}
            onChange={(e) => setForm((f) => ({ ...f, max_score: e.target.value }))}
            placeholder="100"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        <div className="col-span-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '만드는 중…' : '시험 만들고 문항 담기 →'}
          </button>
        </div>
      </form>
    </div>
  )
}
