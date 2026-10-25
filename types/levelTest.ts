// 레벨테스트 (2026-10-25): 학년(초3~고3)마다 A형(초급~중급) · B형(중급~고급) 시험지.
// 시험지 내용은 data/level-tests/*.json (Claude Code 가 직접 작성, API 호출 없음), 응시 결과만 DB(level_test_results)에 저장한다.

export type LevelTestForm = 'A' | 'B'
export type LevelTestSection = 'vocab' | 'grammar' | 'reading' | 'writing'

// 문항 하나. mc = 객관식(보기 4개, answer = 정답 보기 번호 0~3) / write = 단어 쓰기·짧은 영작 (answer = 모범답, accept = 정답으로 인정할 답들)
export interface LevelTestItem {
  id: string // 시험지 안에서 고유 (예: "v1")
  section: LevelTestSection
  difficulty: 1 | 2 | 3 // 시험지 안에서의 난이도 (1 쉬움 · 3 어려움)
  type: 'mc' | 'write'
  prompt: string // 문제 (한국어 지시문 + 영어)
  stimulus?: string // 문제 아래에 크게 보여 줄 그림(이모지)·단어·문장
  passageId?: string // 독해 지문 (passages 의 id)
  choices?: string[]
  answer: number | string
  accept?: string[]
  hint?: string // 쓰기 문항 안내 (예: "첫 글자 c")
  points: number
  explanation: string
}

export interface LevelTestPassage {
  id: string
  title?: string
  text: string
}

export interface LevelTest {
  id: string // "e3-A"
  grade: string // "초3"
  form: LevelTestForm
  title: string
  description: string
  timeMinutes: number
  passages: LevelTestPassage[]
  items: LevelTestItem[]
}

// 학생이 고른/쓴 답: mc = 보기 번호, write = 쓴 글자. 안 푼 문항은 없음
export type LevelTestAnswers = Record<string, number | string>
// 쓰기 문항을 선생님이 직접 맞음/틀림으로 바꾼 것
export type LevelTestOverrides = Record<string, boolean>

export interface LevelTestSectionScore {
  section: LevelTestSection
  score: number
  max: number
  correct: number
  count: number
}

export interface LevelTestScore {
  total: number
  max: number
  percent: number
  sections: LevelTestSectionScore[]
  correctIds: string[]
}

export interface LevelTestRecommendation {
  band: string // 추천 반 (4단계: 학교형 / 일반학원형 / 상위학원형 / 선행형, 또는 기초반)
  summary: string // 한 줄 판정
  advice: string // 다음 할 일 (B형 추가 응시 권장 등)
}

// DB 한 줄 (level_test_results)
export interface LevelTestResultRow {
  id: string
  test_id: string
  grade: string
  form: LevelTestForm
  student_id: string | null
  student_name: string
  mode: 'paper' | 'online'
  answers: LevelTestAnswers
  overrides: LevelTestOverrides
  score: LevelTestScore
  recommendation: LevelTestRecommendation
  memo: string | null
  taken_at: string
  created_at: string
  updated_at: string
}
