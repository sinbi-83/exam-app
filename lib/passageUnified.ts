// 6단계 B: AI 지문(question_sets)과 외부지문(passages)을 "한 목록에서 함께 보여주기" 위한 변환 규칙.
// 두 표는 합치지 않는다 (저장 구조·문항 ID·삭제 방식이 다르다 → docs/stage6b-passage-unification.md).
// 여기서는 화면에 보여줄 값만 한 가지 표기로 맞춘다: 학년(중1), 난이도(통합 1~4단계).
//
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

export type PassageKind = 'ai' | 'external'

export const PASSAGE_KIND_LABELS: Record<PassageKind, string> = { ai: 'AI', external: '외부' }

// ── 학년: "중학교 1학년" / "중1" / "중등 1학년" / "고1" → "중1" ──
const STAGE_PREFIX: [RegExp, string][] = [
  [/^초(등학교|등)?$/, '초'],
  [/^중(학교|등)?$/, '중'],
  [/^고(등학교|등)?$/, '고'],
]
const MAX_YEAR: Record<string, number> = { 초: 6, 중: 3, 고: 3 }

// 알아볼 수 없으면 null (화면에는 원래 글자를 그대로 보여준다)
export function normalizeGrade(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.replace(/\s+/g, '').match(/^(초등학교|초등|초|중학교|중등|중|고등학교|고등|고)(\d)(학년)?$/)
  if (!m) return null
  const stage = STAGE_PREFIX.find(([re]) => re.test(m[1]))?.[1]
  const year = Number(m[2])
  if (!stage || year < 1 || year > MAX_YEAR[stage]) return null
  return `${stage}${year}`
}

// 학년 정렬 순서 (초1 … 고3)
export const UNIFIED_GRADE_ORDER = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3'] as const
export function gradeSortKey(grade: string | null): number {
  const i = grade ? (UNIFIED_GRADE_ORDER as readonly string[]).indexOf(grade) : -1
  return i < 0 ? 99 : i
}

// ── 난이도: 통합 눈금 1~4 ──
// 1 기초 / 2 표준 / 3 심화 / 4 선행
//   외부지문 4단계: 학교형 → 1, 일반학원형 → 2, 상위학원형 → 3, 선행형 → 4
//   AI 문항 난이도(1~5 척도 숫자 2~4): beginner(2) → 1, intermediate(3) → 2, advanced(4) → 3  (AI 에는 선행 단계가 없다)
//   AI 세트는 문항별 난이도가 섞여 있으므로, 가장 많은 난이도를 세트 난이도로 본다 (같은 수면 높은 쪽).
export type UnifiedDifficulty = 1 | 2 | 3 | 4

export const UNIFIED_DIFFICULTY_LABELS: Record<UnifiedDifficulty, string> = { 1: '기초', 2: '표준', 3: '심화', 4: '선행' }

export const EXTERNAL_LEVEL_TO_UNIFIED: Record<string, UnifiedDifficulty> = { school: 1, academy: 2, advanced: 3, prestudy: 4 }

// AI 문항 난이도: 문자열(beginner…) 또는 questions 표의 숫자(2~4) 모두 받는다
const AI_DIFFICULTY_TO_UNIFIED: Record<string, UnifiedDifficulty> = {
  beginner: 1, intermediate: 2, advanced: 3,
  '2': 1, '3': 2, '4': 3,
}

export function externalDifficulty(variantLevel: string | null | undefined): UnifiedDifficulty | null {
  return (variantLevel && EXTERNAL_LEVEL_TO_UNIFIED[variantLevel]) || null
}

export function aiItemDifficulty(value: string | number | null | undefined): UnifiedDifficulty | null {
  if (value === null || value === undefined) return null
  return AI_DIFFICULTY_TO_UNIFIED[String(value)] ?? null
}

// AI 세트 난이도: 문항 난이도 중 가장 많은 것 (같은 수면 높은 쪽). 문항이 없으면 null
export function aiSetDifficulty(itemDifficulties: (string | number | null | undefined)[]): UnifiedDifficulty | null {
  const counts = new Map<UnifiedDifficulty, number>()
  for (const v of itemDifficulties) {
    const d = aiItemDifficulty(v)
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  let best: UnifiedDifficulty | null = null
  let bestCount = 0
  for (const [d, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== null && d > best)) {
      best = d
      bestCount = c
    }
  }
  return best
}

// ── 통합 목록 한 줄 ──
export interface UnifiedPassageRow {
  kind: PassageKind
  id: string
  title: string
  grade: string | null // 통합 표기 (중1). 알아볼 수 없으면 null
  gradeRaw: string | null // 원래 저장된 학년 글자
  difficulty: UnifiedDifficulty | null
  difficultyRaw: string | null // 원래 체계의 이름 (상위학원형 / 대부분 intermediate …)
  questionCount: number
  archived: boolean // 외부지문 보관 여부 (AI 는 보관 기능이 없어 항상 false)
  createdAt: string
  href: string // 원래 화면 (보기·수정·삭제·보관은 여기서)
}

type AiItem = { difficulty?: string | number | null; level?: string | null }
export interface AiSetLike {
  id: string
  grade: string | null
  topic: string | null
  created_at: string
  questions?: AiItem[] | null
  summary_questions?: AiItem[] | null
  reading_questions?: AiItem[] | null
  essay_questions?: AiItem[] | null
}

export interface ExternalPassageLike {
  id: string
  title: string | null
  level: string | null
  variant_level: string | null
  archived: boolean | null
  group_archived?: boolean | null
  created_at: string
  question_count: number
  essay_count: number
}

const AI_RAW_LABEL: Record<UnifiedDifficulty, string> = { 1: 'beginner', 2: 'intermediate', 3: 'advanced', 4: '-' }
const VARIANT_RAW_LABEL: Record<string, string> = { school: '학교형', academy: '일반학원형', advanced: '상위학원형', prestudy: '선행형' }

export function aiSetToRow(s: AiSetLike): UnifiedPassageRow {
  const lists = [s.questions, s.summary_questions, s.reading_questions, s.essay_questions].map((l) => (Array.isArray(l) ? l : []))
  const all = lists.flat()
  const difficulty = aiSetDifficulty(all.map((q) => q.difficulty ?? q.level))
  return {
    kind: 'ai',
    id: s.id,
    title: s.topic || '(제목 없음)',
    grade: normalizeGrade(s.grade),
    gradeRaw: s.grade,
    difficulty,
    difficultyRaw: difficulty ? `문항 대부분 ${AI_RAW_LABEL[difficulty]}` : null,
    questionCount: all.length,
    archived: false,
    createdAt: s.created_at,
    href: `/materials/questions/${s.id}`,
  }
}

export function externalToRow(p: ExternalPassageLike): UnifiedPassageRow {
  return {
    kind: 'external',
    id: p.id,
    title: p.title || '(제목 없음)',
    grade: normalizeGrade(p.level),
    gradeRaw: p.level,
    difficulty: externalDifficulty(p.variant_level),
    difficultyRaw: p.variant_level ? VARIANT_RAW_LABEL[p.variant_level] ?? p.variant_level : null,
    questionCount: p.question_count + p.essay_count,
    // 그룹 소속 지문은 그룹의 보관 여부를 따른다 (외부지문 목록 화면과 같은 규칙)
    archived: p.group_archived ?? !!p.archived,
    createdAt: p.created_at,
    href: `/materials/passages/external/${p.id}`,
  }
}

export interface UnifiedFilter {
  kind: PassageKind | 'all'
  grade: string | 'all' | 'unknown'
  difficulty: UnifiedDifficulty | 'all' | 'unknown'
  includeArchived: boolean
}

export function filterUnifiedRows(rows: readonly UnifiedPassageRow[], f: UnifiedFilter): UnifiedPassageRow[] {
  return rows.filter(
    (r) =>
      (f.kind === 'all' || r.kind === f.kind) &&
      (f.grade === 'all' || (f.grade === 'unknown' ? r.grade === null : r.grade === f.grade)) &&
      (f.difficulty === 'all' || (f.difficulty === 'unknown' ? r.difficulty === null : r.difficulty === f.difficulty)) &&
      (f.includeArchived || !r.archived),
  )
}

// 최근 만든 것부터
export function sortUnifiedRows(rows: readonly UnifiedPassageRow[]): UnifiedPassageRow[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}
