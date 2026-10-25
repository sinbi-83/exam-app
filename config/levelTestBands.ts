// 레벨테스트 추천 반 기준표 (2026-10-25 기본값 — 실제 응시 결과를 보며 향미 선생님이 조정).
// 점수는 100점 만점 백분율. 위에서부터 처음 맞는 구간을 쓴다 (min 이상).
// A형 = 초급~중급 시험지 → 주로 기초반~일반학원형 판정, 잘 보면 B형 추가 응시 권장
// B형 = 중급~고급 시험지 → 주로 일반학원형~선행형 판정, 너무 낮으면 A형으로 다시 판정

import type { LevelTestForm } from '@/types/levelTest'

export interface LevelTestBand {
  min: number
  band: string
  summary: string
  advice: string
}

export const LEVEL_TEST_BANDS: Record<LevelTestForm, LevelTestBand[]> = {
  A: [
    { min: 85, band: '일반학원형', summary: '기초가 탄탄해 학년 수준 수업을 충분히 따라갈 수 있어요.', advice: 'B형을 추가로 응시해 상위반 가능성을 확인하세요.' },
    { min: 65, band: '일반학원형', summary: '학년 수준의 기본기를 갖추고 있어요.', advice: '틀린 영역을 보충하며 일반학원형 수업을 권장합니다.' },
    { min: 40, band: '학교형', summary: '기본 단어·문장은 알지만 빈 곳이 있어요.', advice: '학교형 수업으로 기본기를 다지는 것을 권장합니다.' },
    { min: 0, band: '기초반', summary: '아래 학년 내용부터 차근차근 다시 잡아야 해요.', advice: '아래 학년 기초(알파벳·기초 단어·기본 문장)부터 시작하세요.' },
  ],
  B: [
    { min: 80, band: '선행형', summary: '학년보다 앞선 수준의 실력을 갖추고 있어요.', advice: '선행형 수업으로 다음 학년 내용을 미리 다루는 것을 권장합니다.' },
    { min: 60, band: '상위학원형', summary: '학년 수준을 넘어 심화 내용도 잘 해결해요.', advice: '상위학원형 수업을 권장합니다.' },
    { min: 35, band: '일반학원형', summary: '학년 수준은 갖추었지만 심화 문항에서 실수가 있어요.', advice: '일반학원형 수업에서 심화 문항을 조금씩 늘려 가세요.' },
    { min: 0, band: '학교형', summary: 'B형(중급~고급)은 아직 어려워요.', advice: 'A형을 응시해 정확한 출발 반을 정하세요.' },
  ],
}

// 영역별 강점·약점 기준 (영역 백분율)
export const LEVEL_TEST_STRENGTH_MIN = 80
export const LEVEL_TEST_WEAKNESS_MAX = 59
