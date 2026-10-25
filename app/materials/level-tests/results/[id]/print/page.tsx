'use client'

// 레벨테스트 상담용 결과지 (학부모 상담·안내용 A4). 로고·서명은 /api/settings/academy (없으면 public/brand 기본 파일).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import A4SheetPrint, { type PrintBlock } from '@/components/A4SheetPrint'
import { copyrightNotice } from '@/config/copyright'
import { SECTION_LABELS, findLevelTestById, isItemCorrect, orderedItems, strengthsAndWeaknesses } from '@/lib/levelTest'
import type { LevelTest, LevelTestResultRow } from '@/types/levelTest'

interface Brand {
  academy_name: string | null
  logo_url: string | null
  signature_url: string | null
}

function buildBlocks(row: LevelTestResultRow, test: LevelTest, brand: Brand): PrintBlock[] {
  const { strengths, weaknesses } = strengthsAndWeaknesses(row.score)
  const items = orderedItems(test)
  const academy = brand.academy_name || '보스턴S영어'
  const blocks: PrintBlock[] = []

  blocks.push({
    key: 'head',
    gapMm: 6,
    node: (
      <div className="flex items-center justify-between border-b-2 border-gray-800 pb-3">
        <div>
          <p className="text-[11px] text-gray-500">{academy}</p>
          <p className="text-xl font-bold text-gray-900">레벨테스트 결과 안내</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logo_url ?? '/brand/logo.png'} alt="" className="h-14 w-auto object-contain" />
      </div>
    ),
  })

  blocks.push({
    key: 'info',
    gapMm: 5,
    node: (
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          <tr>
            <th className="w-24 border border-gray-300 bg-gray-50 px-2 py-1.5 text-left font-medium">학생</th>
            <td className="border border-gray-300 px-2 py-1.5">{row.student_name}</td>
            <th className="w-24 border border-gray-300 bg-gray-50 px-2 py-1.5 text-left font-medium">응시일</th>
            <td className="border border-gray-300 px-2 py-1.5">{new Date(row.taken_at).toLocaleDateString('ko-KR')}</td>
          </tr>
          <tr>
            <th className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-left font-medium">시험지</th>
            <td className="border border-gray-300 px-2 py-1.5">{test.title}</td>
            <th className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-left font-medium">수준</th>
            <td className="border border-gray-300 px-2 py-1.5">{test.form === 'A' ? 'A형 (초급~중급)' : 'B형 (중급~고급)'}</td>
          </tr>
        </tbody>
      </table>
    ),
  })

  blocks.push({
    key: 'score',
    gapMm: 5,
    node: (
      <div className="flex gap-4">
        <div className="w-40 rounded border border-gray-300 p-3 text-center">
          <p className="text-[11px] text-gray-500">총점</p>
          <p className="text-3xl font-bold text-gray-900">{row.score.total}<span className="text-sm font-normal text-gray-400"> / {row.score.max}</span></p>
        </div>
        <div className="flex-1 rounded border-2 border-blue-300 p-3">
          <p className="text-[11px] text-blue-600">추천 반</p>
          <p className="text-2xl font-bold text-blue-800">{row.recommendation.band}</p>
          <p className="mt-0.5 text-[13px] text-gray-700">{row.recommendation.summary}</p>
        </div>
      </div>
    ),
  })

  blocks.push({
    key: 'sections',
    gapMm: 5,
    node: (
      <div>
        <p className="mb-2 text-[13px] font-semibold text-gray-800">영역별 결과</p>
        <div className="space-y-1.5">
          {row.score.sections.map((s) => {
            const pct = s.max ? Math.round((s.score / s.max) * 100) : 0
            return (
              <div key={s.section} className="flex items-center gap-3 text-[13px]">
                <span className="w-14 text-gray-700">{SECTION_LABELS[s.section]}</span>
                <div className="h-3.5 flex-1 overflow-hidden rounded-full border border-gray-300 bg-gray-100">
                  <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-32 text-right text-gray-700">{s.score}/{s.max}점 · {s.correct}/{s.count}문항</span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[13px] text-gray-700">
          ✅ 강점: <b>{strengths.length ? strengths.map((s) => SECTION_LABELS[s]).join(', ') : '-'}</b>
          <span className="mx-3 text-gray-300">|</span>
          🔧 보완할 점: <b>{weaknesses.length ? weaknesses.map((s) => SECTION_LABELS[s]).join(', ') : '-'}</b>
        </p>
      </div>
    ),
  })

  blocks.push({
    key: 'items',
    gapMm: 5,
    node: (
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-gray-800">문항별 결과</p>
        <div className="grid grid-cols-10 gap-1 text-center text-[12px]">
          {items.map((it, i) => {
            const ok = isItemCorrect(it, row.answers, row.overrides)
            return (
              <div key={it.id} className="rounded border border-gray-300 py-1">
                <p className="text-[10px] text-gray-400">{i + 1}</p>
                <p className={`font-bold ${ok ? 'text-blue-600' : 'text-red-500'}`}>{ok ? 'O' : 'X'}</p>
              </div>
            )
          })}
        </div>
      </div>
    ),
  })

  blocks.push({
    key: 'advice',
    gapMm: 5,
    node: (
      <div className="rounded border border-gray-300 p-3 text-[13px] leading-6">
        <p className="mb-1 font-semibold text-gray-800">선생님 의견</p>
        <p className="text-gray-800">{row.recommendation.advice}</p>
        {row.memo && <p className="mt-1 whitespace-pre-line text-gray-700">{row.memo}</p>}
      </div>
    ),
  })

  blocks.push({
    key: 'sign',
    gapMm: 0,
    node: (
      <div className="flex items-center justify-end gap-3 pt-2 text-[13px] text-gray-700">
        <span>{new Date().toLocaleDateString('ko-KR')}</span>
        <span className="font-semibold">{academy}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.signature_url ?? '/brand/signature.png'} alt="" className="h-12 w-auto object-contain" />
      </div>
    ),
  })
  return blocks
}

export default function LevelTestResultPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [row, setRow] = useState<LevelTestResultRow | null>(null)
  const [brand, setBrand] = useState<Brand>({ academy_name: null, logo_url: null, signature_url: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetch(`/api/level-tests/results/${id}`).then((r) => r.json()), fetch('/api/settings/academy').then((r) => r.json()).catch(() => ({}))])
      .then(([r, b]) => {
        if (r.data) setRow(r.data)
        if (b?.data) setBrand(b.data)
      })
      .finally(() => setLoading(false))
  }, [id])

  const test = row ? findLevelTestById(row.test_id) : null
  const blocks = useMemo(() => (row && test ? buildBlocks(row, test, brand) : []), [row, test, brand])

  if (loading) return <p className="py-20 text-center text-sm text-gray-400">불러오는 중…</p>
  if (!row || !test) return <p className="py-20 text-center text-sm text-gray-400">결과를 찾을 수 없습니다.</p>

  return (
    <A4SheetPrint
      blocks={blocks}
      fileName={`레벨테스트 결과 ${row.student_name}`}
      footerText={copyrightNotice('report')}
      padTopMm={20}
      controls={<Link href={`/materials/level-tests/results/${id}`} className="text-sm text-gray-500 hover:underline">← 결과 화면</Link>}
    />
  )
}
