'use client'

// 레벨테스트 첫 화면: 학년 폴더 10개 (초3~고3). 폴더마다 A형(초급~중급) · B형(중급~고급) 시험지.
// 시험지 내용은 data/level-tests/*.json, 응시 결과는 level_test_results 표 (lib/levelTest.ts).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LEVEL_TEST_FORMS, LEVEL_TEST_GRADES, findLevelTest } from '@/lib/levelTest'
import { schoolStageBadgeClass, schoolStageOf } from '@/lib/gradeLevel'
import { TableMissingNotice } from '@/components/levelTest/LevelTestParts'

interface ResultSummary {
  grade: string
}

export default function LevelTestsPage() {
  const [results, setResults] = useState<ResultSummary[]>([])
  const [tableMissing, setTableMissing] = useState(false)

  useEffect(() => {
    fetch('/api/level-tests/results')
      .then((r) => r.json())
      .then((j) => {
        if (!j.error) {
          setResults(j.data ?? [])
          setTableMissing(!!j.tableMissing)
        }
      })
      .catch(() => {})
  }, [])

  const countByGrade = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of results) m.set(r.grade, (m.get(r.grade) ?? 0) + 1)
    return m
  }, [results])

  const stages = ['초등', '중등', '고등'] as const

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">📏 레벨테스트</h1>
      <p className="mb-4 text-sm text-gray-500">
        학년마다 <b>A형(초급~중급)</b>·<b>B형(중급~고급)</b> 시험지가 있어요. 종이로 인쇄하거나 태블릿·휴대폰으로 풀고,
        채점하면 영역별 점수와 <b>추천 반</b>이 나옵니다.
      </p>
      {tableMissing && <TableMissingNotice />}

      <div className="space-y-5">
        {stages.map((stage) => (
          <section key={stage}>
            <h2 className="mb-2 text-sm font-semibold text-gray-600">{stage}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {LEVEL_TEST_GRADES.filter((g) => schoolStageOf(g.grade) === stage).map((g) => {
                const count = countByGrade.get(g.grade) ?? 0
                return (
                  <Link
                    key={g.slug}
                    href={`/materials/level-tests/${g.slug}`}
                    className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">📁</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${schoolStageBadgeClass(g.grade)}`}>{g.grade}</span>
                    </div>
                    <p className="mt-2 font-semibold text-gray-800">{g.grade} 레벨테스트</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {LEVEL_TEST_FORMS.map(({ form, label }) => {
                        const ready = !!findLevelTest(g.grade, form)
                        return (
                          <span key={form} className={`rounded px-1.5 py-0.5 ${ready ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                            {label} {ready ? '준비됨' : '준비 중'}
                          </span>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-gray-400">응시 결과 {count}건</p>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
