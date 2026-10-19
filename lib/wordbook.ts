// 지문 단어장 규칙 (화면·API·scripts 테스트가 함께 쓴다 → 다른 모듈을 import 하지 않는다. 타입만).
//
// - 지문 tagged_body 의 🔵 {{v:단어}} 표시를 순서대로 모은다 (같은 단어는 한 번만)
// - 각 단어가 들어 있는 지문 문장을 예문으로 붙인다
// - 단어은행에 같은 단어(또는 원형: motorbikes → motorbike, grilled → grill)가 있으면 뜻·품사를 채운다
//   (사용 중 → 확인 필요 순서. 사용 안 함·보관·삭제된 단어는 쓰지 않는다)
// AI API 는 호출하지 않는다.

import type { WordbookDraftWord, WordbookTestDirection, WordbookWord } from '../types/wordbook'

const TAG_REGEX = /\{\{(v|g|t):([^|}]+)(?:\|([^}]+))?\}\}/g

export const WORDBOOK_POS_LABELS: Record<string, string> = {
  noun: '명', pronoun: '대', verb: '동', auxiliary: '조', adjective: '형', adverb: '부',
  preposition: '전', conjunction: '접', determiner: '한', interjection: '감', numeral: '수',
}

export const WORDBOOK_DIRECTION_LABELS: Record<WordbookTestDirection, string> = {
  en_ko: '영→한',
  ko_en: '한→영',
  mixed: '혼합',
}

const wordKey = (s: string) => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()

// 마크업을 지운 본문 + 🔵 단어마다 지운 본문 안 위치
export function extractTaggedVocab(taggedBody: string): { plain: string; vocab: { surface: string; index: number }[] } {
  let plain = ''
  let last = 0
  const vocab: { surface: string; index: number }[] = []
  const regex = new RegExp(TAG_REGEX)
  let m: RegExpExecArray | null
  while ((m = regex.exec(taggedBody ?? '')) !== null) {
    plain += taggedBody.slice(last, m.index)
    const content = m[2]
    if (m[1] === 'v') vocab.push({ surface: content.trim(), index: plain.length })
    plain += content
    last = m.index + m[0].length
  }
  plain += (taggedBody ?? '').slice(last)
  return { plain, vocab }
}

// index 위치가 들어 있는 문장 (. ! ? 줄바꿈 기준)
export function sentenceAt(plain: string, index: number): string {
  let start = index
  while (start > 0 && !/[.!?\n]/.test(plain[start - 1])) start--
  let end = index
  while (end < plain.length && !/[.!?\n]/.test(plain[end])) end++
  while (end < plain.length && /[.!?"'”’)]/.test(plain[end])) end++
  return balanceQuotes(plain.slice(start, end).replace(/\s+/g, ' ').trim())
}

// 대사 문장을 잘라 오면 따옴표가 한쪽만 남는다 ("I'm serious. → I'm serious.)
function balanceQuotes(s: string): string {
  const count = (s.match(/["“”]/g) ?? []).length
  if (count % 2 === 0) return s
  if (/^["“]/.test(s)) return s.slice(1).trim()
  return s.replace(/["”](?=[^"“”]*$)/, '').trim()
}

// 자주 나오는 불규칙 동사 과거·과거분사 → 원형
const IRREGULAR_VERBS: Record<string, string> = {
  was: 'be', were: 'be', been: 'be', had: 'have', did: 'do', done: 'do', went: 'go', gone: 'go', came: 'come',
  saw: 'see', seen: 'see', took: 'take', taken: 'take', made: 'make', got: 'get', gotten: 'get', gave: 'give',
  given: 'give', knew: 'know', known: 'know', thought: 'think', told: 'tell', said: 'say', found: 'find',
  felt: 'feel', left: 'leave', kept: 'keep', began: 'begin', begun: 'begin', brought: 'bring', bought: 'buy',
  built: 'build', caught: 'catch', chose: 'choose', chosen: 'choose', crept: 'creep', drew: 'draw', drawn: 'draw',
  drank: 'drink', drove: 'drive', driven: 'drive', ate: 'eat', eaten: 'eat', fell: 'fall', fallen: 'fall',
  fought: 'fight', flew: 'fly', flown: 'fly', forgot: 'forget', forgotten: 'forget', froze: 'freeze',
  frozen: 'freeze', grew: 'grow', grown: 'grow', hid: 'hide', hidden: 'hide', held: 'hold', heard: 'hear',
  led: 'lead', lost: 'lose', meant: 'mean', met: 'meet', paid: 'pay', ran: 'run', rang: 'ring', rose: 'rise',
  risen: 'rise', sold: 'sell', sent: 'send', shook: 'shake', shaken: 'shake', shone: 'shine', sang: 'sing',
  sat: 'sit', slept: 'sleep', spoke: 'speak', spoken: 'speak', spent: 'spend', stood: 'stand', stole: 'steal',
  stolen: 'steal', swam: 'swim', taught: 'teach', threw: 'throw', thrown: 'throw', understood: 'understand',
  woke: 'wake', woken: 'wake', wore: 'wear', worn: 'wear', won: 'win', wrote: 'write', written: 'write',
  broke: 'break', broken: 'break', became: 'become', blew: 'blow', blown: 'blow', dug: 'dig', fed: 'feed',
  forgave: 'forgive', hung: 'hang', laid: 'lay', lit: 'light', rode: 'ride', ridden: 'ride', sank: 'sink',
  slid: 'slide', sought: 'seek', spun: 'spin', stuck: 'stick', struck: 'strike', swept: 'sweep', tore: 'tear',
  torn: 'tear', wept: 'weep', bent: 'bend', bit: 'bite', bitten: 'bite', bled: 'bleed', bore: 'bear',
  dealt: 'deal', fled: 'flee', lent: 'lend', overcame: 'overcome', withdrew: 'withdraw',
}

// 원형 후보 + 그 후보로 찾을 때 맞아야 하는 품사 (null = 아무 품사)
// 예: planned → plan 은 동사일 때만 (명사 plan '계획'을 붙이지 않는다).
// -ly 부사는 형용사 뜻(steady '꾸준한')이 틀린 뜻이 되므로 원형으로 바꾸지 않는다.
interface LemmaCandidate {
  key: string
  pos: readonly string[] | null
}
const VERB = ['verb'] as const
const NOUN_OR_VERB = ['noun', 'verb'] as const
const ADJ = ['adjective'] as const

function candidatesWithPos(surface: string): LemmaCandidate[] {
  const w = wordKey(surface)
  const out: LemmaCandidate[] = [{ key: w, pos: null }]
  const add = (key: string, pos: readonly string[] | null) => {
    if (key.length >= 2 && !out.some((c) => c.key === key)) out.push({ key, pos })
  }
  if (w.includes(' ')) {
    // 구: 첫 단어만 원형으로 (looked for → look for, came out → come out).
    // 구 표현은 단어은행에 품사가 비어 있는 경우가 많아 품사를 따지지 않는다
    const [first, ...rest] = w.split(' ')
    for (const c of candidatesWithPos(first).slice(1)) add([c.key, ...rest].join(' '), null)
    return out
  }
  const doubled = (s: string) => (s.length >= 3 && s[s.length - 1] === s[s.length - 2] ? s.slice(0, -1) : null)
  if (IRREGULAR_VERBS[w]) add(IRREGULAR_VERBS[w], VERB)
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y', NOUN_OR_VERB)
  if (w.endsWith('es')) add(w.slice(0, -2), NOUN_OR_VERB)
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1), NOUN_OR_VERB)
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y', VERB)
  if (w.endsWith('ed')) {
    const stem = w.slice(0, -2)
    add(stem, VERB); add(w.slice(0, -1), VERB)
    const d = doubled(stem); if (d) add(d, VERB)
  }
  if (w.endsWith('ing')) {
    const stem = w.slice(0, -3)
    add(stem, VERB); add(stem + 'e', VERB)
    const d = doubled(stem); if (d) add(d, VERB)
  }
  if (w.endsWith('ier')) add(w.slice(0, -3) + 'y', ADJ)
  if (w.endsWith('iest')) add(w.slice(0, -4) + 'y', ADJ)
  if (w.endsWith('er')) add(w.slice(0, -2), ADJ)
  if (w.endsWith('est')) add(w.slice(0, -3), ADJ)
  return out
}

// 지문 모양 → 원형 후보 (단어은행 찾기용, 첫 번째가 그대로)
export function lemmaCandidates(surface: string): string[] {
  return candidatesWithPos(surface).map((c) => c.key)
}

export interface BankEntryLite {
  expression: string
  lemma: string | null
  pos: string | null
  meaning_ko: string
  status: string // approved | pending | rejected | archived
}

const STATUS_RANK: Record<string, number> = { approved: 0, pending: 1 }

// 단어은행 찾기표: key(표현·lemma 소문자) → 쓸 수 있는 어휘 (사용 중 먼저)
export function buildBankIndex(entries: readonly BankEntryLite[]): Map<string, BankEntryLite[]> {
  const index = new Map<string, BankEntryLite[]>()
  for (const e of entries) {
    if (!(e.status in STATUS_RANK)) continue
    for (const k of new Set([wordKey(e.expression), e.lemma ? wordKey(e.lemma) : ''])) {
      if (!k) continue
      const list = index.get(k) ?? []
      list.push(e)
      index.set(k, list)
    }
  }
  for (const list of index.values()) list.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
  return index
}

export function findBankEntry(surface: string, index: Map<string, BankEntryLite[]>): BankEntryLite | null {
  for (const c of candidatesWithPos(surface)) {
    const hit = (index.get(c.key) ?? []).find((e) => !c.pos || (e.pos !== null && c.pos.includes(e.pos)))
    if (hit) return hit
  }
  return null
}

// 지문 → 단어장 초안
export function buildWordbookDraft(taggedBody: string, bankEntries: readonly BankEntryLite[]): WordbookDraftWord[] {
  const { plain, vocab } = extractTaggedVocab(taggedBody)
  const index = buildBankIndex(bankEntries)
  const seen = new Set<string>()
  const words: WordbookDraftWord[] = []
  for (const v of vocab) {
    const hit = findBankEntry(v.surface, index)
    const word = hit ? hit.expression : v.surface
    const key = wordKey(word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    words.push({
      word,
      surface: v.surface,
      pos: hit?.pos ? WORDBOOK_POS_LABELS[hit.pos] ?? '' : '',
      meaning: hit?.meaning_ko ?? '',
      sentence: sentenceAt(plain, v.index),
      origin: hit ? 'bank' : 'none',
    })
  }
  return words
}

// 저장 전 정리: 앞뒤 공백, 빈 단어 줄 제거, 같은 단어 한 번만
export function cleanWordbookWords(words: readonly Partial<WordbookWord>[]): WordbookWord[] {
  const seen = new Set<string>()
  const out: WordbookWord[] = []
  for (const w of words) {
    const word = String(w.word ?? '').trim()
    const key = wordKey(word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({
      word,
      surface: String(w.surface ?? '').trim() || word,
      pos: String(w.pos ?? '').trim(),
      meaning: String(w.meaning ?? '').trim(),
      sentence: String(w.sentence ?? '').trim(),
    })
  }
  return out
}

// 지문을 만들 때 같이 쓴 단어장(content 의 wordbook)이 지문 🔵 단어를 빠짐없이 담았는지 검사 (scripts 검사용)
// 오류: 🔵 단어가 단어장에 없음 / 뜻 빈칸 / 예문이 지문에 없음. 경고: 품사 빈칸
export function wordbookCoverageProblems(taggedBody: string, words: readonly Partial<WordbookWord>[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const { plain, vocab } = extractTaggedVocab(taggedBody)
  const covered = new Set<string>()
  for (const w of words) {
    for (const s of [w.word, w.surface]) if (s) covered.add(wordKey(s))
  }
  const missing = [...new Set(vocab.map((v) => v.surface))].filter((s) => !lemmaCandidates(s).some((c) => covered.has(c)))
  if (missing.length > 0) errors.push(`🔵 단어가 단어장에 없음: ${missing.join(', ')}`)
  const plainKey = wordKey(plain)
  for (const w of words) {
    const name = String(w.word ?? '').trim() || '(빈 단어)'
    if (!String(w.meaning ?? '').trim()) errors.push(`뜻 빈칸: ${name}`)
    if (!String(w.pos ?? '').trim()) warnings.push(`품사 빈칸: ${name}`)
    const sentence = String(w.sentence ?? '').trim()
    if (sentence && !plainKey.includes(wordKey(sentence))) errors.push(`예문이 지문에 없음: ${name} — "${sentence}"`)
  }
  return { errors, warnings }
}

// 예문을 [앞, 단어, 뒤] 조각으로 (단어 굵게 표시용). 못 찾으면 [문장]
export function splitSentenceOn(sentence: string, surface: string): string[] {
  if (!sentence || !surface) return [sentence]
  const i = sentence.toLowerCase().indexOf(surface.toLowerCase())
  if (i < 0) return [sentence]
  return [sentence.slice(0, i), sentence.slice(i, i + surface.length), sentence.slice(i + surface.length)]
}

// 단어 테스트지 문항: 영→한이면 단어를 보여 주고 뜻을 쓴다. 뜻이 비어 있는 단어는 한→영으로 낼 수 없어 영→한으로.
export interface WordbookTestItem {
  prompt: string
  answer: string
  showEn: boolean
}

export function buildTestItems(words: readonly WordbookWord[], direction: WordbookTestDirection, order: readonly number[] | null): WordbookTestItem[] {
  const list = order ? order.map((i) => words[i]).filter(Boolean) : [...words]
  return list.map((w, i) => {
    let showEn = direction === 'en_ko' || (direction === 'mixed' && i % 2 === 0)
    if (!w.meaning) showEn = true
    return { prompt: showEn ? w.word : w.meaning, answer: showEn ? w.meaning : w.word, showEn }
  })
}

// 섞기 순서 (seed 가 같으면 같은 순서 → 미리보기·인쇄·PDF 가 같다)
export function shuffledOrder(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  let s = (seed >>> 0) || 1
  const rand = () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}
