// 검수 샘플표 채점 도우미 (DB 접속 없음, 파일만 읽는다)
// 향미 선생님이 O/X 를 채운 CSV(docs/review-sample-A.csv 등)를 읽어 O/X 개수·X 비율·X 단어 목록과 판정 기준을 보여준다.
//   X 가 2개 이하 → 일괄 사용하기 가능 (X 단어는 빼고) / 3개 이상 → 난이도 구간별로 나눠 다시 검토
//
// 실행: npm run review-sample-result -- docs/review-sample-A.csv

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodeReviewFile, judgeReviewCsv, REVIEW_X_LIMIT } from '../lib/reviewSample.ts'

const files = process.argv.slice(2).filter((a) => !a.startsWith('-'))
if (files.length === 0) {
  console.error('사용법: npm run review-sample-result -- docs/review-sample-A.csv [docs/review-sample-B.csv]')
  process.exit(1)
}

for (const f of files) {
  // 엑셀이 CP949·탭 구분으로 저장한 파일도 읽는다
  const r = judgeReviewCsv(decodeReviewFile(readFileSync(resolve(process.cwd(), f))))
  console.log(`\n■ ${f}`)
  console.log(`  단어 ${r.total}개 · O ${r.o}개 · X ${r.x}개 · 빈칸 ${r.blank}개 · X 비율 ${(r.xRate * 100).toFixed(1)}% (O+X 기준)`)
  if (r.unknown.length) console.log(`  알아볼 수 없는 판정값: ${r.unknown.map((u) => `${u.no}.${u.word}("${u.value}")`).join(', ')}`)
  if (r.xWords.length) {
    console.log('  X 단어:')
    for (const w of r.xWords) console.log(`    ${w.no}. ${w.word}${w.memo ? ` — ${w.memo}` : ''}`)
  }
  console.log(`  판정 기준: X 가 ${REVIEW_X_LIMIT}개 이하면 일괄 사용하기 가능(X 단어 제외), ${REVIEW_X_LIMIT + 1}개 이상이면 난이도 구간별로 나눠 다시 검토`)
  console.log(`  → ${r.decision}`)
}
