// 단어 수 현황 보고서 (읽기만 한다. DB 값을 바꾸지 않는다. AI 호출 없음)
//   docs/stage3-pool-status.md — 학년 × 레벨별 쓸 수 있는 단어 수 / 부족분, 공식 기준표 대조 (현재 DB 값 기준)
//   --proposal: 재조정 제안표(docs/stage3-reanchor-proposal.md / .csv)도 만든다 — 재조정 적용 "전"에만 의미가 있다
// 공식 기준표는 CSV 원본(data/vocabulary/…)으로 대조한다 (DB 기준표와 같은 파일).
//
// 실행: node scripts/stage3-report.ts [--proposal]

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  buildOfficialIndex,
  OFFICIAL_TIER_LABELS,
  OFFICIAL_TIERS,
  officialMatchLabel,
  officialMatchOf,
  parseOfficialCsv,
  type OfficialTier,
} from '../lib/officialVocabulary.ts'
import { normalizeExpressionKey } from '../lib/vocabulary.ts'
import { generalTestCandidates } from '../lib/vocabularyCalibration.ts'
import { proposeReanchor, reanchorGroupOf, type ReanchorGroup } from '../lib/vocabularyReanchor.ts'
import { isEligible, type WordTestEntry } from '../lib/wordTest.ts'
import { anchorLabels, DIFFICULTY_ANCHORS, gradesWithBands, findDifficultyBand, VOCABULARY_GRADES } from '../config/vocabularyLevels.ts'

const PROPOSAL = process.argv.includes('--proposal')
const TARGET = 40 // 4단계 목표: 학년·레벨마다 40개 이상
const LEVELS = ['school', 'academy', 'advanced', 'prestudy'] as const
const LEVEL_NAMES: Record<(typeof LEVELS)[number], string> = { school: '학교형', academy: '일반학원형', advanced: '상위학원형', prestudy: '선행형' }

type Row = WordTestEntry & {
  pos: string | null
  approval_origin: string | null
  vocabulary_sources: { source_type: string; source_ref: string }[]
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

const groupOf = (e: Row): ReanchorGroup => reanchorGroupOf(e.vocabulary_sources)
const GROUP_NAMES: Record<ReanchorGroup, string> = { floor: '하한 기준점', ceiling: '상한 기준점', middle: '중1 기초 단어' }

async function main() {
  const env = loadEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: env.SUPABASE_LOGIN_EMAIL,
    password: env.SUPABASE_LOGIN_PASSWORD,
  })
  if (loginError) throw new Error(`로그인 실패: ${loginError.message}`)

  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('*, vocabulary_sources(source_type, source_ref)')
    .is('deleted_at', null)
    .order('base_difficulty')
  if (error) throw new Error(error.message)
  const entries = data as Row[]

  const { rows: official, errors } = parseOfficialCsv(
    readFileSync(resolve(process.cwd(), 'data/vocabulary/kr-curriculum-2022-basic-vocabulary-3000.csv'), 'utf-8'),
  )
  if (errors.length) throw new Error(errors.join('\n'))
  const index = buildOfficialIndex(official)

  // ── 1) 재조정 제안표 ──
  const proposals = entries.map((e) => {
    const official = officialMatchOf(e.expression, index)
    const group = groupOf(e)
    const p = proposeReanchor({ current: e.base_difficulty ?? 0, group, official })
    return { e, official, group, ...p }
  })
  const proposedById = new Map(proposals.map((p) => [p.e.id, p.proposed]))

  const esc = (s: string) => s.replace(/\|/g, '\\|')
  const md: string[] = [
    '# 3단계: 기존 단어 난이도 재조정 제안표',
    '',
    `- 만든 날: ${new Date().toISOString().slice(0, 10)} · \`node scripts/stage3-report.ts\` (읽기 전용, DB 값 변경 없음)`,
    '- **제안일 뿐이다.** 적용은 향미 선생님 확인 후 따로 한다. 규칙: `lib/vocabularyReanchor.ts`',
    '  - 중1 기초 단어: 예전 중1 범위(1~75)를 새 자의 중1 범위(15~58)로 옮긴 뒤, 공식 등급 구간(초등 권장 1~30 / 중·고 공통 25~80 / 그 외 40~100) 안으로 맞춤',
    '  - 공식 목록 괄호 안 파생어(예: joy (enjoy))로만 잡힌 단어는 표제어 등급을 참고로 적고 구간으로 자르지 않음',
    '  - 하한 기준점: 예전 1~10 → 새 자 초3~4(1~15) / 상한 기준점: 유지(새 자에서도 고3·고난도)',
    `- 공식 등급은 ${official[0].list_version} 기준표(표제어·다른 철자·괄호 안 파생어)와 맞춘 값. 구·숙어는 기준표에 없다.`,
    '',
    '| # | 단어 | 품사 | 뜻 | 묶음 | 공식 등급 | 현재 | 제안 | 새 자 수준 | 이유 |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ]
  const csv: string[] = ['no,expression,pos,meaning_ko,group,official_tier,current,proposed,anchor,reason']
  proposals.forEach((p, i) => {
    const tierName = officialMatchLabel(p.official)
    const anchor = anchorLabels(p.proposed).join('·')
    md.push(
      `| ${i + 1} | ${esc(p.e.expression)} | ${p.e.pos ?? '-'} | ${esc(p.e.meaning_ko)} | ${GROUP_NAMES[p.group]} | ${tierName} | ${p.e.base_difficulty} | **${p.proposed}** | ${anchor} | ${esc(p.reason)} |`,
    )
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    csv.push([i + 1, q(p.e.expression), p.e.pos ?? '', q(p.e.meaning_ko), GROUP_NAMES[p.group], tierName, p.e.base_difficulty, p.proposed, anchor, q(p.reason)].join(','))
  })
  if (PROPOSAL) {
    writeFileSync(resolve(process.cwd(), 'docs/stage3-reanchor-proposal.md'), md.join('\n') + '\n')
    writeFileSync(resolve(process.cwd(), 'docs/stage3-reanchor-proposal.csv'), '﻿' + csv.join('\n') + '\n')
  }

  // ── 2) 단어 수 현황 ──
  // 사용 중 단어 (지금 시험에 나오는 것) / 확인 필요까지 모두 '사용하기' 했다고 가정한 것
  const approvedPool = generalTestCandidates(entries.filter((e) => e.status === 'approved'))
  const pool = PROPOSAL ? approvedPool.map((e) => ({ ...e, base_difficulty: proposedById.get(e.id) ?? e.base_difficulty })) : approvedPool
  const pendingCount = entries.filter((e) => e.status === 'pending').length
  const ifApproved = generalTestCandidates(entries.filter((e) => e.status === 'approved' || e.status === 'pending')).map((e) => ({
    ...e,
    status: 'approved' as const,
    base_difficulty: PROPOSAL ? proposedById.get(e.id) ?? e.base_difficulty : e.base_difficulty,
  }))
  const withProposed = ifApproved
  const count = (list: WordTestEntry[], grade: (typeof VOCABULARY_GRADES)[number], level: (typeof LEVELS)[number], dir: 'en_ko' | 'ko_en') => {
    const band = findDifficultyBand(grade, level, dir)
    return band ? list.filter((e) => isEligible(e, dir, band)).length : null
  }

  const out: string[] = [
    '# 학년 × 레벨별 단어 수 현황',
    '',
    `- 만든 날: ${new Date().toISOString().slice(0, 10)} · 읽기 전용`,
    `- "쓸 수 있는 단어" = 사용 중 + 난이도 기준점 전용 단어 제외 + 그 학년·레벨 범위 안. 일반 시험 후보 ${pool.length}개 (사용 중 ${entries.filter((e) => e.status === 'approved').length}개 중).`,
    `- "확인 필요 승인 시" = 확인 필요 ${pendingCount}개를 모두 '사용하기' 했다고 가정한 수 (일반 시험 후보 ${ifApproved.length}개).`,
    `- 목표: 학년·레벨마다 ${TARGET}개 이상 (4단계 기대값). 부족분은 "확인 필요 승인 시" 영→한 기준.`,
    PROPOSAL ? '- 난이도는 재조정 **제안값**으로 센 것.' : '- 난이도는 **현재 DB 값**으로 센 것.',
    '',
    '## 1. 학년 × 레벨 (영→한 / 한→영)',
    '',
    '| 학년 | 레벨 | 범위 | 사용 중 영→한 | 사용 중 한→영 | 확인 필요 승인 시 영→한 | 확인 필요 승인 시 한→영 | 부족분 |',
    '|---|---|---|---|---|---|---|---|',
  ]
  for (const g of VOCABULARY_GRADES) {
    if (!gradesWithBands().includes(g)) {
      out.push(`| ${g} | — | 기준 미설정 | | | | | |`)
      continue
    }
    for (const l of LEVELS) {
      const band = findDifficultyBand(g, l, 'en_ko')!
      const a = count(pool, g, l, 'en_ko')!
      const b = count(pool, g, l, 'ko_en')!
      const c = count(withProposed, g, l, 'en_ko')!
      const d = count(withProposed, g, l, 'ko_en')!
      out.push(`| ${g} | ${LEVEL_NAMES[l]} | ${band.min}~${band.max} | ${a} | ${b} | ${c} | ${d} | **${Math.max(0, TARGET - c)}** |`)
    }
  }

  // 초5 / 중3 자세히: 확인 필요 승인 시 레벨별 수 + 공식 기준표에서 채울 수 있는 후보 수
  // 기준표 한 줄(표제어)이 단어은행에 있는가: 표제어·다른 철자가 있으면 "있음", 괄호 안 파생어만 있으면 "파생어만 있음"
  const bankKeys = new Set(entries.map((e) => normalizeExpressionKey(e.expression)))
  const missingByTier: Record<OfficialTier, number> = { elementary: 0, common: 0, elective: 0 }
  const presentByTier: Record<OfficialTier, number> = { elementary: 0, common: 0, elective: 0 }
  const derivativeOnlyByTier: Record<OfficialTier, number> = { elementary: 0, common: 0, elective: 0 }
  for (const r of official) {
    const present = [r.headword, ...r.variants].some((w) => bankKeys.has(normalizeExpressionKey(w)))
    const derivativeOnly = !present && r.derivatives.some((w) => bankKeys.has(normalizeExpressionKey(w)))
    if (present) presentByTier[r.tier_code]++
    else if (derivativeOnly) derivativeOnlyByTier[r.tier_code]++
    else missingByTier[r.tier_code]++
  }

  out.push('', '## 2. 초5 · 중3 자세히 (확인 필요 승인 시)', '')
  for (const g of ['초5', '중3'] as const) {
    out.push(`### ${g}`, '')
    out.push('| 레벨 | 범위 | 쓸 수 있는 단어 (영→한) | 단어 예 | 부족분 |', '|---|---|---|---|---|')
    for (const l of LEVELS) {
      const band = findDifficultyBand(g, l, 'en_ko')!
      const list = withProposed.filter((e) => isEligible(e, 'en_ko', band)).sort((a, b) => (a.base_difficulty ?? 0) - (b.base_difficulty ?? 0))
      const sample = list.slice(0, 6).map((e) => `${e.expression}(${e.base_difficulty})`).join(', ') || '-'
      out.push(`| ${LEVEL_NAMES[l]} | ${band.min}~${band.max} | ${list.length} | ${esc(sample)} | **${Math.max(0, TARGET - list.length)}** |`)
    }
    out.push('')
  }
  out.push(
    '- 초5 보강 후보: 공식 **초등 권장** 중 단어은행에 없는 ' + `**${missingByTier.elementary}개**` + ' (4단계 1차 대상).',
    '- 중3 보강 후보: 공식 **중·고 공통** 중 단어은행에 없는 ' + `**${missingByTier.common}개**` + ' (4단계 2차 대상).',
    '- 기준표에는 뜻·난이도가 없다 → 4단계에서 뜻·품사·난이도 제안을 붙여 **확인 필요**로만 등록한다.',
    '',
  )

  // 기준점별 분포
  out.push('## 3. 새 자 기준점별 단어 수 (일반 시험 후보, 확인 필요 승인 시 / 겹치는 구간은 모두 셈)', '', '| 기준점 | 범위 | 단어 수 |', '|---|---|---|')
  for (const a of DIFFICULTY_ANCHORS) {
    out.push(`| ${a.label} | ${a.min}~${a.max} | ${withProposed.filter((e) => e.base_difficulty !== null && e.base_difficulty >= a.min && e.base_difficulty <= a.max).length} |`)
  }

  // 공식 기준표 대조
  out.push(
    '', '## 4. 공식 기준표 3,000개(표제어 기준) 중 단어은행에 있는 것 / 없는 것', '',
    '| 등급 | 기준표 | 단어은행에 있음 | 괄호 안 파생어만 있음 | 없음 |', '|---|---|---|---|---|',
  )
  for (const t of OFFICIAL_TIERS) {
    out.push(`| ${OFFICIAL_TIER_LABELS[t]} | ${presentByTier[t] + derivativeOnlyByTier[t] + missingByTier[t]} | ${presentByTier[t]} | ${derivativeOnlyByTier[t]} | ${missingByTier[t]} |`)
  }
  const sum = (r: Record<OfficialTier, number>) => OFFICIAL_TIERS.reduce((s, t) => s + r[t], 0)
  out.push(`| 합계 | ${sum(presentByTier) + sum(derivativeOnlyByTier) + sum(missingByTier)} | ${sum(presentByTier)} | ${sum(derivativeOnlyByTier)} | ${sum(missingByTier)} |`)
  const bankTier: Record<string, number> = {}
  for (const e of entries) {
    const m = officialMatchOf(e.expression, index)
    const k = !m ? '기준표에 없음' : m.via === 'derivative' ? `${OFFICIAL_TIER_LABELS[m.tier]} 파생어` : OFFICIAL_TIER_LABELS[m.tier]
    bankTier[k] = (bankTier[k] ?? 0) + 1
  }
  out.push('', `- 단어은행 ${entries.length}개(뜻 단위)를 공식 등급으로 나누면: ${Object.entries(bankTier).map(([k, v]) => `${k} ${v}`).join(' / ')}`)
  out.push('- 같은 철자의 다른 뜻(plan 명사/동사 등)은 단어은행에서 여러 줄이지만 기준표에서는 한 표제어로 센다.')
  writeFileSync(resolve(process.cwd(), 'docs/stage3-pool-status.md'), out.join('\n') + '\n')

  console.log(`제안표 ${proposals.length}개, 일반 시험 후보 ${pool.length}개`)
  console.log('공식 기준표 있음/파생어만/없음:', presentByTier, derivativeOnlyByTier, missingByTier)
  console.log('단어은행 등급:', bankTier)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
