// 단어시험 만들기(/vocab-test) 화면의 "초안" 상태.
//
// 2026-09-28 버그: 학년·레벨·방향을 바꿔도 이전 기준의 시험이 저장됨.
//   1) 조건을 바꿔도 이전 미리보기(문항)가 그대로 남아 "시험 저장"을 누르면 옛 기준 문항이 저장됐다.
//   2) 시험 제목이 첫 생성 때 "중3 일반학원형 …"으로 채워진 뒤 고정 → 선행형으로 다시 만들어도 옛 제목으로 저장됐다.
//   3) 단어를 불러오는 동안 조건을 바꾸면, 늦게 도착한 옛 조건의 결과가 새 조건 화면에 그대로 표시됐다.
// → 조건이 바뀌면 초안을 비우고(seq 증가), 결과는 "만들 때의 조건"과 함께 보관하며,
//   늦게 도착한 결과(seq 가 다름)는 버린다. 제목 기본값은 항상 "만들 때의 조건"에서 계산한다.
//
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

import type { WordTestItem, WordTestMode } from './wordTest'

export interface WordTestConditions {
  grade: string
  level: string
  mode: WordTestMode
}

export interface WordTestDraft {
  conditions: WordTestConditions // 지금 화면에서 고른 조건
  seq: number // 조건이 바뀌거나 새로 만들 때마다 1씩 증가. 늦게 도착한 결과를 버리는 데 쓴다
  generatedFor: WordTestConditions | null // 지금 미리보기 문항을 만든 조건 (없으면 미리보기 없음)
  items: WordTestItem[]
  excluded: string[] // 이번 초안에서 빼거나 바꾼 단어 id
}

export type WordTestDraftAction =
  | { type: 'setConditions'; patch: Partial<WordTestConditions> }
  | { type: 'generateStart' } // 새로 만들기 시작 (seq 증가, 기존 미리보기는 그대로 둔다)
  | { type: 'generateDone'; seq: number; conditions: WordTestConditions; items: WordTestItem[] }
  | { type: 'remove'; index: number }
  | { type: 'replace'; index: number; item: WordTestItem }

export function initialWordTestDraft(conditions: WordTestConditions): WordTestDraft {
  return { conditions, seq: 0, generatedFor: null, items: [], excluded: [] }
}

export function sameConditions(a: WordTestConditions | null, b: WordTestConditions | null): boolean {
  return !!a && !!b && a.grade === b.grade && a.level === b.level && a.mode === b.mode
}

export function wordTestDraftReducer(state: WordTestDraft, action: WordTestDraftAction): WordTestDraft {
  switch (action.type) {
    case 'setConditions': {
      const next = { ...state.conditions, ...action.patch }
      if (sameConditions(next, state.conditions)) return state
      // 조건이 바뀌면 이전 미리보기를 확실히 지운다 (옛 기준 문항이 저장되지 않게)
      return { conditions: next, seq: state.seq + 1, generatedFor: null, items: [], excluded: [] }
    }
    case 'generateStart':
      return { ...state, seq: state.seq + 1 }
    case 'generateDone':
      // 그 사이 조건이 바뀌었거나 더 새로 만들기가 시작됐으면 이 결과는 버린다
      if (action.seq !== state.seq || !sameConditions(action.conditions, state.conditions)) return state
      return { ...state, generatedFor: action.conditions, items: action.items, excluded: [] }
    case 'remove': {
      const it = state.items[action.index]
      if (!it) return state
      return {
        ...state,
        items: state.items.filter((_, i) => i !== action.index),
        excluded: [...state.excluded, it.entry.id],
      }
    }
    case 'replace': {
      const it = state.items[action.index]
      if (!it) return state
      return {
        ...state,
        items: state.items.map((x, i) => (i === action.index ? action.item : x)),
        excluded: [...state.excluded, it.entry.id],
      }
    }
  }
}

// 미리보기가 지금 고른 조건으로 만들어진 것인지 (저장 가능 여부)
export function draftIsCurrent(state: WordTestDraft): boolean {
  return state.generatedFor !== null && sameConditions(state.generatedFor, state.conditions)
}
