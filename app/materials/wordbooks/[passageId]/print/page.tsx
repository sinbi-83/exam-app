'use client'

// 지문 단어장 인쇄 (A4). 쪽 나누기는 components/A4SheetPrint.tsx (외부지문 인쇄와 같은 방식).
//   ?mode=list → 단어지 (번호 / 단어 / 품사 / 뜻 / 지문 속 예문) — 지문 풀기 전 예습, 푼 뒤 복습용
//   ?mode=test → 단어 테스트지 (영→한 / 한→영 / 혼합, 순서 섞기) + 교사용 정답 장(새 쪽)
// 내용: 편집 화면이 넘겨준 것(localStorage, 저장 전 내용 포함) → 없으면 저장된 단어장 → 없으면 자동 발췌 초안.

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import A4SheetPrint, { type PrintBlock } from '@/components/A4SheetPrint'
import { copyrightNotice } from '@/config/copyright'
import { VARIANT_LABELS, type PassageVariantLevel } from '@/types/passageBank'
import type { WordbookTestDirection, WordbookWord } from '@/types/wordbook'
import { buildTestItems, shuffledOrder, splitSentenceOn, WORDBOOK_DIRECTION_LABELS } from '@/lib/wordbook'
import { wordGridRows } from '@/lib/printPagination'
import { wordbookPrintKey, type WordbookPrintPayload } from './printPayload'

type Mode = 'list' | 'test'

function Header({ data, subtitle, right, today }: { data: WordbookPrintPayload; subtitle: string; right: string; today: string }) {
  return (
    <div className="border-b-2 border-gray-800 pb-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-500">보스턴S영어 · {subtitle}</p>
          <h1 className="text-2xl font-bold text-gray-900">{data.title}</h1>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>출력일: {today}</p>
          <p>{data.level}{data.variant ? ` · ${data.variant}` : ''}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
        <div className="border-b border-gray-400 pb-1"><span className="mr-2 text-xs text-gray-400">이름:</span></div>
        <div className="border-b border-gray-400 pb-1"><span className="mr-2 text-xs text-gray-400">학년/반:</span></div>
        <div className="text-right text-xs text-gray-500">{right}</div>
      </div>
    </div>
  )
}

function Sentence({ w }: { w: WordbookWord }) {
  const parts = splitSentenceOn(w.sentence, w.surface || w.word)
  if (parts.length === 1) return <>{w.sentence}</>
  return <>{parts[0]}<b className="text-gray-900 underline decoration-gray-400 underline-offset-2">{parts[1]}</b>{parts[2]}</>
}

const LIST_GRID_WITH_SENTENCE = '7mm 34mm 9mm 38mm 1fr'
const LIST_GRID_NO_SENTENCE = '9mm 60mm 14mm 1fr'

function buildListBlocks(data: WordbookPrintPayload, opts: { showSentence: boolean; hideMeaning: boolean; today: string }): PrintBlock[] {
  const { showSentence, hideMeaning, today } = opts
  const grid = showSentence ? LIST_GRID_WITH_SENTENCE : LIST_GRID_NO_SENTENCE
  const blocks: PrintBlock[] = [
    { key: 'header', gapMm: 5, node: <Header data={data} subtitle={hideMeaning ? '단어 암기장' : '단어장'} right={`총 ${data.words.length}단어`} today={today} /> },
    {
      key: 'thead',
      gapMm: 0,
      keepWithNext: true,
      node: (
        <div className="grid gap-2 border-b border-t border-gray-700 bg-gray-50 px-1 py-1.5 text-[11px] font-semibold text-gray-600" style={{ gridTemplateColumns: grid }}>
          <span className="text-center">#</span>
          <span>단어</span>
          <span>품사</span>
          <span>뜻</span>
          {showSentence && <span>지문 속 예문</span>}
        </div>
      ),
    },
  ]
  data.words.forEach((w, i) => {
    blocks.push({
      key: `w-${i}`,
      gapMm: 0,
      node: (
        <div className="grid items-start gap-2 border-b border-gray-200 px-1 py-2" style={{ gridTemplateColumns: grid }}>
          <span className="text-center text-xs text-gray-400">{i + 1}</span>
          <span className="text-sm font-semibold text-gray-900">{w.word}</span>
          <span className="text-xs text-gray-500">{w.pos}</span>
          {hideMeaning ? <span className="mt-3 border-b border-gray-300" /> : <span className="text-sm text-gray-800">{w.meaning}</span>}
          {showSentence && <span className="text-xs leading-relaxed text-gray-600"><Sentence w={w} /></span>}
        </div>
      ),
    })
  })
  blocks.push({
    key: 'end',
    gapMm: 0,
    node: <div className="mt-4 border-t border-gray-200 pt-3 text-center text-[10px] text-gray-400">보스턴S영어 | 담당교사: 서향미 선생님</div>,
  })
  return blocks
}

function buildTestBlocks(
  data: WordbookPrintPayload,
  opts: { direction: WordbookTestDirection; order: number[] | null; showAnswers: boolean; today: string },
): PrintBlock[] {
  const { direction, order, showAnswers, today } = opts
  const items = buildTestItems(data.words, direction, order)
  const numbered = items.map((it, i) => ({ ...it, num: i + 1 }))
  const blocks: PrintBlock[] = [
    {
      key: 'header',
      gapMm: 3,
      node: <Header data={data} subtitle={`단어 테스트 (${WORDBOOK_DIRECTION_LABELS[direction]})`} right={`점수: ______ / ${items.length}`} today={today} />,
    },
    {
      key: 'guide',
      gapMm: 4,
      node: <p className="text-xs text-gray-500">※ 영어 단어는 우리말 뜻을, 우리말 뜻은 영어 단어를 쓰세요.</p>,
    },
  ]
  wordGridRows(numbered, 2).forEach((row, r) => {
    blocks.push({
      key: `t-${r}`,
      gapMm: 0,
      node: (
        <div className="grid grid-cols-2 gap-x-8">
          {row.map((it) => (
            <div key={it.num} className="flex items-end gap-2 py-2.5">
              <span className="w-6 shrink-0 text-right text-xs font-medium text-gray-400">{it.num}.</span>
              <span className={`shrink-0 text-sm ${it.showEn ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>{it.prompt}</span>
              <span className="mb-1 flex-1 border-b border-gray-400" />
            </div>
          ))}
        </div>
      ),
    })
  })
  blocks.push({
    key: 'end',
    gapMm: 0,
    node: <div className="mt-4 border-t border-gray-200 pt-3 text-center text-[10px] text-gray-400">보스턴S영어 | 담당교사: 서향미 선생님</div>,
  })
  if (showAnswers) {
    blocks.push({
      key: 'answers-title',
      gapMm: 3,
      keepWithNext: true,
      breakBefore: true,
      node: <p className="text-xs font-semibold text-gray-400">— 정답 ({data.title} 단어 테스트 · 교사용 / 출력 후 제거) —</p>,
    })
    wordGridRows(numbered, 3).forEach((row, r) => {
      blocks.push({
        key: `a-${r}`,
        gapMm: 0,
        node: (
          <div className="grid grid-cols-3 gap-x-4 border-b border-gray-100 py-1.5 text-xs text-gray-700">
            {row.map((it) => (
              <div key={it.num}>
                <span className="font-medium text-gray-400">{it.num}.</span> {it.prompt} → <b>{it.answer || '(뜻 미입력)'}</b>
              </div>
            ))}
          </div>
        ),
      })
    })
  }
  return blocks
}

function PrintContent() {
  const { passageId } = useParams<{ passageId: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const mode: Mode = search.get('mode') === 'test' ? 'test' : 'list'

  const [data, setData] = useState<WordbookPrintPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 단어지 옵션
  const [showSentence, setShowSentence] = useState(true)
  const [hideMeaning, setHideMeaning] = useState(false)
  // 테스트지 옵션 (정답은 기본으로 끈다 — 그냥 인쇄하면 문제만)
  const [direction, setDirection] = useState<WordbookTestDirection>('en_ko')
  const [shuffle, setShuffle] = useState(true)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [showAnswers, setShowAnswers] = useState(false)

  useEffect(() => {
    let fromEditor: WordbookPrintPayload | null = null
    try {
      const raw = localStorage.getItem(wordbookPrintKey(passageId))
      if (raw) fromEditor = JSON.parse(raw)
    } catch { /* 저장된 내용을 서버에서 읽는다 */ }
    if (fromEditor && Array.isArray(fromEditor.words)) {
      setData(fromEditor)
      setLoading(false)
      return
    }
    fetch(`/api/wordbooks/${passageId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setError(json.error); return }
        const d = json.data
        const variant = d.passage.variant_level ? VARIANT_LABELS[d.passage.variant_level as PassageVariantLevel] : null
        setData({ title: d.passage.title, level: d.passage.level, variant, words: d.saved ? d.saved.words : d.draft })
      })
      .catch(() => setError('단어장을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [passageId])

  const today = useMemo(() => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), [])
  const blocks = useMemo(() => {
    if (!data) return []
    if (mode === 'list') return buildListBlocks(data, { showSentence, hideMeaning, today })
    const order = shuffle ? shuffledOrder(data.words.length, seed) : null
    return buildTestBlocks(data, { direction, order, showAnswers, today })
  }, [data, mode, showSentence, hideMeaning, direction, shuffle, seed, showAnswers, today])

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>
  if (!data) return <div className="py-20 text-center text-sm text-red-500">{error || '단어장을 찾을 수 없습니다.'}</div>
  if (data.words.length === 0) return <div className="py-20 text-center text-sm text-gray-400">단어가 없습니다. 단어장 화면에서 단어를 넣어 주세요.</div>

  const switchMode = (m: Mode) => router.replace(`/materials/wordbooks/${passageId}/print?mode=${m}`)

  return (
    <A4SheetPrint
      blocks={blocks}
      fileName={`${data.title} ${mode === 'list' ? '단어장' : '단어 테스트'}`}
      footerText={copyrightNotice('exam')}
      padTopMm={20} // 외부지문 인쇄와 같은 위 2cm
      controls={
        <>
          <div className="flex overflow-hidden rounded border border-gray-300 text-sm">
            <button onClick={() => switchMode('list')} className={`px-3 py-1 ${mode === 'list' ? 'bg-green-600 text-white' : 'text-gray-600'}`}>단어지</button>
            <button onClick={() => switchMode('test')} className={`px-3 py-1 ${mode === 'test' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>테스트지</button>
          </div>
          {mode === 'list' ? (
            <>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="checkbox" checked={showSentence} onChange={(e) => setShowSentence(e.target.checked)} />
                예문 포함
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="checkbox" checked={hideMeaning} onChange={(e) => setHideMeaning(e.target.checked)} />
                뜻 칸 비우기 (암기 확인용)
              </label>
            </>
          ) : (
            <>
              <select value={direction} onChange={(e) => setDirection(e.target.value as WordbookTestDirection)} className="rounded border border-gray-300 px-2 py-1 text-sm">
                {(Object.keys(WORDBOOK_DIRECTION_LABELS) as WordbookTestDirection[]).map((d) => (
                  <option key={d} value={d}>{WORDBOOK_DIRECTION_LABELS[d]}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
                순서 섞기
              </label>
              {shuffle && (
                <button onClick={() => setSeed(Math.floor(Math.random() * 1e9))} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50">
                  🔀 다시 섞기
                </button>
              )}
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
                정답지 포함
              </label>
            </>
          )}
        </>
      }
    />
  )
}

export default function WordbookPrintPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-gray-400">로딩 중…</div>}>
      <PrintContent />
    </Suspense>
  )
}
