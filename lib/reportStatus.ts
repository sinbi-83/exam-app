// 보고서 확인·발송 상태 (report-status-level-test-review-migration.sql).
// 확인 전(draft) → 확인함(checked) → 보냄(sent, 인쇄 / 학부모 조회 링크 / 문자·카톡).
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (scripts/ 에서 그대로 쓰기 위해).

export type ReportStatus = 'draft' | 'checked' | 'sent'
export type ReportSentVia = 'print' | 'parent_link' | 'message'

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: '확인 전',
  checked: '보낼 것',
  sent: '보냄',
}

export const REPORT_SENT_VIA_LABELS: Record<ReportSentVia, string> = {
  print: '인쇄',
  parent_link: '학부모 링크',
  message: '문자·카톡',
}

export function isReportStatus(v: unknown): v is ReportStatus {
  return v === 'draft' || v === 'checked' || v === 'sent'
}

export function isReportSentVia(v: unknown): v is ReportSentVia {
  return v === 'print' || v === 'parent_link' || v === 'message'
}

// 상태를 바꿀 때 함께 저장할 칸. 뒤로 되돌리면 그 뒤 단계의 날짜는 지운다.
export function reportStatusPatch(status: ReportStatus, via: ReportSentVia | null, nowIso: string): Record<string, string | null> {
  if (status === 'draft') return { status, checked_at: null, sent_at: null, sent_via: null }
  if (status === 'checked') return { status, checked_at: nowIso, sent_at: null, sent_via: null }
  return { status, sent_at: nowIso, sent_via: via }
}

// 새 칸이 아직 없을 때 (SQL 실행 전) Supabase 가 주는 오류
export function isColumnMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(error.message ?? '')
}
