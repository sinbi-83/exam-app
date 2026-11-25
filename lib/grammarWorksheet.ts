// Local review fixtures, not published question-bank items or external passage sets.
export const grammarGoals = [
  { id: 'noun', label: '명사적 용법', description: '주어·목적어·보어로 쓰인 to부정사를 확인합니다.' },
  { id: 'adjective', label: '형용사적 용법', description: '앞의 명사를 꾸미는 관계를 확인합니다.' },
  { id: 'purpose', label: '부사적 용법: 목적', description: '어떤 행동을 하는 목적을 표현합니다.' },
] as const
export type GrammarGoal = typeof grammarGoals[number]['id']
export type PracticeItem = {
  fixtureId: string; goal: GrammarGoal; activity: '고르기' | '조건 영작' | '문장 전환';
  prompt: string; choices?: string[]; answer: string; explanation: string; rubric: string;
}
// Teacher approved these exact contents in chat. Any content edit invalidates approval.
const reviewFingerprint = (q: PracticeItem) => JSON.stringify([q.prompt, q.choices, q.answer, q.explanation, q.rubric, q.goal, q.activity])
export function grammarReviewKey(q: PracticeItem) { return q.fixtureId + ':' + reviewFingerprint(q) }
export const teacherApprovedGrammarIds = ['review-n1', 'review-n2', 'review-n3'] as const
export const grammarPractice: PracticeItem[] = [
  { fixtureId: 'review-n1', goal: 'noun', activity: '고르기', prompt: '밑줄 대신 [ ]로 표시한 부분이 문장의 목적어인 것을 고르세요.', choices: ['She wants [to learn English].', 'I have a book [to read].', 'He ran [to catch the bus].', 'We need a chair [to sit on].', 'She went out [to buy milk].'], answer: '① She wants to learn English.', explanation: 'to learn English는 wants의 목적어로 쓰였습니다. ②·④는 명사를 꾸미고 ③·⑤는 목적을 나타냅니다.', rubric: '① 선택 시 정답.' },
  { fixtureId: 'review-n2', goal: 'noun', activity: '조건 영작', prompt: '“나는 영어를 배우기를 원한다.”를 영작하세요.\n조건: I로 시작하고 want, learn, English를 각각 한 번 사용하세요. 필요하면 단어를 추가하세요.', answer: 'I want to learn English.', explanation: 'want의 목적어로 to learn English를 씁니다.', rubric: 'I want 1점 / to learn English 1점. 총 2점. 대소문자·마침표만의 차이는 감점하지 않습니다.' },
  { fixtureId: 'review-n3', goal: 'noun', activity: '문장 전환', prompt: '같은 뜻이 되도록 빈칸에 알맞은 말을 쓰세요.\nLearning English is fun.\n→ _____ English is fun.\n조건: to부정사를 사용하세요.', answer: 'To learn', explanation: '동명사 주어 Learning English를 to부정사 주어 To learn English로 바꿉니다.', rubric: '빈칸에 To learn을 쓰면 정답. 문장 전체를 바르게 써도 인정합니다.' },
  { fixtureId: 'review-a1', goal: 'adjective', activity: '고르기', prompt: '[ ] 부분이 앞의 명사를 꾸미는 것을 고르세요.', choices: ['I want [to rest].', 'She came [to help me].', 'He has homework [to finish].', '[To swim] is fun.', 'They left early [to catch the train].'], answer: '③ He has homework to finish.', explanation: 'to finish는 앞의 명사 homework를 꾸밉니다.', rubric: '③ 선택 시 정답.' },
  { fixtureId: 'review-a2', goal: 'adjective', activity: '조건 영작', prompt: '“나는 읽을 책이 한 권 있다.”를 영작하세요.\n조건: I로 시작하고 have, a book, read를 각각 한 번 사용하세요. to부정사로 book을 꾸미세요.', answer: 'I have a book to read.', explanation: '읽을 대상인 book 뒤에 to read를 둡니다.', rubric: 'I have a book 1점 / to read의 올바른 연결 1점. 총 2점. 대소문자·마침표만의 차이는 감점하지 않습니다.' },
  { fixtureId: 'review-a3', goal: 'adjective', activity: '문장 전환', prompt: '같은 뜻이 되도록 빈칸을 채우세요.\nI need something that I can drink.\n→ I need something _____.\n조건: to부정사를 사용하세요.', answer: 'to drink', explanation: 'something을 꾸미는 that I can drink를 to drink로 바꿉니다.', rubric: 'to drink를 쓰면 정답. 문장 전체를 바르게 써도 인정합니다.' },
  { fixtureId: 'review-p1', goal: 'purpose', activity: '고르기', prompt: '[ ] 부분이 “~하기 위해서”라는 목적을 나타내는 것을 고르세요.', choices: ['I hope [to see you].', 'She has letters [to write].', '[To read] is enjoyable.', 'He went to the library [to study].', 'Her dream is [to be a pilot].'], answer: '④ He went to the library to study.', explanation: '도서관에 간 목적이 공부하는 것이므로 목적의 부사적 용법입니다.', rubric: '④ 선택 시 정답.' },
  { fixtureId: 'review-p2', goal: 'purpose', activity: '조건 영작', prompt: '“나는 우유를 사기 위해 가게에 갔다.”를 영작하세요.\n조건: I went로 시작하고 the store, buy, milk를 각각 한 번 사용하세요. 목적을 나타내는 to부정사를 사용하세요.', answer: 'I went to the store to buy milk.', explanation: 'to buy milk가 가게에 간 목적을 나타냅니다.', rubric: 'I went to the store 1점 / to buy milk의 올바른 연결 1점. 총 2점. To buy milk, I went to the store.는 시작 조건이 달라 만점으로 인정하지 않습니다.' },
  { fixtureId: 'review-p3', goal: 'purpose', activity: '문장 전환', prompt: '같은 뜻이 되도록 빈칸을 채우세요.\nShe saved money because she wanted to buy a bike.\n→ She saved money _____.\n조건: 목적을 나타내는 to부정사를 사용하세요.', answer: 'to buy a bike', explanation: '돈을 모은 목적을 to buy a bike로 표현합니다.', rubric: 'to buy a bike를 쓰면 정답. 문장 전체를 바르게 써도 인정합니다.' },
]
export function selectGrammarItems(goals: readonly string[], activity: string = 'all') {
  return grammarPractice.filter(q => goals.includes(q.goal) && (activity === 'all' || q.activity === activity))
}
