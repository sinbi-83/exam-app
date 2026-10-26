'use client'

// 레벨테스트 A4 인쇄: ?mode=test(시험지) | sheet(답안지) | key(정답·해설, 교사용)
// 쪽 나누기는 components/A4SheetPrint.tsx (외부지문 인쇄와 같은 A4 방식, docs/print-layout-notes.md).

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import A4SheetPrint, { type PrintBlock } from '@/components/A4SheetPrint'
import { copyrightNotice } from '@/config/copyright'
import { LEVEL_TEST_BANDS } from '@/config/levelTestBands'
import { CHOICE_MARKS, SECTION_ORDER, bandAdvice, findLevelTest, gradeBySlug, orderedItems } from '@/lib/levelTest'
import { ItemHead, PassageBox, PrintChoices, sectionTitle } from '@/components/levelTest/LevelTestParts'
import type { LevelTest, LevelTestItem } from '@/types/levelTest'

type Mode = 'test' | 'sheet' | 'key'
const MODE_LABELS: Record<Mode, string> = { test: '시험지', sheet: '답안지', key: '정답·해설' }

function Header({ test, mode }: { test: LevelTest; mode: Mode }) {
  return (
    <div className="border-b-2 border-gray-800 pb-2">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] text-gray-500">보스턴S영어 레벨테스트</p>
          <p className="text-lg font-bold text-gray-900">
            {test.title} <span className="text-sm font-medium text-gray-500">· {MODE_LABELS[mode]}</span>
          </p>
          <p className="text-[11px] text-gray-500">
            {test.items.length}문항 · 100점 · {test.timeMinutes}분
          </p>
        </div>
        {mode !== 'key' && (
          <div className="grid grid-cols-3 gap-2 text-[12px] text-gray-700">
            <span className="w-28 border-b border-gray-400 pb-0.5">이름</span>
            <span className="w-24 border-b border-gray-400 pb-0.5">날짜</span>
            <span className="w-20 border-b border-gray-400 pb-0.5">점수 &nbsp;&nbsp;&nbsp;&nbsp;/100</span>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHead({ children }: { children: ReactNode }) {
  return <p className="border-l-4 border-gray-700 pl-2 text-[14px] font-bold text-gray-900">{children}</p>
}

function answerText(item: LevelTestItem): string {
  if (item.type === 'mc') return `${CHOICE_MARKS[item.answer as number]} ${item.choices?.[item.answer as number] ?? ''}`
  return [String(item.answer), ...(item.accept ?? [])].join(' / ')
}

function buildBlocks(test: LevelTest, mode: Mode): PrintBlock[] {
  const blocks: PrintBlock[] = [{ key: 'head', gapMm: 5, node: <Header test={test} mode={mode} /> }]
  const items = orderedItems(test)
  const numOf = new Map(items.map((it, i) => [it.id, i + 1]))

  for (const section of SECTION_ORDER) {
    const list = items.filter((i) => i.section === section)
    if (list.length === 0) continue
    const first = numOf.get(list[0].id)!
    const last = numOf.get(list[list.length - 1].id)!
    blocks.push({ key: `s-${section}`, gapMm: 2.5, keepWithNext: true, node: <SectionHead>{sectionTitle(section)} ({first}~{last}번)</SectionHead> })

    if (mode === 'test') {
      const shown = new Set<string>()
      for (const it of list) {
        if (it.passageId && !shown.has(it.passageId)) {
          shown.add(it.passageId)
          const passage = test.passages.find((p) => p.id === it.passageId)
          const nums = list.filter((x) => x.passageId === it.passageId).map((x) => numOf.get(x.id))
          if (passage)
            blocks.push({
              key: `p-${passage.id}`,
              gapMm: 2.5,
              keepWithNext: true,
              node: (
                <div>
                  <p className="mb-1 text-[12px] text-gray-600">[{nums[0]}~{nums[nums.length - 1]}] 다음 글을 읽고 물음에 답하세요.</p>
                  <PassageBox passage={passage} />
                </div>
              ),
            })
        }
        blocks.push({
          key: `q-${it.id}`,
          gapMm: 4,
          node: (
            <div className="question-block">
              <ItemHead item={it} num={numOf.get(it.id)!} />
              {it.type === 'mc' ? (
                <PrintChoices choices={it.choices ?? []} />
              ) : (
                <div className="mt-2 h-8 border-b border-gray-400" />
              )}
            </div>
          ),
        })
      }
    } else if (mode === 'sheet') {
      blocks.push({
        key: `a-${section}`,
        gapMm: 5,
        node: (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
            {list.map((it) =>
              it.type === 'mc' ? (
                <div key={it.id} className="flex items-center gap-3 border-b border-gray-200 pb-1">
                  <span className="w-6 font-semibold">{numOf.get(it.id)}.</span>
                  {CHOICE_MARKS.slice(0, it.choices?.length ?? 4).map((m) => (
                    <span key={m} className="text-[15px] text-gray-700">{m}</span>
                  ))}
                </div>
              ) : (
                <div key={it.id} className="col-span-2 flex items-end gap-3">
                  <span className="w-6 font-semibold">{numOf.get(it.id)}.</span>
                  <span className="h-8 flex-1 border-b border-gray-400" />
                </div>
              ),
            )}
          </div>
        ),
      })
    } else {
      for (const it of list) {
        blocks.push({
          key: `k-${it.id}`,
          gapMm: 2,
          node: (
            <div className="answer-block flex gap-2 text-[12px] leading-5">
              <span className="w-6 shrink-0 font-semibold">{numOf.get(it.id)}.</span>
              <span className="w-40 shrink-0 font-semibold text-red-600">{answerText(it)}</span>
              <span className="text-gray-700">{it.explanation}</span>
            </div>
          ),
        })
      }
    }
  }

  if (mode === 'key') {
    blocks.push({
      key: 'bands',
      gapMm: 0,
      node: (
        <div className="mt-2 rounded border border-gray-300 p-3 text-[12px]">
          <p className="mb-1 font-semibold text-gray-800">추천 반 기준 ({test.form}형)</p>
          {LEVEL_TEST_BANDS[test.form].map((b, i, arr) => (
            <p key={b.min} className="text-gray-700">
              {b.min}~{i === 0 ? 100 : arr[i - 1].min - 1}점 → <b>{b.band}</b>{bandAdvice(b, test.grade) && ` · ${bandAdvice(b, test.grade)}`}
            </p>
          ))}
        </div>
      ),
    })
  }
  return blocks
}

export default function LevelTestPrintPage() {
  const { grade: slug, form } = useParams<{ grade: string; form: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const mode = (['test', 'sheet', 'key'].includes(search.get('mode') ?? '') ? search.get('mode') : 'test') as Mode
  const info = gradeBySlug(slug)
  const test = info ? findLevelTest(info.grade, form) : null
  const blocks = useMemo(() => (test ? buildBlocks(test, mode) : []), [test, mode])
  // 인쇄 틀은 브라우저에서만 그린다 (서버에서 그리면 A4SheetPrint 의 <style> 글자가 서버/브라우저에서 달라 hydration 경고가 난다)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return <p className="py-20 text-center text-sm text-gray-400">불러오는 중…</p>
  if (!test) return <p className="py-20 text-center text-sm text-gray-400">시험지를 찾을 수 없습니다.</p>

  return (
    <A4SheetPrint
      blocks={blocks}
      fileName={`${test.title} ${MODE_LABELS[mode]}`}
      footerText={copyrightNotice('exam')}
      padTopMm={20}
      controls={
        <>
          <Link href={`/materials/level-tests/${slug}`} className="text-sm text-gray-500 hover:underline">← {info!.grade} 폴더</Link>
          <div className="flex overflow-hidden rounded border border-gray-300 text-sm">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => router.replace(`?mode=${m}`)}
                className={`px-3 py-1.5 ${m === mode ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </>
      }
    />
  )
}
