import Link from 'next/link'
import { SCHOOL_REGIONS } from '@/config/schools'

// 학교 정보 첫 화면: 지역 폴더 (지금은 대구 남구 중학교). 지역·학교 목록은 config/schools.ts
export default function SchoolsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">🏫 학교 정보</h1>
      <p className="mb-6 text-sm text-gray-500">
        학생들이 다니는(다닐) 학교의 교과서·시험 일정·평가 비율·출제 경향을 모아 두는 곳입니다.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SCHOOL_REGIONS.map((region) => (
          <Link
            key={region.slug}
            href={`/materials/schools/${region.slug}`}
            className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50"
          >
            <span className="text-2xl">📁</span>
            <p className="mt-2 font-semibold text-gray-800">{region.name}</p>
            <p className="mt-1 text-xs text-gray-500">
              {region.level} {region.schools.length}곳
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
