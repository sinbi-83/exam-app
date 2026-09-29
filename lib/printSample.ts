// 인쇄 모양 확인용 예시 문항 (DB 에 저장하지 않는다). /tests/print-sample 화면과 인쇄 점검 스크립트가 쓴다.
// 혼합 시험과 같은 모양: 지문 1개 + 여러 유형 문항 + 단어 12개 (영→한 8, 한→영 4)
// 이 파일은 다른 모듈을 import 하지 않는다.

const PASSAGE = `Every morning, Mina walks her dog along the river before school. She says the quiet path helps her think clearly.
One day she noticed that the river was full of plastic bottles. She decided to do something about it.
She asked her classmates to join her, and soon twenty students were cleaning the riverbank every Saturday.
Their teacher was so impressed that she invited a local newspaper to write about the project.
Now the river is cleaner, and more people in the town have started to recycle.`

type Q = {
  id: string
  sort_order: number
  points: number
  question_data: Record<string, unknown> & { type: string; question: string }
}

const passageQs: Omit<Q, 'sort_order'>[] = [
  { id: 's1', points: 4, question_data: { type: 'vocab', question: '"quiet"의 의미로 가장 알맞은 것은?', options: ['조용한', '시끄러운', '빠른', '넓은', '어두운'], answer: '조용한', explanation: 'quiet = 조용한', passage: PASSAGE } },
  { id: 's2', points: 4, question_data: { type: 'grammar', question: '다음 문장의 빈칸에 들어갈 말로 어법상 알맞은 것은?\n\n"She asked her classmates _____ her, and soon twenty students were cleaning the riverbank every Saturday."', options: ['to join', 'join', 'joining', 'to joining', 'joined'], answer: 'to join', explanation: 'ask + 목적어 + to부정사', passage: PASSAGE } },
  { id: 's2b', points: 4, question_data: { type: 'grammar', question: '다음 문장의 밑줄 친 ①~⑤ 중 어법상 틀린 것은?\n\nThe students ①"who joined" the project ②"were" proud because the river ③"looked" much ④"more clean" than ⑤"before".', options: ['who joined', 'were', 'looked', 'more clean', 'before'], answer: 'more clean', explanation: 'clean 의 비교급은 cleaner', passage: PASSAGE } },
  { id: 's3', points: 4, question_data: { type: 'reading', question: '이 글의 주제로 가장 알맞은 것은?', options: ['강을 깨끗하게 만든 학생들의 활동이 마을을 바꾸었다', '아침 산책은 공부에 도움이 된다', '신문 기자가 되는 방법', '플라스틱 병을 만드는 과정', '토요일마다 해야 할 숙제'], answer: '강을 깨끗하게 만든 학생들의 활동이 마을을 바꾸었다', explanation: '글 전체 흐름', passage: PASSAGE } },
  { id: 's4', points: 4, question_data: { type: 'tf', question: '미나는 방과 후에 개를 산책시킨다.', options: ['참', '거짓'], answer: '거짓', explanation: 'before school', passage: PASSAGE } },
  { id: 's5', points: 4, question_data: { type: 'blank', question: '미나의 반 친구들은 매주 ______ 에 강가를 청소했다. (요일을 영어로)', answer: 'Saturday', explanation: 'every Saturday', passage: PASSAGE } },
  { id: 's6', points: 4, question_data: { type: 'summary', question: 'Mina and her classmates _____ the riverbank, and the town started to _____.', options: ['cleaned — recycle', 'painted — sing', 'closed — sleep', 'sold — travel', 'built — dance'], answer: 'cleaned — recycle', explanation: '요약', passage: PASSAGE } },
  { id: 's7', points: 5, question_data: { type: 'order', question: '다음 문장을 문맥에 맞게 순서대로 배열하시오.', items: ['She decided to do something about it.', 'She noticed plastic bottles in the river.', 'Twenty students cleaned the riverbank.'], answer: 'B → A → C', passage: PASSAGE } },
  { id: 's8', points: 5, question_data: { type: 'match', question: '다음 단어와 뜻을 알맞게 연결하시오.', matchWords: ['path', 'impressed', 'recycle'], matchMeanings: ['감명받은', '재활용하다', '길'], answer: '1-C, 2-A, 3-B', passage: PASSAGE } },
  { id: 's9', points: 6, question_data: { type: 'essay', question: '미나가 강을 청소하기로 결심한 이유를 우리말로 쓰시오. (30자 이내)', answer: '강에 플라스틱 병이 가득해서', explanation: '핵심: 플라스틱 병', passage: PASSAGE } },
  { id: 's10', points: 6, question_data: { type: 'essay', question: '주어진 단어를 모두 사용하여 "그들의 선생님은 매우 감명받았다"를 영작하시오. (so, impressed)', answer: 'Their teacher was so impressed.', explanation: '어순', passage: PASSAGE } },
]

const WORDS: [string, string, 'en_ko' | 'ko_en'][] = [
  ['abandon', '버리다', 'en_ko'], ['absorb', '흡수하다', 'en_ko'], ['ancient', '고대의', 'en_ko'], ['bargain', '싼 물건', 'en_ko'],
  ['capture', '포착하다', 'en_ko'], ['decade', '10년', 'en_ko'], ['extraordinary', '비범한', 'en_ko'], ['fierce', '사나운', 'en_ko'],
  ['auction', '경매', 'ko_en'], ['biology', '생물학', 'ko_en'], ['diplomat', '외교관', 'ko_en'], ['harvest', '수확', 'ko_en'],
]

const wordQs: Omit<Q, 'sort_order'>[] = WORDS.map(([expression, meaning, direction], i) => ({
  id: `w${i + 1}`,
  points: 4,
  question_data: {
    type: 'word',
    direction,
    question: direction === 'en_ko' ? expression : meaning,
    answer: direction === 'en_ko' ? meaning : expression,
    accepted_answers: [direction === 'en_ko' ? meaning : expression],
    expression,
    meaning_ko: meaning,
    source: 'vocabulary_bank',
    source_vocabulary_entry_id: `sample-${i + 1}`,
  },
}))

export const SAMPLE_PRINT_QUESTIONS: Q[] = [...passageQs, ...wordQs].map((q, i) => ({ ...q, sort_order: i }))
export const SAMPLE_WORD_COUNT = WORDS.length
