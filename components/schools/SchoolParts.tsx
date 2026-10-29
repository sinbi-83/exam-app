'use client'

import { useEffect, useState } from 'react'
import { schoolMatchesName, type SchoolInfo } from '@/config/schools'

export function SchoolTableMissingNotice() {
  return (
    <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
      학교 정보 저장 표가 아직 없어요. 학교 목록·기본정보는 보이지만 <b>칸 저장</b>은 Supabase SQL Editor 에서
      <code className="mx-1">school-profiles-migration.sql</code>의 한 줄 SQL 을 실행한 뒤부터 됩니다.
    </div>
  )
}

export interface StudentLite {
  id: string
  name: string
  grade: string
  school_name?: string | null
}

// 내 학생 목록 (학교 이름으로 "우리 학생 ○명" 세기)
export function useStudents(): StudentLite[] {
  const [students, setStudents] = useState<StudentLite[]>([])
  useEffect(() => {
    fetch('/api/students')
      .then((r) => r.json())
      .then((j) => {
        if (!j.error) setStudents(j.data ?? [])
      })
      .catch(() => {})
  }, [])
  return students
}

export function studentsOf(school: SchoolInfo, students: StudentLite[]): StudentLite[] {
  return students.filter((s) => schoolMatchesName(school, s.school_name))
}

export function FoundationBadge({ foundation }: { foundation: SchoolInfo['foundation'] }) {
  const cls = foundation === '공립' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-purple-200 bg-purple-50 text-purple-700'
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{foundation}</span>
}
