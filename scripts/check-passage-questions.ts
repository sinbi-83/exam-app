// STEP 5: 4단계 지문에 붙일 문제(questions)·서술형(essays)·태그(tags) 콘텐츠를
// 저장 전에 검사한다. AI를 호출하지 않는다. DB에도 접속하지 않는다 (읽기 전용 검사).
//
// 실행: node scripts/check-passage-questions.ts data/passage-sets/파일이름.content.json data/passage-sets/파일이름.json

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ORDER = ['school', 'academy', 'advanced', 'prestudy'] as const
const LABELS: Record<string, string> = {
  school: '학교형',
  academy: '일반학원형',
  advanced: '상위학원형',
  prestudy: '선행형',
}

function stripMarkup(text: string): string {
  return text.replace(/\{\{(v|g|t):([^|}]+)(?:\|[^}]+)?\}\}/g, '$2')
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim()
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(normalize(a).split(' ').filter((w) => w.length > 2))
  const wb = new Set(normalize(b).split(' ').filter((w) => w.length > 2))
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / Math.min(wa.size, wb.size)
}

const contentFile = process.argv[2]
const setFile = process.argv[3]
if (!contentFile || !setFile) {
  console.error('사용법: node scripts/check-passage-questions.ts <content.json> <원본 지문 세트.json>')
  process.exit(1)
}
const content = JSON.parse(readFileSync(resolve(process.cwd(), contentFile), 'utf-8'))
const set = JSON.parse(readFileSync(resolve(process.cwd(), setFile), 'utf-8'))

const errors: string[] = []
const warnings: string[] = []
const summaryRows: any[] = []

for (const v of ORDER) {
  const c = content[v]
  const label = LABELS[v]
  if (!c) {
    errors.push(`${label}: content 없음`)
    continue
  }
  const body = set.variants[v] as string

  // 1) tagged_body를 벗기면 실제 body와 같아야 한다 (마크업이 원문을 훼손하지 않았는지)
  const stripped = stripMarkup(c.tagged_body)
  if (stripped !== body) {
    errors.push(`${label}: tagged_body에서 마크업을 제거한 결과가 실제 본문과 다릅니다 (마크업이 단어를 바꿨을 가능성).`)
  }

  // 2) 문제 정확히 20개, 유형 배분 mc10/blank5/tf3/order1/match1
  const qs = c.questions ?? []
  const counts: Record<string, number> = {}
  for (const q of qs) counts[q.type] = (counts[q.type] ?? 0) + 1
  if (qs.length !== 20) errors.push(`${label}: 문제가 20개가 아니라 ${qs.length}개입니다.`)
  const expect = { mc: 10, blank: 5, tf: 3, order: 1, match: 1 }
  for (const [t, n] of Object.entries(expect)) {
    if ((counts[t] ?? 0) !== n) errors.push(`${label}: ${t} 유형이 ${n}개가 아니라 ${counts[t] ?? 0}개입니다.`)
  }

  // 3) 서술형 정확히 5개
  const es = c.essays ?? []
  if (es.length !== 5) errors.push(`${label}: 서술형이 5개가 아니라 ${es.length}개입니다.`)

  // 4) mc: 보기 5개 + 정답이 보기 안에 있는지 + 해설 존재
  for (const q of qs) {
    if (q.type === 'mc') {
      if (!Array.isArray(q.choices) || q.choices.length !== 5) errors.push(`${label}: mc 문제 보기 개수 이상 - "${q.q}"`)
      if (!q.choices?.includes(q.answer)) errors.push(`${label}: mc 정답이 보기에 없음 - "${q.q}"`)
      if (!q.explanation) errors.push(`${label}: mc 해설 없음 - "${q.q}"`)
    }
    if (q.type === 'blank' || q.type === 'tf') {
      if (q.answer === undefined || q.answer === '') errors.push(`${label}: ${q.type} 정답 없음 - "${q.q}"`)
      if (!q.explanation) errors.push(`${label}: ${q.type} 해설 없음 - "${q.q}"`)
    }
    if (q.type === 'order') {
      if (!q.answer?.length || q.answer.length !== q.items?.length) errors.push(`${label}: order 정답/보기 개수 불일치`)
    }
    if (q.type === 'match') {
      if (!q.pairs?.length) errors.push(`${label}: match 짝 목록 없음`)
    }
  }

  // 5) 서술형: 예시 답안 존재
  for (const e of es) {
    if (!e.sampleAnswer) errors.push(`${label}: 서술형 예시 답안 없음 - "${e.q}"`)
    if (!e.rubric) errors.push(`${label}: 서술형 채점 기준 없음 - "${e.q}"`)
  }

  // 6) 근거 확인: blank 정답 단어, mc/tf 핵심 문구가 본문에 실제로 있는지 (대소문자 무시)
  const bodyLower = body.toLowerCase()
  for (const q of qs) {
    if (q.type === 'blank') {
      if (!bodyLower.includes(String(q.answer).toLowerCase())) {
        errors.push(`${label}: blank 정답 "${q.answer}"이(가) 본문에 없습니다 - "${q.q}"`)
      }
    }
  }

  // 7) 문제 중복(유사) 검사: 같은 유형 안에서 질문 문장 유사도가 너무 높으면 경고
  const mcQs = qs.filter((q: any) => q.type === 'mc')
  for (let i = 0; i < mcQs.length; i++) {
    for (let j = i + 1; j < mcQs.length; j++) {
      const sim = wordOverlap(mcQs[i].q, mcQs[j].q)
      if (sim >= 0.75) warnings.push(`${label}: mc 문제 ${i + 1}번과 ${j + 1}번이 비슷할 수 있습니다 (겹침 ${(sim * 100).toFixed(0)}%) - "${mcQs[i].q}" / "${mcQs[j].q}"`)
    }
  }

  // 8) mc 정답 위치 분포 (완전히 한쪽으로 몰리면 경고)
  const posCounts = [0, 0, 0, 0, 0]
  for (const q of mcQs) {
    const idx = q.choices.indexOf(q.answer)
    if (idx >= 0) posCounts[idx]++
  }
  const maxPos = Math.max(...posCounts)
  if (maxPos >= 7) warnings.push(`${label}: mc 정답 위치가 한 자리에 ${maxPos}개나 몰려 있습니다: [${posCounts.join(', ')}]`)

  // 9) 태그 존재 확인
  const tagCounts = {
    vocab: c.tags?.vocab?.length ?? 0,
    grammar: c.tags?.grammar?.length ?? 0,
    topic: c.tags?.topic?.length ?? 0,
  }
  if (tagCounts.vocab === 0) errors.push(`${label}: 어휘 태그가 비어 있습니다.`)
  if (tagCounts.grammar === 0) errors.push(`${label}: 어법 태그가 비어 있습니다.`)
  if (tagCounts.topic === 0) errors.push(`${label}: 주제 태그가 비어 있습니다.`)
  const markupCount = (c.tagged_body.match(/\{\{(v|g|t):/g) ?? []).length
  if (markupCount === 0) errors.push(`${label}: tagged_body에 색깔 마크업이 하나도 없습니다.`)

  summaryRows.push({
    난이도: label,
    문제: qs.length,
    서술형: es.length,
    '유형(mc/blank/tf/order/match)': `${counts.mc ?? 0}/${counts.blank ?? 0}/${counts.tf ?? 0}/${counts.order ?? 0}/${counts.match ?? 0}`,
    '태그(어휘/어법/주제)': `${tagCounts.vocab}/${tagCounts.grammar}/${tagCounts.topic}`,
    '마크업 개수': markupCount,
    '한글답변 서술형': es.filter((e: any) => e.answerLang === 'ko').length,
  })
}

// 10) 난이도 상승: mc 질문 평균 길이(단어수)가 단계마다 줄어들지 않아야 한다 (거친 지표)
const avgQLen = ORDER.map((v) => {
  const qs = (content[v]?.questions ?? []).filter((q: any) => q.type === 'mc')
  const words = qs.reduce((sum: number, q: any) => sum + normalize(q.q).split(' ').length, 0)
  return qs.length ? +(words / qs.length).toFixed(1) : 0
})
for (let i = 1; i < avgQLen.length; i++) {
  if (avgQLen[i] < avgQLen[i - 1] - 1) {
    warnings.push(`문제 문장 평균 길이가 ${LABELS[ORDER[i - 1]]}(${avgQLen[i - 1]}) → ${LABELS[ORDER[i]]}(${avgQLen[i]})에서 줄었습니다.`)
  }
}

console.log('=== 단계별 요약 ===')
console.table(summaryRows)
console.log('\n=== mc 문제 문장 평균 길이(단어수, 단계가 올라갈수록 커지는 경향이면 정상) ===')
console.log(ORDER.map((v, i) => `${LABELS[v]}: ${avgQLen[i]}`).join('  |  '))

console.log('\n=== 경고 (자동 판단이 어려운 항목 — 사람이 확인) ===')
if (warnings.length) warnings.forEach((w) => console.log('⚠️ ', w))
else console.log('없음')

console.log('\n=== 검사 결과 ===')
if (errors.length) {
  errors.forEach((e) => console.log('❌', e))
  process.exit(1)
}
console.log('✅ 4단계 모두 20문제+5서술형 / 정답·해설·예시답안 존재 / 근거 단어 확인 / 태그 존재')
