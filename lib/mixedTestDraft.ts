// 혼합 시험 만들기(/create/mixed) 화면의 "초안" 상태. lib/wordTestDraft.ts 와 같은 방식:
//   조건(지문·레벨·유형별 개수·단어 조건)이 바뀌면 미리보기를 비우고 seq 를 올린다.
//   뽑기 결과는 "만들 때의 조건"과 seq 를 같이 받아, 그 사이 조건이 바뀌었거나 더 새로 뽑기 시작했으면 버린다.
//
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

import type { CategoryCounts, MixedCandidate } from './mixedTest'
import type { UnifiedDifficulty } from './passageUnified'
import type { WordTestItem } from './wordTest'

export interface MixedWordConditions {
  count: number
  grade: string
  level: string // school / academy / advanced / prestudy
  direction: 'en_ko' | 'ko_en'
}

export interface MixedConditions {
  passageKey: string | null // 통합 목록 한 줄 (kind:id)
  level: UnifiedDifficulty
  counts: CategoryCounts
  word: MixedWordConditions
}

export type MixedDraftItem =
  | { source: 'passage'; candidate: MixedCandidate }
  | { source: 'word'; item: WordTestItem }

export function mixedItemKey(it: MixedDraftItem): string {
  return it.source === 'passage' ? it.candidate.key : `word:${it.item.entry.id}`
}

export interface MixedDraft {
  conditions: MixedConditions
  seq: number
  generatedFor: MixedConditions | null
  items: MixedDraftItem[]
  excluded: string[] // 이번 초안에서 빼거나 바꾼 문항 키
}

export type MixedDraftAction =
  | { type: 'setConditions'; patch: Partial<Omit<MixedConditions, 'counts' | 'word'>> & { counts?: Partial<CategoryCounts>; word?: Partial<MixedWordConditions> } }
  | { type: 'generateStart' }
  | { type: 'generateDone'; seq: number; conditions: MixedConditions; items: MixedDraftItem[] }
  | { type: 'remove'; index: number }
  | { type: 'replace'; index: number; item: MixedDraftItem }

export function initialMixedDraft(conditions: MixedConditions): MixedDraft {
  return { conditions, seq: 0, generatedFor: null, items: [], excluded: [] }
}

export function sameMixedConditions(a: MixedConditions | null, b: MixedConditions | null): boolean {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b)
}

export function mixedDraftReducer(state: MixedDraft, action: MixedDraftAction): MixedDraft {
  switch (action.type) {
    case 'setConditions': {
      const { counts, word, ...rest } = action.patch
      const next: MixedConditions = {
        ...state.conditions,
        ...rest,
        counts: { ...state.conditions.counts, ...(counts ?? {}) },
        word: { ...state.conditions.word, ...(word ?? {}) },
      }
      if (sameMixedConditions(next, state.conditions)) return state
      // 조건이 바뀌면 이전 미리보기를 확실히 지운다 (옛 기준 문항이 저장되지 않게)
      return { conditions: next, seq: state.seq + 1, generatedFor: null, items: [], excluded: [] }
    }
    case 'generateStart':
      return { ...state, seq: state.seq + 1 }
    case 'generateDone':
      if (action.seq !== state.seq || !sameMixedConditions(action.conditions, state.conditions)) return state
      return { ...state, generatedFor: action.conditions, items: action.items, excluded: [] }
    case 'remove': {
      const it = state.items[action.index]
      if (!it) return state
      return { ...state, items: state.items.filter((_, i) => i !== action.index), excluded: [...state.excluded, mixedItemKey(it)] }
    }
    case 'replace': {
      const it = state.items[action.index]
      if (!it) return state
      return {
        ...state,
        items: state.items.map((x, i) => (i === action.index ? action.item : x)),
        excluded: [...state.excluded, mixedItemKey(it)],
      }
    }
  }
}

// 미리보기가 지금 고른 조건으로 만들어진 것인지 (저장 가능 여부)
export function mixedDraftIsCurrent(state: MixedDraft): boolean {
  return state.generatedFor !== null && sameMixedConditions(state.generatedFor, state.conditions) && state.items.length > 0
}
