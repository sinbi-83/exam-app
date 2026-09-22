// 외부지문저장소(passages)의 문제/서술형 하나를 exam_questions.question_data 모양으로 바꿔주는 변환 함수.
// 원본 passage.questions / passage.essays 배열은 절대 건드리지 않는다 — 여기서는 "복사본"만 만든다.
// DB 컬럼을 새로 추가하지 않고, question_data(JSON) 안에 출처 정보(source_*)를 같이 저장해서
// "이 문제는 이미 이 시험에 담겼다"를 나중에 다시 열어도 판단할 수 있게 한다.

import { PassageEssay, PassageQuestion } from '@/types/passageBank'

export type ExamSourceKind = 'question' | 'essay'

// app/exams/[id]/page.tsx, app/exams/[id]/print/page.tsx 의 QuestionData 와 같은 모양.
export interface ExamQuestionData {
  type: string
  question: string
  options?: string[]
  answer?: string
  explanation?: string
  passage?: string
  // 'order' 유형 전용: 배열할 문장들 (원래 순서 그대로, 번호는 화면에서 A/B/C… 로 붙인다)
  items?: string[]
  // 'match' 유형 전용: 좌우 짝짓기
  matchWords?: string[]
  matchMeanings?: string[]
  // 외부지문저장소 출처 — 중복 추가 방지 및 추적용 (DB 컬럼 추가 없음, 이 JSON 안에서만 사용)
  source?: 'external_passage'
  source_passage_id?: string
  source_kind?: ExamSourceKind
  source_index?: number
}

// 같은 문제를 다시 추가하려는 것인지 판단하기 위한 키.
export function externalSourceKey(passageId: string, kind: ExamSourceKind, index: number): string {
  return `external_passage:${passageId}:${kind}:${index}`
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

// 뒤 섞기는 "1칸씩 돌리기"만 사용한다 — 매번 무작위로 섞으면 다시 인쇄할 때마다 시험지가 달라져 버린다.
function rotateMeanings(meanings: string[]): string[] {
  if (meanings.length <= 1) return meanings
  return [...meanings.slice(1), meanings[0]]
}

function buildOrder(q: Extract<PassageQuestion, { type: 'order' }>): Pick<ExamQuestionData, 'items' | 'answer'> {
  const labels = q.items.map((_, i) => LABELS[i] ?? String(i + 1))
  const answerLabels = q.answer.map((sentence) => {
    const idx = q.items.indexOf(sentence)
    return idx === -1 ? '?' : labels[idx]
  })
  return { items: q.items, answer: answerLabels.join(' → ') }
}

function buildMatch(q: Extract<PassageQuestion, { type: 'match' }>): Pick<ExamQuestionData, 'matchWords' | 'matchMeanings' | 'answer'> {
  const matchWords = q.pairs.map((p) => p.word)
  const matchMeanings = rotateMeanings(q.pairs.map((p) => p.meaning))
  const answer = q.pairs
    .map((p, i) => `${i + 1}-${LABELS[matchMeanings.indexOf(p.meaning)] ?? '?'}`)
    .join(', ')
  return { matchWords, matchMeanings, answer }
}

// 외부지문 문제 1개(mc/blank/tf/order/match) 또는 서술형 1개를 시험 문항 모양으로 변환한다.
export function buildExternalExamQuestionData(
  passage: { id: string; body: string },
  kind: ExamSourceKind,
  index: number,
  item: PassageQuestion | PassageEssay,
): ExamQuestionData {
  const base = {
    passage: passage.body,
    source: 'external_passage' as const,
    source_passage_id: passage.id,
    source_kind: kind,
    source_index: index,
  }

  if (kind === 'essay') {
    const e = item as PassageEssay
    const limitNote = e.wordLimit ? ` (${e.wordLimit}자 이내)` : ''
    return {
      ...base,
      type: 'essay',
      question: `${e.q}${limitNote}`,
      answer: e.sampleAnswer,
      explanation: e.rubric,
    }
  }

  const q = item as PassageQuestion
  switch (q.type) {
    case 'mc':
      return { ...base, type: 'mc', question: q.q, options: q.choices, answer: q.answer, explanation: q.explanation }
    case 'blank':
      return { ...base, type: 'blank', question: q.q, answer: q.answer, explanation: q.explanation }
    case 'tf':
      return {
        ...base,
        type: 'tf',
        question: q.q,
        options: ['참', '거짓'],
        answer: q.answer ? '참' : '거짓',
        explanation: q.explanation,
      }
    case 'order':
      return { ...base, type: 'order', question: '다음 문장을 문맥에 맞게 순서대로 배열하시오.', ...buildOrder(q) }
    case 'match':
      return { ...base, type: 'match', question: '다음 단어와 뜻을 알맞게 연결하시오.', ...buildMatch(q) }
  }
}
