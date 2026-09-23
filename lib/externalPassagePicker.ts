// 시험출제(/exams/[id]) 화면의 "외부지문저장소" 탭에서 지문 목록을 그룹 단위로 묶어주는 화면 전용 유틸리티.
// /external-passages 목록 페이지와 같은 개념(group_id로 묶기, 난이도 순서 고정, 20문제+5서술형이면 완성)을 쓴다.
// DB 값이나 문제 변환 로직(lib/externalPassageExam.ts)에는 영향이 없다.

import type { PassageSummary, PassageVariantLevel } from '@/types/passageBank'

export const VARIANT_ORDER: PassageVariantLevel[] = ['school', 'academy', 'advanced', 'prestudy']
const FULL_QUESTIONS = 20
const FULL_ESSAYS = 5

export function isPassageComplete(item: Pick<PassageSummary, 'question_count' | 'essay_count'>): boolean {
  return item.question_count === FULL_QUESTIONS && item.essay_count === FULL_ESSAYS
}

export type PickerRow =
  | { kind: 'single'; key: string; item: PassageSummary }
  | {
      kind: 'group'
      key: string
      groupId: string
      // 같은 그룹의 모든 난이도 지문 (검색에 일부만 걸려도 그룹 전체를 보여준다 — 부모 그룹 맥락 유지)
      items: PassageSummary[]
      // 검색어에 실제로 걸린 난이도 지문 id (검색어가 없으면 전체)
      matchedIds: string[]
    }

export interface PickerFilter {
  search: string
  level: string // 'all' 이면 전체 학년
}

function matchesSearch(item: PassageSummary, q: string): boolean {
  if (!q) return true
  const tagWords = [...(item.tags?.vocab ?? []), ...(item.tags?.grammar ?? []), ...(item.tags?.topic ?? [])].join(' ')
  return `${item.title} ${item.topic} ${tagWords}`.toLowerCase().includes(q)
}

// items 는 API가 내려준 순서(최근 생성순)를 그대로 따른다. 그룹은 처음 등장한 위치에 한 줄로 놓인다.
export function buildPickerRows(items: PassageSummary[], filter: PickerFilter): PickerRow[] {
  const q = filter.search.trim().toLowerCase()
  const passes = (item: PassageSummary) =>
    (filter.level === 'all' || item.level === filter.level) && matchesSearch(item, q)

  const groupMembers = new Map<string, PassageSummary[]>()
  for (const item of items) {
    if (!item.group_id) continue
    const list = groupMembers.get(item.group_id) ?? []
    list.push(item)
    groupMembers.set(item.group_id, list)
  }

  const rows: PickerRow[] = []
  const seenGroups = new Set<string>()
  for (const item of items) {
    if (!item.group_id) {
      if (passes(item)) rows.push({ kind: 'single', key: item.id, item })
      continue
    }
    if (seenGroups.has(item.group_id)) continue
    seenGroups.add(item.group_id)
    const members = [...(groupMembers.get(item.group_id) ?? [])].sort(
      (a, b) =>
        VARIANT_ORDER.indexOf(a.variant_level as PassageVariantLevel) -
        VARIANT_ORDER.indexOf(b.variant_level as PassageVariantLevel),
    )
    const matched = members.filter(passes)
    if (matched.length === 0) continue
    rows.push({
      kind: 'group',
      key: `group:${item.group_id}`,
      groupId: item.group_id,
      items: members,
      matchedIds: matched.map((m) => m.id),
    })
  }
  return rows
}

// 학년 필터 선택지. 초 → 중 → 고 순서, 같은 학교급 안에서는 숫자 순서.
export function pickerLevelOptions(items: PassageSummary[]): string[] {
  const stageRank = (lv: string) => (lv.startsWith('초') ? 0 : lv.startsWith('중') ? 1 : lv.startsWith('고') ? 2 : 3)
  const set = new Set(items.map((i) => i.level).filter(Boolean))
  return Array.from(set).sort((a, b) => stageRank(a) - stageRank(b) || a.localeCompare(b))
}
