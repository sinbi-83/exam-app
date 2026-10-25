'use client'

// 학년 폴더: A형·B형 시험지 카드 (인쇄 / 태블릿 응시 / 종이 채점 입력) + 이 학년 응시 결과 목록.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { LEVEL_TEST_FORMS, SECTION_LABELS, SECTION_ORDER, findLevelTest, gradeBySlug, levelTestProblems } from '@/lib/levelTest'
import { FormBadge, GradeBadge, TableMissingNotice } from '@/components/levelTest/LevelTestParts'
import type { LevelTestResultRow } from '@/types/levelTest'

type ResultSummary = Pick<LevelTestResultRow, 'id' | 'form' | 'student_name' | 'mode' | 'score' | 'recommendation' | 'taken_at'>

export default function LevelTestGradePage() {
  const { grade: slug } = useParams<{ grade: string }>()
  const info = gradeBySlug(slug)
  const [results, setResults] = useState<ResultSummary[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!info) return
    fetch(`/api/level-tests/results?grade=${encodeURIComponent(info.grade)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.error) {
          setResults(j.data ?? [])
          setTableMissing(!!j.tableMissing)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [info])

  if (!info) return <p className="py-20 text-center text-sm text-gray-400">없는 학년입니다.</p>

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-2 text-xs text-gray-400">
        <Link href="/materials/level-tests" className="hover:underline">📏 레벨테스트</Link> › {info.grade}
      </p>
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-800">
        📁 {info.grade} 레벨테스트 <GradeBadge grade={info.grade} />
      </h1>
      {tableMissing && <TableMissingNotice />}

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {LEVEL_TEST_FORMS.map(({ form, label, range }) => {
          const test = findLevelTest(info.grade, form)
          const base = `/materials/level-tests/${slug}/${form}`
          if (!test) {
            return (
              <div key={form} className="rounded-lg border border-dashed border-gray-300 bg-white p-5">
                <div className="flex items-center gap-2">
                  <FormBadge form={form} />
                  <span className="text-sm text-gray-500">{range}</span>
                </div>
                <p className="mt-3 text-sm text-gray-400">{label} 시험지는 아직 준비 중이에요.</p>
              </div>
            )
          }
          const problems = levelTestProblems(test)
          const sectionCounts = SECTION_ORDER.map((s) => ({ s, n: test.items.filter((i) => i.section === s).length })).filter((x) => x.n > 0)
          return (
            <div key={form} className="flex flex-col rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <FormBadge form={form} />
                <span className="text-sm text-gray-500">{range}</span>
              </div>
              <p className="mt-2 font-semibold text-gray-800">{test.title}</p>
              <p className="mt-1 text-sm text-gray-500">{test.description}</p>
              <p className="mt-2 text-xs text-gray-400">
                {test.items.length}문항 · 100점 · {test.timeMinutes}분 · {sectionCounts.map((x) => `${SECTION_LABELS[x.s]} ${x.n}`).join(' / ')}
              </p>
              {problems.length > 0 && <p className="mt-2 text-xs text-red-500">시험지 확인 필요: {problems.join(', ')}</p>}

              <p className="mt-4 text-xs font-semibold text-gray-500">🖨️ 인쇄</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Link href={`${base}/print?mode=test`} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">시험지</Link>
                <Link href={`${base}/print?mode=sheet`} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">답안지</Link>
                <Link href={`${base}/print?mode=key`} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">정답·해설</Link>
              </div>
              <p className="mt-3 text-xs font-semibold text-gray-500">응시·채점</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Link href={`${base}/grade`} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">✏️ 종이 답 입력·채점</Link>
                <Link href={`${base}/take`} className="rounded border border-blue-300 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50">📱 태블릿·휴대폰으로 풀기</Link>
              </div>
            </div>
          )
        })}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">응시 결과</h2>
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : results.length === 0 ? (
        <p className="rounded border border-gray-200 bg-white py-8 text-center text-sm text-gray-400">아직 응시 결과가 없어요.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">날짜</th>
                <th className="px-3 py-2 text-left">학생</th>
                <th className="px-3 py-2 text-left">시험지</th>
                <th className="px-3 py-2 text-right">점수</th>
                <th className="px-3 py-2 text-left">추천 반</th>
                <th className="px-3 py-2 text-left">방식</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-500">{new Date(r.taken_at).toLocaleDateString('ko-KR')}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.student_name}</td>
                  <td className="px-3 py-2"><FormBadge form={r.form} /></td>
                  <td className="px-3 py-2 text-right font-semibold">{r.score?.total ?? 0}점</td>
                  <td className="px-3 py-2 text-gray-700">{r.recommendation?.band ?? '-'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.mode === 'online' ? '📱 태블릿' : '🖨️ 종이'}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/materials/level-tests/results/${r.id}`} className="text-xs text-blue-600 hover:underline">결과 보기</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
