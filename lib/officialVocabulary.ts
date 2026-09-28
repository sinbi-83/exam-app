// 공식 기본어휘 기준표 (2022 개정 영어과 교육과정 [별표 3], 3,000개) — CSV 읽기와 단어은행 대조.
// 기준표는 단어은행 항목이 아니다 (뜻·난이도 없음). 여기 값을 Claude 기억이나 출판사 목록으로 보태지 않는다.
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱, scripts/, 테스트에서 그대로 쓰기 위해).

import { normalizeExpressionKey } from './vocabulary.ts'

export const OFFICIAL_LIST_VERSION = 'kr-curriculum-2022'

export type OfficialTier = 'elementary' | 'common' | 'elective'

export const OFFICIAL_TIERS: readonly OfficialTier[] = ['elementary', 'common', 'elective']

export const OFFICIAL_TIER_LABELS: Record<OfficialTier, string> = {
  elementary: '초등 권장(*)',
  common: '중·고 공통(**)',
  elective: '그 외',
}

// 원본에서 확인한 등급별 개수 — 가져온 뒤 이 값과 다르면 실패로 본다
export const OFFICIAL_TIER_EXPECTED: Record<OfficialTier, number> = { elementary: 800, common: 1200, elective: 1000 }

export interface OfficialVocabularyRow {
  list_version: string
  list_no: number
  headword: string
  variants: string[]
  derivatives: string[]
  tier_code: OfficialTier
  tier_mark: string
  tier_label: string
  source_raw: string
}

// 따옴표 안의 쉼표·줄바꿈을 처리하는 작은 CSV 파서 (BOM 제거)
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  return rows.filter((r) => r.some((f) => f !== ''))
}

const EXPECTED_HEADER = ['no', 'headword', 'variants', 'derivatives', 'official_tier_mark', 'official_tier_code', 'official_tier_label', 'source_version', 'source_raw']

// 여러 값 칸: '/' 또는 ';' 로 나뉜 값 (비어 있으면 [])
function splitList(value: string): string[] {
  return value.split(/[\/;]/).map((v) => v.trim()).filter(Boolean)
}

// CSV → 기준표 행. 형식이 맞지 않으면 오류 문장 목록을 돌려준다 (행은 하나도 돌려주지 않는다).
export function parseOfficialCsv(text: string): { rows: OfficialVocabularyRow[]; errors: string[] } {
  const table = parseCsv(text)
  const errors: string[] = []
  const header = table[0] ?? []
  if (header.join(',') !== EXPECTED_HEADER.join(',')) {
    return { rows: [], errors: [`머리글이 다릅니다: ${header.join(',')}`] }
  }
  const rows: OfficialVocabularyRow[] = []
  table.slice(1).forEach((f, i) => {
    const line = i + 2
    if (f.length !== EXPECTED_HEADER.length) { errors.push(`${line}번째 줄: 칸 수 ${f.length}`); return }
    const [no, headword, variants, derivatives, mark, code, label, version, raw] = f
    if (!/^\d+$/.test(no)) errors.push(`${line}번째 줄: 번호가 숫자가 아님 (${no})`)
    if (!headword.trim()) errors.push(`${line}번째 줄: 표제어 없음`)
    if (!(OFFICIAL_TIERS as readonly string[]).includes(code)) errors.push(`${line}번째 줄: 등급 코드 ${code}`)
    if (version !== OFFICIAL_LIST_VERSION) errors.push(`${line}번째 줄: 버전 ${version}`)
    rows.push({
      list_version: version,
      list_no: Number(no),
      headword: headword.trim(),
      variants: splitList(variants),
      derivatives: splitList(derivatives),
      tier_code: code as OfficialTier,
      tier_mark: mark,
      tier_label: label,
      source_raw: raw,
    })
  })
  const keys = new Set<string>()
  for (const r of rows) {
    const k = normalizeExpressionKey(r.headword)
    if (keys.has(k)) errors.push(`표제어 중복: ${r.headword}`)
    keys.add(k)
  }
  return errors.length > 0 ? { rows: [], errors } : { rows, errors }
}

export function tierCounts(rows: { tier_code: OfficialTier }[]): Record<OfficialTier, number> {
  const out: Record<OfficialTier, number> = { elementary: 0, common: 0, elective: 0 }
  for (const r of rows) out[r.tier_code]++
  return out
}

// 단어은행 표현 → 공식 기준표 대응 찾기용 색인.
//  - headword / variant: 표제어·다른 철자 → 그 등급이 이 단어의 등급
//  - derivative: 원본 괄호 안 파생어 (예: joy (enjoy), take (mistake)) → 표제어의 등급을 "참고"로만 쓴다
//    (파생어는 표제어와 난이도가 다를 수 있다). 표제어·다른 철자로 잡히면 파생어보다 우선한다.
// 구(phrase)는 기준표에 없으므로 대응되지 않는다.
export type OfficialMatchVia = 'headword' | 'variant' | 'derivative'

export interface OfficialMatch {
  tier: OfficialTier
  via: OfficialMatchVia
  headword: string
}

export function buildOfficialIndex(
  rows: Pick<OfficialVocabularyRow, 'headword' | 'variants' | 'derivatives' | 'tier_code'>[],
): Map<string, OfficialMatch> {
  const index = new Map<string, OfficialMatch>()
  const put = (word: string, match: OfficialMatch) => {
    const k = normalizeExpressionKey(word)
    const prev = index.get(k)
    if (!prev || (prev.via === 'derivative' && match.via !== 'derivative')) index.set(k, match)
  }
  for (const r of rows) {
    put(r.headword, { tier: r.tier_code, via: 'headword', headword: r.headword })
    for (const v of r.variants) put(v, { tier: r.tier_code, via: 'variant', headword: r.headword })
    for (const d of r.derivatives) put(d, { tier: r.tier_code, via: 'derivative', headword: r.headword })
  }
  return index
}

export function officialMatchOf(expression: string, index: Map<string, OfficialMatch>): OfficialMatch | null {
  return index.get(normalizeExpressionKey(expression)) ?? null
}

// 화면·보고서 표시: "중·고 공통(**)" / "중·고 공통(**) · joy 의 파생어"
export function officialMatchLabel(match: OfficialMatch | null): string {
  if (!match) return '-'
  return match.via === 'derivative' ? `${OFFICIAL_TIER_LABELS[match.tier]} · ${match.headword}의 파생어` : OFFICIAL_TIER_LABELS[match.tier]
}
