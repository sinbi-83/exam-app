// 카피라이트 문구 (한 곳에서만 관리한다).
//
// - 교습소 이름은 반드시 "보스턴S영어". 교습소는 법적으로 "학원" 명칭을 쓸 수 없다.
//   ("일반학원형", "상위학원형"은 레벨 이름이라 그대로 둔다.)
// - 연도: 2026년에는 "2026", 이후에는 "2026–올해" (예: 2028년 → "2026–2028").
// - 넣지 않는 곳: 외부지문 저장소 화면(출판사·교과서 지문), 출석·숙제·채점·원비 같은 내부 관리 화면.
//
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 테스트에서 그대로 쓰기 위해).

export const COPYRIGHT_OWNER = '보스턴S영어 · 서향미'
export const COPYRIGHT_START_YEAR = 2026

export function copyrightYears(now: Date = new Date()): string {
  const year = now.getFullYear()
  return year <= COPYRIGHT_START_YEAR ? String(COPYRIGHT_START_YEAR) : `${COPYRIGHT_START_YEAR}–${year}`
}

// 앱 전체 하단 (로그인 화면 포함)
export function copyrightLine(now?: Date): string {
  return `© ${copyrightYears(now)} ${COPYRIGHT_OWNER}`
}

export type CopyrightTarget = 'vocabulary' | 'questions' | 'exam' | 'report'

const TARGET_TEXT: Record<CopyrightTarget, string> = {
  vocabulary: '이 단어 데이터베이스',
  questions: '이 문제 데이터베이스',
  exam: '이 시험지',
  report: '이 보고서',
}

// 단어은행 / 문제은행 / 시험지·인쇄물 / 성적 보고서
export function copyrightNotice(target: CopyrightTarget, now?: Date): string {
  return `${copyrightLine(now)}. ${TARGET_TEXT[target]}의 무단 복제·배포를 금지합니다.`
}
