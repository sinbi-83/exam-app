// 난이도 4단계 지문 세트(JSON)를 저장 전에 검사하고 4개를 나란히 보여준다.
// AI를 호출하지 않는다. DB에도 접속하지 않는다 (읽기 전용 검사).
//
// 실행: node scripts/check-passage-set.ts data/passage-sets/파일이름.json

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ORDER = ['school', 'academy', 'advanced', 'prestudy'] as const
const LABELS: Record<string, string> = {
  school: '학교형',
  academy: '일반학원형',
  advanced: '상위학원형',
  prestudy: '선행형',
}

// 이야기의 뼈대: 네 지문 모두에 들어 있어야 하는 핵심 표현 (등장인물/사건/주제/결말)
const MUST_KEEP: [string, RegExp][] = [
  ['등장인물: 삼촌', /uncle/i],
  ['등장인물: 여자친구', /girlfriend/i],
  ['사건: 로켓 영상', /rocket/i],
  ['사건: 투자 손실(lost a lot)', /lost a (lot|great deal)/i],
  ['농담', /laugh|joke/i],
  ['주제: 나쁜 일 하나가 미래를 정하지 않음', /whole future|your life/i],
  ['주제: 걱정해도 나아지지 않음', /worr/i],
  ['결말: 함께 발사 시청', /watched the rocket launch together/i],
  ['결말: 삼촌이 즐김', /enjoyed|able to enjoy/i],
]

// 학교형에서 쓰면 안 되는 문법 (lib/aiPassagePromptBuilder.ts 의 초5~초6 기준표 참고)
const SCHOOL_FORBIDDEN: [string, RegExp][] = [
  ['관계대명사', /\b(who|whom|whose|which)\b(?!\s*(is|are|was|were|do|does|did)\b.*\?)/i],
  ['현재완료', /\b(have|has|had)\s+(\w+ed|been|lost|seen|gone|done|made|taken)\b|\w['’]ve\s+\w+/i],
  ['수동태', /\b(is|are|was|were|be|been|being)\s+\w+ed\b/i],
  ['가주어 it ... to', /\bit\s+(is|was)\s+\w+\s+to\b/i],
  ['ask/tell + 목적어 + to부정사', /\b(ask|tell|want|allow)s?\s+(the|a|him|her|them|us|me)\s*\w*\s+to\b/i],
  ['as if / as though', /\bas (if|though)\b/i],
  ['분사구문·동명사 주어', /(^|[.!?]["”]?\s+|["“]\s*)\w+ing\s+[\w\s]{1,20}\b(will|is|can|does)\b/i],
  ['명사절 if(~인지 아닌지, 간접의문문)', /\b(see|know|check(ing|ed)?|wonder(ing|ed)?|find out|sure|decide[sd]?|care[sd]?|ask(ing|ed)?)\s+if\b/i],
]

function stats(body: string) {
  const sentences = body.split(/(?<=[.!?])["”]?\s+/).filter((s) => s.trim().length > 0)
  const words = body.match(/[A-Za-z']+/g) ?? []
  const long = words.filter((w) => w.length >= 8).length
  return {
    sentences: sentences.length,
    words: words.length,
    avgSentence: +(words.length / sentences.length).toFixed(1),
    avgWord: +(words.reduce((a, w) => a + w.length, 0) / words.length).toFixed(2),
    longWordRatio: +((long / words.length) * 100).toFixed(1),
  }
}

const file = process.argv[2]
if (!file) {
  console.error('사용법: node scripts/check-passage-set.ts <JSON 파일 경로>')
  process.exit(1)
}
const set = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf-8'))
const errors: string[] = []

for (const f of ['title', 'level', 'topic', 'source_body']) {
  if (!set[f]) errors.push(`"${f}" 값이 비어 있습니다.`)
}
for (const v of ORDER) {
  if (!set.variants?.[v] || !String(set.variants[v]).trim()) errors.push(`${LABELS[v]}(${v}) 본문이 없습니다.`)
}

if (errors.length === 0) {
  const rows = ORDER.map((v) => ({ v, body: set.variants[v] as string, ...stats(set.variants[v]) }))

  // 서로 복사본이 아닌지
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      if (rows[i].body.trim() === rows[j].body.trim())
        errors.push(`${LABELS[rows[i].v]}와 ${LABELS[rows[j].v]}가 완전히 같습니다.`)

  // 이야기 뼈대 유지
  for (const r of rows)
    for (const [name, re] of MUST_KEEP)
      if (!re.test(r.body)) errors.push(`${LABELS[r.v]}: "${name}" 이(가) 빠졌습니다.`)

  // 학교형(초6)에 명백한 중등 문법이 없는지 (초등학교 6학년 금지 문법 기준표 기반, 대략적인 검사)
  const school = rows[0]
  for (const [name, re] of SCHOOL_FORBIDDEN)
    if (re.test(school.body)) errors.push(`학교형에 초6에 맞지 않는 문법이 있습니다: ${name}`)

  // 난이도 상승: 문장 길이·단어 길이가 단계마다 줄지 않아야 한다
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].avgSentence < rows[i - 1].avgSentence)
      errors.push(`평균 문장 길이가 ${LABELS[rows[i - 1].v]} → ${LABELS[rows[i].v]}에서 줄었습니다.`)
    if (rows[i].avgWord < rows[i - 1].avgWord)
      errors.push(`평균 단어 길이가 ${LABELS[rows[i - 1].v]} → ${LABELS[rows[i].v]}에서 줄었습니다.`)
  }

  console.log('=== 수치 요약 (단계가 올라갈수록 커져야 정상) ===')
  console.table(
    rows.map((r) => ({
      난이도: LABELS[r.v],
      문장수: r.sentences,
      단어수: r.words,
      '문장당 단어': r.avgSentence,
      '평균 단어길이': r.avgWord,
      '긴단어(8자+) %': r.longWordRatio,
    })),
  )
  for (const r of rows) console.log(`\n────── ${LABELS[r.v]} (${r.v}) ──────\n${r.body}`)
}

console.log('\n=== 검사 결과 ===')
if (errors.length) {
  errors.forEach((e) => console.log('❌', e))
  process.exit(1)
}
console.log('✅ 4단계 모두 존재 / 비어 있지 않음 / 서로 다름 / 이야기 뼈대 유지 / 난이도 수치 상승')
