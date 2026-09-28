// 4단계 공식 기본어휘 보강: 제작 원본(data/vocabulary/source/<묶음>-*.txt) → 200개 단위 seed JSON
//   elementary: 초등 권장 → data/vocabulary/kr-curriculum-2022-elementary-01.json …
//   common:     중·고 공통 → data/vocabulary/kr-curriculum-2022-common-01.json …
// 원본은 Claude Code 가 직접 쓴 것 (AI API 호출 없음). 여기서는 형식 검사 + 공식 기준표 대조 + JSON 변환만 한다.
// DB 에 접속하지 않는다. 저장은 add-vocabulary-seed.ts 로 ('확인 필요'로만).
//
// 실행: node scripts/build-official-seed.ts elementary | common

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OFFICIAL_LIST_VERSION, parseOfficialCsv, type OfficialTier } from '../lib/officialVocabulary.ts'
import { activeDuplicateKey, normalizeExpressionKey, normalizeMeaningKey, VOCABULARY_POS } from '../lib/vocabulary.ts'
import type { VocabularyPos } from '../types/vocabulary'

// 묶음별 설정: 등급, 난이도 구간(새 절대 자에서 그 등급이 자연스러운 구간, lib/vocabularyReanchor.ts TIER_RANGES 와 같게)
const TIERS: Record<string, { tier: OfficialTier; min: number; max: number; grade: string; label: string }> = {
  elementary: { tier: 'elementary', min: 1, max: 30, grade: '초등학교 권장(*)', label: '초등 권장' },
  common: { tier: 'common', min: 25, max: 80, grade: '중학교·고등 공통과목 권장(**)', label: '중·고 공통' },
}
const GROUP = process.argv[2]
if (!GROUP || !TIERS[GROUP]) {
  console.error('사용법: node scripts/build-official-seed.ts elementary | common')
  process.exit(1)
}
const CFG = TIERS[GROUP]
const SRC_DIR = resolve(process.cwd(), 'data/vocabulary/source')
const OUT = (n: number) => resolve(process.cwd(), `data/vocabulary/kr-curriculum-2022-${GROUP}-${String(n).padStart(2, '0')}.json`)
const CHUNK = 200
const AMBIGUOUS_RE = /(할|둘)지|낮을 수|더 흔함|중 대표 뜻/

const POS: Record<string, VocabularyPos> = {
  n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction',
  det: 'determiner', num: 'numeral', int: 'interjection', pron: 'pronoun', aux: 'auxiliary',
}

export interface BuiltEntry {
  expression: string
  lemma: string
  entry_type: 'word'
  pos: VocabularyPos
  meaning_ko: string
  accepted_meanings: string[]
  base_difficulty: number
  ko_en_allowed: boolean
  sense_note?: string
  official_no: number
  teacher_note?: string // 참고 (예: 'big 과 같은 뜻' → 한→영 불가 이유). DB 에는 넣지 않고 보고서에만
  ambiguity?: string // 제작하면서 애매했던 점 (보고서의 '애매한 단어' 목록)
}

const { rows: official } = parseOfficialCsv(readFileSync(resolve(process.cwd(), 'data/vocabulary/kr-curriculum-2022-basic-vocabulary-3000.csv'), 'utf-8'))
const elementary = new Map(official.filter((r) => r.tier_code === CFG.tier).map((r) => [normalizeExpressionKey(r.headword), r]))

const errors: string[] = []
const entries: BuiltEntry[] = []
const excluded: { word: string; reason: string }[] = []
const seenWords = new Set<string>()

for (const file of readdirSync(SRC_DIR).filter((f) => f.startsWith(`${GROUP}-`) && f.endsWith('.txt')).sort()) {
  readFileSync(resolve(SRC_DIR, file), 'utf-8').split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const where = `${file}:${i + 1}`
    if (line.startsWith('-')) {
      const [word, reason] = line.slice(1).split('|')
      if (!elementary.has(normalizeExpressionKey(word))) errors.push(`${where} 제외 단어가 공식 ${CFG.label} 표제어가 아님: ${word}`)
      excluded.push({ word, reason: reason ?? '' })
      seenWords.add(normalizeExpressionKey(word))
      return
    }
    const f = line.split('|')
    if (f.length < 6) { errors.push(`${where} 칸 수 부족`); return }
    const [word, pos, meaning, accepted, diff, koEn, note] = f
    // 8번째 칸부터: 참고 메모. 그중 판단을 묻는 것("~할지", "~가 더 흔함", "대표 뜻")은 애매한 점으로 따로 모은다
    const rest = f.slice(7).map((x) => x.trim()).filter(Boolean)
    const ambiguity = rest.filter((x) => AMBIGUOUS_RE.test(x)).join(' / ')
    const teacherNote = rest.filter((x) => !AMBIGUOUS_RE.test(x)).join(' / ')
    const off = elementary.get(normalizeExpressionKey(word))
    if (!off) errors.push(`${where} 공식 ${CFG.label} 표제어가 아님: ${word}`)
    if (!POS[pos] || !VOCABULARY_POS.includes(POS[pos])) errors.push(`${where} 품사 오류: ${pos}`)
    const d = Number(diff)
    if (!Number.isInteger(d) || d < CFG.min || d > CFG.max) errors.push(`${where} 난이도는 ${CFG.label} 구간 ${CFG.min}~${CFG.max} 정수: ${diff}`)
    if (koEn !== 'y' && koEn !== 'n') errors.push(`${where} 한→영 칸은 y/n: ${koEn}`)
    if (!meaning.trim()) errors.push(`${where} 대표 뜻 없음`)
    const acc = (accepted ?? '').split(';').map((s) => s.trim()).filter(Boolean)
    if (acc.some((a) => normalizeMeaningKey(a) === normalizeMeaningKey(meaning))) errors.push(`${where} 인정 뜻에 대표 뜻이 중복: ${word}`)
    seenWords.add(normalizeExpressionKey(word))
    entries.push({
      expression: off?.headword ?? word,
      lemma: off?.headword ?? word,
      entry_type: 'word',
      pos: POS[pos],
      meaning_ko: meaning.trim(),
      accepted_meanings: acc,
      base_difficulty: d,
      ko_en_allowed: koEn === 'y',
      ...(note?.trim() ? { sense_note: note.trim() } : {}),
      official_no: off?.list_no ?? 0,
      ...(teacherNote ? { teacher_note: teacherNote } : {}),
      ...(ambiguity ? { ambiguity } : {}),
    })
  })
}

// 같은 표현+품사+뜻 중복 금지 (DB unique 와 같은 기준)
const keys = new Set<string>()
for (const e of entries) {
  const k = activeDuplicateKey(e)
  if (keys.has(k)) errors.push(`중복 항목: ${e.expression} / ${e.pos} / ${e.meaning_ko}`)
  keys.add(k)
}
// 한→영 가능 항목끼리 같은 대표 뜻이면 정답이 둘 → 오류
const koEnMeanings = new Map<string, string>()
for (const e of entries.filter((x) => x.ko_en_allowed)) {
  const k = normalizeMeaningKey(e.meaning_ko)
  if (koEnMeanings.has(k)) errors.push(`한→영 가능인데 같은 뜻: ${koEnMeanings.get(k)} / ${e.expression} (${e.meaning_ko})`)
  koEnMeanings.set(k, e.expression)
}

// 다른 묶음(이미 만든 JSON)의 한→영 가능 항목과도 같은 뜻이면 안 된다 (단어시험에서 정답이 둘)
for (const f of readdirSync(resolve(process.cwd(), 'data/vocabulary')).filter((x) => /^kr-curriculum-2022-.+-\d\d\.json$/.test(x) && !x.startsWith(`kr-curriculum-2022-${GROUP}-`))) {
  const other = JSON.parse(readFileSync(resolve(process.cwd(), 'data/vocabulary', f), 'utf-8')) as { entries: BuiltEntry[] }
  for (const o of other.entries.filter((x) => x.ko_en_allowed)) {
    const k = normalizeMeaningKey(o.meaning_ko)
    if (koEnMeanings.has(k)) errors.push(`한→영 가능인데 ${f} 의 ${o.expression} 와 같은 뜻: ${koEnMeanings.get(k)} (${o.meaning_ko})`)
  }
}

const notCovered = [...elementary.values()].filter((r) => !seenWords.has(normalizeExpressionKey(r.headword))).map((r) => r.headword)

if (errors.length) {
  for (const e of errors) console.error(`❌ ${e}`)
  process.exit(1)
}

entries.sort((a, b) => a.official_no - b.official_no || a.pos.localeCompare(b.pos))
const files: string[] = []
for (let i = 0; i * CHUNK < entries.length; i++) {
  const chunk = entries.slice(i * CHUNK, (i + 1) * CHUNK)
  const out = {
    seed_id: `kr-curriculum-2022-${GROUP}-${String(i + 1).padStart(2, '0')}`,
    source: {
      type: 'official',
      ref: OFFICIAL_LIST_VERSION,
      official_source_name: '2022 개정 영어과 교육과정 [별표 3] 기본어휘',
      official_source_version: OFFICIAL_LIST_VERSION,
      official_grade: CFG.grade,
    },
    source_rationale: `공식 기본어휘(${CFG.label}). 뜻·품사·인정 뜻·난이도·한→영 가능 여부는 Claude Code 제작 초안(교사 확인 전), 난이도는 새 절대 자 기준.`,
    entries: chunk,
  }
  writeFileSync(OUT(i + 1), JSON.stringify(out, null, 2) + '\n')
  files.push(`${OUT(i + 1).split(/[\\/]/).pop()} (${chunk.length}개)`)
}

console.log(`항목 ${entries.length}개 → ${files.join(', ')}`)
console.log(`제외 ${excluded.length}개: ${excluded.map((x) => x.word).join(', ')}`)
console.log(`원본에 없는 공식 ${CFG.label} 표제어 ${notCovered.length}개 (단어은행에 이미 있어야 함): ${notCovered.join(', ')}`)
console.log(`애매 표시 ${entries.filter((e) => e.ambiguity).length}개, 한→영 가능 ${entries.filter((e) => e.ko_en_allowed).length}개`)
