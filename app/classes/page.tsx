'use client'

// 반 관리 목록 (학생관리 메뉴 안). 반은 지우지 않고 종료만 한다 (상세 화면).
// SQL 적용 전에는 "반 관리 준비 중(DB 적용 필요)"만 보인다.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatSchedule, type ScheduleInput } from '@/lib/classManagement'
import { ClassFields, classFormBody, EMPTY_CLASS_FORM, NotReadyNotice, type ClassFormState } from '@/components/classes/ClassParts'

type ClassRow = {
  id: string
  name: string
  target_grades: string[]
  teacher_name: string | null
  status: 'active' | 'closed'
  closed_on: string | null
  schedules: ScheduleInput[]
  member_count: number
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [form, setForm] = useState<ClassFormState>(EMPTY_CLASS_FORM)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/classes', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) setLoadError(json.error ?? '불러오지 못했어요')
      else {
        setClasses(json.data ?? [])
        setNeedsMigration(!!json.needsMigration)
      }
    } catch {
      setLoadError('불러오지 못했어요')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(classFormBody(form)),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? '반 만들기에 실패했습니다.')
        return
      }
      setForm(EMPTY_CLASS_FORM)
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const running = classes.filter((c) => c.status === 'active')
  const closed = classes.filter((c) => c.status === 'closed')

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">반 관리</h1>
          {!needsMigration && !loading && <p className="mt-0.5 text-sm text-gray-500">운영 중 {running.length}개 · 종료 {closed.length}개</p>}
        </div>
        {!needsMigration && !loading && !loadError && (
          <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900">
            + 반 만들기
          </button>
        )}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-gray-400">불러오는 중...</p>
      ) : needsMigration ? (
        <NotReadyNotice />
      ) : loadError ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">{loadError}</p>
      ) : (
        <>
          {showForm && (
            <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-blue-100 bg-blue-50/60 p-5">
              <h2 className="mb-4 text-sm font-semibold text-blue-900">새 반 만들기</h2>
              <ClassFields form={form} setForm={setForm} />
              <p className="mt-3 text-xs text-gray-500">학생은 만든 뒤 반 화면이나 학생관리 목록에서 넣습니다.</p>
              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={saving} className="rounded-lg bg-blue-800 px-5 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50">
                  {saving ? '처리 중...' : '만들기'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  취소
                </button>
              </div>
            </form>
          )}

          {running.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">운영 중인 반이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {running.map((c) => <ClassCard key={c.id} cls={c} />)}
            </div>
          )}

          {closed.length > 0 && (
            <div className="mt-8">
              <button onClick={() => setShowClosed(!showClosed)} className="text-sm font-medium text-gray-500 hover:text-gray-700">
                종료된 반 {closed.length}개 {showClosed ? '▲' : '▼'}
              </button>
              {showClosed && (
                <div className="mt-3 space-y-3">
                  {closed.map((c) => <ClassCard key={c.id} cls={c} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ClassCard({ cls }: { cls: ClassRow }) {
  return (
    <Link href={`/classes/${cls.id}`} className="block rounded-xl border border-gray-200 bg-white px-5 py-4 hover:border-blue-300">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-semibold text-gray-800">{cls.name}</p>
        {cls.status === 'closed' ? (
          <span className="shrink-0 text-xs text-gray-400">{cls.closed_on} 종료</span>
        ) : (
          <span className="shrink-0 text-sm font-medium text-gray-700">{cls.member_count}명</span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {[
          cls.target_grades.join('·'),
          cls.teacher_name,
          cls.schedules.map(formatSchedule).join(', ') || '시간 미정',
        ].filter(Boolean).join(' · ')}
      </p>
    </Link>
  )
}
