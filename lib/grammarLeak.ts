// 어법(문법) 문제 정답 노출 검사 + 새 어법 문항 형식 (docs/grammar-leak-audit.md).
//
// 문제: 예전 AI 어법 객관식은 지문 속 "올바른 표현"(= 정답)에 밑줄을 긋고
//   `밑줄 친 "정답"의 쓰임이 어법상 가장 적절한 것은?` 으로 물었다 → 문제 문장에 정답이 그대로 드러난다.
// 허용 형식 (2026-09-29 부터 AI 생성은 이 두 가지만):
//   (가) blank      : 문장 속 빈칸에 알맞은 형태 고르기 — 문장은 빈칸으로, 보기 5개 중 정답 1개
//   (나) find_error : 밑줄 친 ①~⑤ 5곳 중 어법상 틀린 것 고르기 — 지문에 없는 새 문장, 틀린 곳 정확히 1곳
// 정답을 문제 문장에 그대로 쓰거나, 정답만 밑줄·괄호로 표시하는 형식은 금지.
//
// 이 파일은 다른 모듈을 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

export type GrammarLeakReason =
  | 'target_is_answer' // 밑줄(따옴표) 친 대상이 곧 정답
  | 'answer_marked' // 정답만 괄호·밑줄·강조 표시로 드러남
  | 'answer_in_stem' // 정답이 문제 문장에 그대로 적혀 있음
  | 'essay_already_correct' // 고쳐 쓰기 문장에 틀린 곳이 없음 (문장 = 모범답안)
  | 'essay_fix_revealed' // 지시문이 고칠 답(고친 표현)을 알려 줌
  | 'choices_broken' // 보기 오류 (정답이 보기에 없음 · 보기 중복 · 보기 부족)

export const GRAMMAR_LEAK_LABELS: Record<GrammarLeakReason, string> = {
  target_is_answer: '밑줄 친 대상이 곧 정답',
  answer_marked: '정답만 괄호·밑줄로 표시',
  answer_in_stem: '정답이 문제 문장에 그대로',
  essay_already_correct: '고쳐 쓸 문장에 틀린 곳이 없음 (문장 = 모범답안)',
  essay_fix_revealed: '지시문이 고친 답을 알려 줌',
  choices_broken: '보기 오류 (정답 없음·중복·부족)',
}

// 검사 대상: 어법 객관식 + 서술형 어법고쳐쓰기 (questions.question_type 원래 값, 또는 시험 snapshot 의 type)
export const GRAMMAR_QUESTION_TYPES = ['grammar', 'essay_어법고쳐쓰기', '어법고쳐쓰기'] as const
export function isGrammarQuestionType(t: string | null | undefined): boolean {
  return !!t && (GRAMMAR_QUESTION_TYPES as readonly string[]).includes(t)
}

export interface GrammarQuestionLike {
  question_type: string // grammar | essay_어법고쳐쓰기 | 어법고쳐쓰기
  question_text: string
  choices?: string[] | null
  correct_answer?: string | null
}

const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
const normSentence = (s: string) => norm(s).replace(/[.!?]+$/, '')
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 큰따옴표 안 글자들
export function quotedParts(text: string): string[] {
  return [...text.replace(/[“”]/g, '"').matchAll(/"([^"]+)"/g)].map((m) => m[1])
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const p = norm(phrase)
  if (!p) return false
  // 영어 단어 경계 (her ≠ there)
  return new RegExp(`(^|[^a-z0-9])${escapeRe(p)}($|[^a-z0-9])`).test(norm(haystack))
}

// 새 형식 표시: (가) 빈칸 / (나) ①~⑤ 밑줄
export const GRAMMAR_BLANK = '_____'
export function isBlankFormat(stem: string): boolean {
  return /_{3,}/.test(stem) && /빈칸/.test(stem)
}
export function isFindErrorFormat(stem: string): boolean {
  return /①/.test(stem) && /⑤/.test(stem) && /틀린/.test(stem)
}

export function detectGrammarLeak(q: GrammarQuestionLike): GrammarLeakReason[] {
  const reasons = new Set<GrammarLeakReason>()
  const text = q.question_text ?? ''
  const answer = (q.correct_answer ?? '').trim()

  if (q.question_type === 'grammar') {
    const choices = Array.isArray(q.choices) ? q.choices : []
    const findError = isFindErrorFormat(text)
    if (choices.length < 5 || new Set(choices.map(norm)).size !== choices.length || !choices.some((c) => norm(c) === norm(answer))) {
      reasons.add('choices_broken')
    }
    if (!findError && answer) {
      // 예전 형식: 밑줄 친 "X" 의 X 가 정답
      if (quotedParts(text).some((p) => norm(p) === norm(answer))) reasons.add('target_is_answer')
      // 정답만 괄호·밑줄·강조
      const a = escapeRe(answer)
      if (new RegExp(`(\\(\\s*${a}\\s*\\)|\\[\\s*${a}\\s*\\]|<u>\\s*${a}\\s*</u>|\\*\\*\\s*${a}\\s*\\*\\*|'\\s*${a}\\s*')`, 'i').test(text)) reasons.add('answer_marked')
      // 정답이 문제 문장에 그대로 (빈칸 형식인데 정답이 그대로 쓰여 있는 경우 등)
      if (!reasons.has('target_is_answer') && containsPhrase(text, answer)) reasons.add('answer_in_stem')
    }
  } else if (isGrammarQuestionType(q.question_type)) {
    // 서술형 어법고쳐쓰기: 문장(큰따옴표) 안에 틀린 곳이 있어야 하고, 지시문이 고친 답을 알려 주면 안 된다
    const sentences = quotedParts(text)
    const model = answer
    if (model && sentences.some((s) => normSentence(s) === normSentence(model))) reasons.add('essay_already_correct')
    // 따옴표 밖 지시문의 '작은따옴표' 조각이 모범답안에만 있고 틀린 문장에는 없으면 → 고친 답을 알려 준 것
    const outside = text.replace(/"[^"]*"/g, ' ')
    const hints = [...outside.matchAll(/'([^']+)'/g)].map((m) => m[1])
    if (model && hints.some((h) => containsPhrase(model, h) && !sentences.some((s) => containsPhrase(s, h)))) reasons.add('essay_fix_revealed')
    if (model && /→|로 바꾼|로 고친/.test(outside) && hints.length > 0 && !reasons.has('essay_fix_revealed')) reasons.add('essay_fix_revealed')
  }
  return [...reasons]
}

export function isGrammarLeak(q: GrammarQuestionLike): boolean {
  return detectGrammarLeak(q).some((r) => r !== 'choices_broken')
}

// 시험 snapshot(question_data) 모양도 같은 규칙으로 (type · question · options · answer)
export function detectSnapshotLeak(d: { type?: string; question?: string; options?: string[]; answer?: string }): GrammarLeakReason[] {
  if (d.type !== 'grammar') return []
  return detectGrammarLeak({ question_type: 'grammar', question_text: d.question ?? '', choices: d.options ?? [], correct_answer: d.answer ?? '' })
}

// ── 새 형식 문제 문장 만들기 ──
export const GRAMMAR_BLANK_PROMPT = '다음 문장의 빈칸에 들어갈 말로 어법상 알맞은 것은?'
export const GRAMMAR_FIND_ERROR_PROMPT = '다음 문장의 밑줄 친 ①~⑤ 중 어법상 틀린 것은?'
const CIRCLED = ['①', '②', '③', '④', '⑤']

// (가) 빈칸: 문장 속 target 을 빈칸으로. target 이 문장에 정확히 한 번 있어야 한다
export function buildBlankStem(sentence: string, target: string): string | null {
  if (!sentence || !target) return null
  const re = new RegExp(`(^|[^A-Za-z0-9])(${escapeRe(target)})(?=$|[^A-Za-z0-9])`, 'g')
  const hits = [...sentence.matchAll(re)]
  if (hits.length !== 1) return null
  const blanked = sentence.replace(re, (_m, pre) => `${pre}${GRAMMAR_BLANK}`)
  return `${GRAMMAR_BLANK_PROMPT}\n\n"${blanked.trim()}"`
}

// (나) 틀린 것 찾기: 5곳에 ①~⑤ 번호 + 큰따옴표(인쇄에서 밑줄). 조각이 문장에 순서대로 있어야 한다
export function buildFindErrorStem(sentence: string, segments: string[]): string | null {
  if (!sentence || segments.length !== 5) return null
  let out = ''
  let cursor = 0
  for (let i = 0; i < 5; i++) {
    const seg = segments[i]
    if (!seg) return null
    const idx = sentence.indexOf(seg, cursor)
    if (idx < 0) return null
    out += `${sentence.slice(cursor, idx)}${CIRCLED[i]}"${seg}"`
    cursor = idx + seg.length
  }
  out += sentence.slice(cursor)
  return `${GRAMMAR_FIND_ERROR_PROMPT}\n\n${out.trim()}`
}

// ── AI 생성 직후 검증 (문제가 있으면 다시 만든다) ──
export interface GrammarItemLike {
  type?: string
  grammarFormat?: string
  targetText?: string
  targetSentence?: string
  answer?: string
  wrongAnswers?: string[]
  errorSentence?: string
  segments?: string[]
  wrongIndex?: number
  correction?: string
}

// 문장 비슷함 (단어 겹침 비율) — 틀린 것 찾기 문장이 지문 문장을 거의 그대로 쓰면 지문과 비교해 답을 알 수 있다
function wordSet(s: string): Set<string> {
  return new Set(norm(s).replace(/[^a-z0-9' ]/g, ' ').split(' ').filter(Boolean))
}
export function sentenceSimilarity(a: string, b: string): number {
  const A = wordSet(a)
  const B = wordSet(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / Math.max(A.size, B.size)
}
export const FIND_ERROR_MAX_SIMILARITY = 0.6

export function splitSentences(passage: string): string[] {
  return (passage.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean)
}

// 문제 목록(한국어). 빈 배열이면 통과
export function validateGrammarItem(item: GrammarItemLike, passage: string): string[] {
  if (item.type !== 'grammar') return []
  const p: string[] = []
  const wrongs = (item.wrongAnswers ?? []).map((w) => w.trim()).filter(Boolean)
  if (item.grammarFormat === 'blank') {
    if (!item.targetSentence || !item.targetText) return ['빈칸형: targetSentence·targetText 가 필요합니다']
    if (norm(item.answer ?? '') !== norm(item.targetText)) p.push('빈칸형: answer 는 빈칸 자리의 원래 표현(targetText)과 같아야 합니다')
    const stem = buildBlankStem(item.targetSentence, item.targetText)
    if (!stem) p.push('빈칸형: targetText 가 targetSentence 안에 정확히 한 번 있어야 합니다')
    if (wrongs.length !== 4) p.push('빈칸형: 오답은 정확히 4개')
    if (new Set([item.answer, ...wrongs].map((x) => norm(x ?? ''))).size !== wrongs.length + 1) p.push('빈칸형: 보기가 겹칩니다')
    if (stem) {
      const leak = detectGrammarLeak({ question_type: 'grammar', question_text: stem, choices: [item.answer ?? '', ...wrongs], correct_answer: item.answer })
      if (leak.length) p.push(`빈칸형: 정답 노출 (${leak.join(', ')})`)
    }
  } else if (item.grammarFormat === 'find_error') {
    const segs = (item.segments ?? []).map((s) => s.trim())
    if (!item.errorSentence) return ['틀린 것 찾기: errorSentence 가 필요합니다']
    if (segs.length !== 5) p.push('틀린 것 찾기: 밑줄 조각(segments)은 정확히 5개')
    const wi = item.wrongIndex
    if (typeof wi !== 'number' || wi < 0 || wi > 4) p.push('틀린 것 찾기: wrongIndex 는 0~4')
    if (!item.correction || (typeof wi === 'number' && norm(item.correction) === norm(segs[wi] ?? ''))) p.push('틀린 것 찾기: correction(고친 표현)이 필요하고 틀린 조각과 달라야 합니다')
    if (new Set(segs.map(norm)).size !== segs.length) p.push('틀린 것 찾기: 밑줄 조각이 겹칩니다')
    const stem = segs.length === 5 ? buildFindErrorStem(item.errorSentence, segs) : null
    if (segs.length === 5 && !stem) p.push('틀린 것 찾기: 밑줄 조각 5개가 문장 안에 순서대로 있어야 합니다')
    if (item.correction && containsPhrase(item.errorSentence, item.correction) && typeof wi === 'number' && !containsPhrase(segs[wi] ?? '', item.correction)) {
      p.push('틀린 것 찾기: 고친 표현이 문장에 그대로 들어 있습니다')
    }
    const similar = splitSentences(passage).find((s) => sentenceSimilarity(s, item.errorSentence!) > FIND_ERROR_MAX_SIMILARITY)
    if (similar) p.push('틀린 것 찾기: 지문 문장을 거의 그대로 써서 지문과 비교하면 답이 보입니다 (새 문장으로)')
  } else {
    p.push('어법 문항 형식(grammarFormat)은 "blank" 또는 "find_error" 만 허용됩니다')
  }
  return p
}

// ── 인쇄: 빈칸형 문항의 정답이 같은 시험지의 지문에 그대로 보이지 않게 지문 쪽도 빈칸으로 (화면·인쇄만, 데이터는 그대로) ──
export function maskBlankAnswersInPassage(passage: string, stems: string[]): string {
  let out = passage
  for (const stem of stems) {
    if (!isBlankFormat(stem)) continue
    for (const q of quotedParts(stem)) {
      const parts = q.split(/_{3,}/)
      if (parts.length !== 2) continue
      const [before, after] = parts
      const re = new RegExp(`${escapeRe(before)}(.+?)${escapeRe(after)}`)
      const m = out.match(re)
      if (m && m[1].length <= 60) out = out.replace(re, `${before}${GRAMMAR_BLANK}${after}`)
    }
  }
  return out
}

// ── 저장·화면에서 쓰는 어법 문제 문장 ──
// 예전 형식(정답 노출): 새로 만들지 않는다. 이미 저장된 세트를 화면에 보여줄 때만 쓴다.
export function legacyGrammarStem(target: string): string {
  return `밑줄 친 "${target}"의 쓰임이 어법상 가장 적절한 것은?`
}
// 새 형식 문항은 stem(빈칸형·틀린 것 찾기 문장)을 가진다. 없으면 예전 세트 → 예전 문장
export function grammarItemStem(q: { targetText?: string; stem?: string | null }): string {
  return q.stem || legacyGrammarStem(q.targetText ?? '')
}
