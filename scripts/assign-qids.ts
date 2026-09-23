// 새로 만든 지문 JSON 파일(로컬)의 문제·서술형 각각에 영구 ID(qid)를 붙인다. DB에 접속하지 않는다.
// 이미 qid 가 있는 문항은 절대 바꾸지 않고, 없는 문항에만 새 UUID 를 붙인다 (여러 번 실행해도 안전).
//
// 실행: npm run assign-qids -- data/passages/파일이름.json            (단일 지문 파일)
//       npm run assign-qids -- data/passage-sets/파일이름.content.json  (4단계 content 파일)
//       --check 를 붙이면 파일을 고치지 않고 상태만 보여준다.
//
// ⚠️ 이미 DB에 저장된 지문의 원본 파일에는 쓰지 않는다. 그런 지문은 DB 쪽에서
//    scripts/backfill-passage-qids.ts 로 qid 를 받는데, 여기서 따로 붙이면 파일과 DB의 qid 가 서로 달라진다.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inspectQids, qidErrors, withQids } from '../lib/passageQid.ts'

const ORDER = ['school', 'academy', 'advanced', 'prestudy'] as const

const filePath = process.argv[2]
const checkOnly = process.argv.includes('--check')
if (!filePath) {
  console.error('사용법: npm run assign-qids -- <지문 JSON 또는 content.json> [--check]')
  process.exit(1)
}

const fullPath = resolve(process.cwd(), filePath)
const data = JSON.parse(readFileSync(fullPath, 'utf-8'))

// 단일 지문 파일은 최상위에 questions/essays, content 파일은 난이도별로 들어 있다.
const parts: { label: string; target: any }[] = Array.isArray(data.questions)
  ? [{ label: '단일 지문', target: data }]
  : ORDER.filter((v) => data[v]).map((v) => ({ label: v, target: data[v] }))

if (parts.length === 0) {
  console.error('questions/essays 를 찾지 못했습니다. 단일 지문 JSON 또는 4단계 content.json 인지 확인해주세요.')
  process.exit(1)
}

let totalAdded = 0
let hasError = false
for (const { label, target } of parts) {
  const before = inspectQids(target.questions ?? [], target.essays ?? [])
  const dupErrors = qidErrors(before, false)
  if (dupErrors.length) {
    dupErrors.forEach((e) => console.log(`❌ ${label}: ${e}`))
    hasError = true
    continue
  }
  const q = withQids(target.questions ?? [])
  const e = withQids(target.essays ?? [])
  if (!checkOnly) {
    target.questions = q.items
    target.essays = e.items
  }
  totalAdded += q.added + e.added
  console.log(
    `${label}: 문제 ${before.questionCount}개(qid 있음 ${before.questionsWithQid}) · 서술형 ${before.essayCount}개(qid 있음 ${before.essaysWithQid})` +
      ` → 새로 붙일 qid ${q.added + e.added}개`,
  )
}

if (hasError) {
  console.log('\n중복/형식 오류가 있어 파일을 고치지 않았습니다.')
  process.exit(1)
}
if (checkOnly) {
  console.log(`\n[--check] 파일은 고치지 않았습니다. 붙여야 할 qid: ${totalAdded}개`)
  process.exit(0)
}
if (totalAdded === 0) {
  console.log('\n모든 문항에 이미 qid 가 있습니다. 파일을 고치지 않았습니다.')
  process.exit(0)
}
writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
console.log(`\n✅ qid ${totalAdded}개를 붙여 저장했습니다: ${filePath}`)
