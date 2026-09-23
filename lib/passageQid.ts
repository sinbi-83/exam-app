// 외부지문(passages.questions[] / essays[]) 문항 하나하나에 붙이는 영구 ID(qid) 관련 유틸리티.
//
// 왜 필요한가: 예전에는 "몇 번째 문제인지(배열 index)"로 문항을 구분했는데, 앞 문제를 삭제하면
// 뒤 문제들의 번호가 한 칸씩 당겨져서 다른 문제를 가리키게 된다. qid는 한 번 붙으면
// 문제를 수정·순서변경·앞 문제 삭제해도 절대 바뀌지 않는다.
//
// 규칙
// - qid 는 UUID(crypto.randomUUID). 사람이 읽는 순번을 쓰지 않는다.
// - 이미 있는 qid 는 절대 바꾸지 않는다. 없는 문항에만 새로 붙인다.
// - 같은 지문 안(questions + essays 전체)에서 중복 금지.
// - qid 가 없는 예전(legacy) 지문도 그대로 동작해야 한다 — 이 파일은 검사/부여만 하고 강제하지 않는다.
//
// 이 파일은 다른 모듈을 import 하지 않는다 (앱, scripts/, 테스트 스크립트에서 모두 그대로 쓰기 위해).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function newQid(): string {
  return crypto.randomUUID()
}

export function isValidQid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

type WithQid = { qid?: string }

export interface QidReport {
  questionCount: number
  essayCount: number
  questionsWithQid: number
  essaysWithQid: number
  questionsMissing: number
  essaysMissing: number
  invalid: string[] // 형식이 UUID 가 아닌 qid
  duplicates: string[] // 같은 지문 안에서 두 번 이상 나온 qid
}

// 지문 하나의 questions/essays 에서 qid 상태를 센다. 데이터는 바꾸지 않는다.
export function inspectQids(questions: WithQid[] = [], essays: WithQid[] = []): QidReport {
  const seen = new Map<string, number>()
  const invalid: string[] = []
  for (const item of [...questions, ...essays]) {
    if (item.qid === undefined) continue
    if (!isValidQid(item.qid)) invalid.push(String(item.qid))
    seen.set(item.qid, (seen.get(item.qid) ?? 0) + 1)
  }
  const questionsWithQid = questions.filter((q) => q.qid !== undefined).length
  const essaysWithQid = essays.filter((e) => e.qid !== undefined).length
  return {
    questionCount: questions.length,
    essayCount: essays.length,
    questionsWithQid,
    essaysWithQid,
    questionsMissing: questions.length - questionsWithQid,
    essaysMissing: essays.length - essaysWithQid,
    invalid,
    duplicates: Array.from(seen.entries())
      .filter(([, n]) => n > 1)
      .map(([qid]) => qid),
  }
}

// qid 검사 결과를 오류 문장 목록으로 바꾼다.
// requireQid=true  → 신규 생성물: qid 없는 문항이 하나라도 있으면 오류
// requireQid=false → legacy 허용: qid 없는 것은 통과, 중복/형식 오류만 잡는다
export function qidErrors(report: QidReport, requireQid: boolean): string[] {
  const errors: string[] = []
  if (report.duplicates.length) errors.push(`같은 지문 안에 중복된 qid 가 있습니다: ${report.duplicates.join(', ')}`)
  if (report.invalid.length) errors.push(`UUID 형식이 아닌 qid 가 있습니다: ${report.invalid.join(', ')}`)
  if (requireQid && (report.questionsMissing > 0 || report.essaysMissing > 0)) {
    errors.push(`qid 가 없는 문항이 있습니다 (문제 ${report.questionsMissing}개, 서술형 ${report.essaysMissing}개).`)
  }
  return errors
}

// qid 가 없는 문항에만 새 qid 를 붙인 "새 배열"을 돌려준다. 이미 있는 qid 와 나머지 내용은 그대로.
// 원본 배열/객체는 건드리지 않는다.
export function withQids<T extends WithQid>(items: T[]): { items: T[]; added: number } {
  let added = 0
  const next = items.map((item) => {
    if (item.qid !== undefined) return item
    added++
    // qid 를 맨 앞에 두어 JSON 파일에서 눈에 잘 띄게 한다. (qid: undefined 가 명시된 경우 덮어쓰이지 않도록 먼저 뺀다)
    const { qid: _missing, ...rest } = item
    return { qid: newQid(), ...rest } as T
  })
  return { items: next, added }
}
