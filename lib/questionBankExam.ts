// 문제은행(questions 테이블) 문항 하나를 exam_questions.question_data 로 복사할 때의 모양과 출처(provenance).
//
// 예전에는 { ...q } 통째 복사로 question_data.id(=questions.id), question_set_id 가 "우연히" 남아 있었다.
// 앞으로는 그 암묵적 값에 기대지 않고 source / source_question_id / source_question_set_id 를 명시한다.
// 기존 id, question_set_id 값은 호환을 위해 그대로 둔다 (지우지 않는다).
// 시험 표시·인쇄·채점은 계속 question_data snapshot 만 쓴다. provenance 는 추적용이다.

export interface BankQuestionLike {
  id: string
  question_set_id?: string
}

export function buildBankExamQuestionData<Q extends BankQuestionLike>(q: Q, passage: string | undefined) {
  return {
    ...q,
    passage,
    source: 'question_bank' as const,
    source_question_id: q.id,
    source_question_set_id: q.question_set_id ?? null,
  }
}

type BankSourceFields = { id?: string; source?: string; source_question_id?: string }

// 이 시험에 이미 담긴 문제은행 문항의 원본 questions.id 모음 (중복 추가 방지용).
// - source='question_bank' (신규) → source_question_id
// - source 없음 (STEP 3-B 이전 legacy) → 예전처럼 question_data.id
// - 외부지문 등 다른 출처 → 제외 (qid 와 questions.id 는 서로 다른 ID 체계라 섞지 않는다)
export function bankAddedIds(rows: { question_data: BankSourceFields }[]): Set<string> {
  const ids = new Set<string>()
  for (const { question_data: d } of rows) {
    if (d.source === 'question_bank') {
      if (d.source_question_id) ids.add(d.source_question_id)
    } else if (d.source === undefined && d.id) {
      ids.add(d.id)
    }
  }
  return ids
}
