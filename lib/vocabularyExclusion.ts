// 영구 제외 전 자동 경고문 (설계도 C-1). AI 없이 DB 조회 결과(사실)만으로 만든다.
// 해당하는 경고만 돌려준다 — 경고가 없으면 빈 배열.
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 테스트 스크립트에서 그대로 쓰기 위해).

export interface ExclusionFacts {
  base_difficulty: number | null
  official_source_count: number // source_type = 'official' 출처 수
  official_tier_label: string | null // 공식 기본어휘 기준표 등급 (기준표에 없으면 null)
  grade_bands: string[] // 이 난이도가 들어가는 학년 범위 이름 (예: '중1 학교형')
  exam_count: number // 이 단어가 출제된 저장 시험 수
  exam_question_count: number // 출제된 문항 수
  same_spelling_meanings: string[] // 같은 철자의 다른 항목 대표 뜻
  source_count: number // 출처 수 (검수·승인 기록 행 제외)
  approval_origin_label: string | null // 과거 승인 경로 (없으면 null)
}

export function exclusionWarnings(f: ExclusionFacts): string[] {
  const out: string[] = []
  if (f.official_tier_label) {
    out.push(`공식 기본어휘(${f.official_tier_label})에 포함된 단어입니다.`)
  } else if (f.official_source_count > 0) {
    out.push('공식 기본어휘에 포함된 단어입니다.')
  }
  if (f.base_difficulty !== null && f.grade_bands.length > 0) {
    out.push(`난이도 ${f.base_difficulty}은(는) ${f.grade_bands.join(', ')} 범위 안에 있습니다. 쉬움·어려움은 학년 범위가 처리합니다.`)
  }
  if (f.exam_count > 0) {
    out.push(`저장된 시험 ${f.exam_count}개(${f.exam_question_count}문항)에 출제된 적이 있습니다. 이미 저장된 시험은 바뀌지 않습니다.`)
  }
  if (f.same_spelling_meanings.length > 0) {
    out.push(`같은 철자의 다른 뜻(${f.same_spelling_meanings.join(', ')})은 영향을 받지 않습니다.`)
  }
  if (f.source_count > 0) {
    out.push(`출처가 ${f.source_count}개 있습니다.`)
  }
  if (f.approval_origin_label) {
    out.push(`과거 승인 이력이 있습니다 (${f.approval_origin_label}).`)
  }
  return out
}

// 영구 제외 확인 창 문구
export function exclusionConfirmText(expression: string, reasonLabel: string, warnings: string[]): string {
  const lines = [`'${expression}'을(를) 영구 제외합니다.`, `사유: ${reasonLabel}`, '']
  if (warnings.length > 0) {
    lines.push('확인할 점:')
    for (const w of warnings) lines.push(`• ${w}`)
    lines.push('')
  }
  lines.push('영구 제외하면 시험에 나오지 않고, 같은 표현+품사+뜻은 다시 자동으로 들어오지 않습니다.')
  return lines.join('\n')
}
