// 기존 단어 난이도 → 새 절대 난이도 자(1~100)에 맞춘 "제안값" 계산 (3단계).
// DB 값을 바꾸지 않는다. 제안표를 만들 때만 쓰고, 적용은 향미 선생님 확인 후 따로 한다.
// AI 호출 없음. 규칙은 아래 주석이 전부다 (기계적 초안 → 선생님 판단이 우선).
// 이 파일은 다른 모듈을 런타임 import 하지 않는다.

import type { OfficialMatch, OfficialTier } from './officialVocabulary.ts'

// 단어가 어떤 묶음으로 들어왔는지 (출처 source_ref 로 판단)
export type ReanchorGroup = 'floor' | 'ceiling' | 'middle'

export interface ReanchorInput {
  current: number // 지금 base_difficulty (예전 중1 기준으로 매긴 값)
  group: ReanchorGroup
  official: Pick<OfficialMatch, 'tier' | 'via' | 'headword'> | null // 공식 기준표 대응 (없으면 null)
}

export interface ReanchorProposal {
  proposed: number
  reason: string
}

// 예전 중1 기준 → 새 자 변환 폭
//  예전 중1 범위표: 학교형 1~30 … 선행형 45~75 (전체 1~75)
//  새 자 중1 범위표: 학교형 15~35 … 선행형 38~58 (전체 15~58)
const OLD_MIDDLE = { min: 1, max: 75 }
const NEW_MIDDLE = { min: 15, max: 58 }
//  하한 기준점(예전 1~10) → 새 자 초3~4 (1~15)
const OLD_FLOOR = { min: 1, max: 10 }
const NEW_FLOOR = { min: 1, max: 15 }

// 공식 등급별 새 자에서 자연스러운 구간 (기준점 초안 기준)
//  초등 권장 → 초3~4 ~ 초5~6 (1~30) / 중·고 공통 → 중1~2 ~ 고1~2 (25~80) / 그 외 → 중3 이상 (40~100)
export const TIER_RANGES: Record<OfficialTier, { min: number; max: number }> = {
  elementary: { min: 1, max: 30 },
  common: { min: 25, max: 80 },
  elective: { min: 40, max: 100 },
}

const TIER_NAMES: Record<OfficialTier, string> = { elementary: '초등 권장', common: '중·고 공통', elective: '그 외' }

function linear(value: number, from: { min: number; max: number }, to: { min: number; max: number }): number {
  const clamped = Math.min(Math.max(value, from.min), from.max)
  return to.min + ((clamped - from.min) * (to.max - to.min)) / (from.max - from.min)
}

const clamp100 = (n: number) => Math.min(100, Math.max(1, Math.round(n)))

export function proposeReanchor({ current, group, official }: ReanchorInput): ReanchorProposal {
  const tier = official?.tier ?? null
  if (group === 'ceiling') {
    // 상한 기준점은 예전에도 "고3 최상위" 기준으로 매겼다 → 새 자의 고3·고난도(75~100)와 같은 뜻이라 유지
    const note = tier && tier !== 'elective' ? ` 공식 목록은 ${TIER_NAMES[tier]}(단어 단위)이지만 이 뜻은 고난도라 유지 — 확인 필요` : ''
    return { proposed: current, reason: `상한 기준점: 새 자에서도 고3·고난도 구간 → 유지.${note}` }
  }
  if (group === 'floor') {
    const proposed = clamp100(linear(current, OLD_FLOOR, NEW_FLOOR))
    return { proposed, reason: `하한 기준점: 예전 1~10 → 새 자 초3~4(1~15)로 옮김` }
  }

  // 중1 기능검증 단어: 예전 중1 범위(1~75)를 새 자의 중1 범위(15~58)로 옮긴 뒤, 공식 등급 구간 안으로 맞춘다
  let proposed = clamp100(linear(current, OLD_MIDDLE, NEW_MIDDLE))
  let reason = `예전 중1 기준 ${current} → 새 자 중1 범위로 옮김 ${proposed}`
  if (official && official.via === 'derivative') {
    // 파생어는 표제어와 난이도가 다를 수 있다 → 등급 구간으로 자르지 않고 참고로만 적는다
    reason += ` (공식 목록 ${official.headword}의 파생어 — 표제어 등급 ${TIER_NAMES[official.tier]}, 참고만)`
  } else if (tier) {
    const r = TIER_RANGES[tier]
    if (proposed > r.max) {
      proposed = r.max
      reason += ` → 공식 ${TIER_NAMES[tier]}이라 ${r.max} 이하로`
    } else if (proposed < r.min) {
      proposed = r.min
      reason += ` → 공식 ${TIER_NAMES[tier]}이라 ${r.min} 이상으로`
    } else {
      reason += ` (공식 ${TIER_NAMES[tier]} 구간 안)`
    }
  } else {
    reason += ' (공식 목록에 없음 — 구·숙어이거나 목록 밖 단어)'
  }
  return { proposed, reason }
}
