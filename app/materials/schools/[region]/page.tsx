'use client'

// 지역의 학교 카드 목록. 카드마다 공립/사립, 주소, 우리 학생 수, 채운 칸 수.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import { findRegion, SCHOOL_PROFILE_SECTIONS, type SchoolProfileContent } from '@/config/schools'
import { FoundationBadge, SchoolTableMissingNotice, studentsOf, useStudents } from '@/components/schools/SchoolParts'

export default function SchoolRegionPage() {
  const params = useParams<{ region: string }>()
  const region = findRegion(params.region)
  const students = useStudents()
  const [profiles, setProfiles] = useState<Record<string, SchoolProfileContent>>({})
  const [tableMissing, setTableMissing] = useState(false)

  useEffect(() => {
    if (!region) return
    fetch(`/api/schools/profiles?region=${region.slug}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return
        setTableMissing(!!j.tableMissing)
        const m: Record<string, SchoolProfileContent> = {}
        for (const row of j.data ?? []) m[row.school_slug] = row.content ?? {}
        setProfiles(m)
      })
      .catch(() => {})
  }, [region])

  if (!region) notFound()

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-1 text-xs text-gray-400">
        <Link href="/materials/schools" className="hover:underline">학교 정보</Link> › {region.name}
      </p>
      <h1 className="mb-1 text-xl font-semibold text-gray-800">
        📁 {region.name} {region.level} {region.schools.length}곳
      </h1>
      <p className="mb-4 text-xs text-gray-500">
        목록 출처:{' '}
        <a href={region.source.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{region.source.label}</a>
        {' '}(확인 {region.source.checkedAt})
        {region.note && <><br />{region.note}</>}
      </p>
      {tableMissing && <SchoolTableMissingNotice />}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {region.schools.map((school) => {
          const mine = studentsOf(school, students)
          const content = profiles[school.slug] ?? {}
          const filled = SCHOOL_PROFILE_SECTIONS.filter(({ key }) => content[key]?.text?.trim()).length
          return (
            <Link
              key={school.slug}
              href={`/materials/schools/${region.slug}/${school.slug}`}
              className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">🏫</span>
                <FoundationBadge foundation={school.foundation} />
              </div>
              <p className="mt-2 font-semibold text-gray-800">{school.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">{school.address}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className={`rounded px-1.5 py-0.5 ${mine.length ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  우리 학생 {mine.length}명
                </span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
                  정보 {filled}/{SCHOOL_PROFILE_SECTIONS.length}칸
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
