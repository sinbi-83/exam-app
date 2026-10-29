'use client'

// 학교 상세: 기본정보(고정, config/schools.ts) + 고쳐 쓰는 칸 7개(school_profiles) + 우리 학생 목록.
// 칸마다 확인됨/추정 표시. 확인 안 된 내용은 비워 두거나 "추정"으로 표시한다.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import {
  findRegion,
  findSchool,
  SCHOOL_PROFILE_SECTIONS,
  type SchoolProfileContent,
  type SchoolSectionKey,
  type SchoolSectionStatus,
} from '@/config/schools'
import { FoundationBadge, SchoolTableMissingNotice, studentsOf, useStudents } from '@/components/schools/SchoolParts'

const STATUS_OPTIONS: { value: SchoolSectionStatus; label: string; cls: string }[] = [
  { value: '', label: '표시 없음', cls: 'border-gray-200 text-gray-500' },
  { value: 'confirmed', label: '확인됨', cls: 'border-green-300 bg-green-50 text-green-700' },
  { value: 'estimated', label: '추정', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
]

export default function SchoolDetailPage() {
  const params = useParams<{ region: string; school: string }>()
  const region = findRegion(params.region)
  const school = findSchool(params.region, params.school)
  const students = useStudents()
  const [content, setContent] = useState<SchoolProfileContent>({})
  const [loaded, setLoaded] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!region || !school) return
    fetch(`/api/schools/profiles?region=${region.slug}&school=${school.slug}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return
        setTableMissing(!!j.tableMissing)
        setContent(j.data?.[0]?.content ?? {})
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [region, school])

  if (!region || !school) notFound()

  const mine = studentsOf(school, students)

  const setSection = (key: SchoolSectionKey, patch: Partial<{ text: string; status: SchoolSectionStatus }>) => {
    setContent((prev) => ({ ...prev, [key]: { text: prev[key]?.text ?? '', status: prev[key]?.status ?? '', ...patch } }))
    setMessage('')
  }

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/schools/profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: region.slug, school: school.slug, content }),
      })
      const j = await res.json()
      if (j.tableMissing) setTableMissing(true)
      setMessage(j.error ? `저장 실패: ${j.error}` : '저장했어요.')
    } catch {
      setMessage('저장 실패: 네트워크 오류')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-1 text-xs text-gray-400">
        <Link href="/materials/schools" className="hover:underline">학교 정보</Link> ›{' '}
        <Link href={`/materials/schools/${region.slug}`} className="hover:underline">{region.name}</Link> › {school.name}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-800">🏫 {school.name}</h1>
        <FoundationBadge foundation={school.foundation} />
      </div>
      {tableMissing && <SchoolTableMissingNotice />}

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <div className="grid gap-1 sm:grid-cols-[6rem_1fr]">
          <span className="text-gray-500">주소</span>
          <span className="text-gray-800">{school.address}</span>
          <span className="text-gray-500">설립</span>
          <span className="text-gray-800">{school.foundation}</span>
          <span className="text-gray-500">출처</span>
          <span className="text-xs text-gray-500">
            <a href={region.source.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{region.source.label}</a>
            {' '}(확인 {region.source.checkedAt})
          </span>
          <span className="text-gray-500">우리 학생</span>
          <span className="text-gray-800">
            {mine.length === 0 ? (
              <span className="text-gray-400">0명 (학생관리의 학교 이름이 &quot;{school.aliases[0]}&quot; 또는 &quot;{school.name}&quot;이면 여기 보여요)</span>
            ) : (
              <>
                {mine.length}명 —{' '}
                {mine.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ', '}
                    {s.name}
                    {s.grade && <span className="text-xs text-gray-400"> ({s.grade})</span>}
                  </span>
                ))}
              </>
            )}
          </span>
        </div>
      </section>

      <div className="space-y-3">
        {SCHOOL_PROFILE_SECTIONS.map(({ key, label, placeholder }) => {
          const section = content[key]
          return (
            <section key={key} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700">{label}</h2>
                <div className="ml-auto flex gap-1">
                  {STATUS_OPTIONS.map((opt) => {
                    const active = (section?.status ?? '') === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSection(key, { status: opt.value })}
                        className={`rounded border px-2 py-0.5 text-[11px] ${active ? opt.cls + ' font-semibold' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <textarea
                value={section?.text ?? ''}
                onChange={(e) => setSection(key, { text: e.target.value })}
                placeholder={placeholder}
                rows={3}
                disabled={!loaded}
                className="w-full rounded border border-gray-200 p-2 text-sm text-gray-800 placeholder:text-gray-300 focus:border-blue-300 focus:outline-none"
              />
            </section>
          )
        })}
      </div>

      <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t border-gray-100 bg-white/90 py-3 backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={saving || !loaded}
          className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        {message && <span className={`text-sm ${message.startsWith('저장 실패') ? 'text-red-600' : 'text-green-700'}`}>{message}</span>}
      </div>
    </div>
  )
}
