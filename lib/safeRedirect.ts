// 로그인 뒤 "원래 가려던 곳"으로 보낼 때 쓰는 주소 검사 (대시보드 1단계, 2026-10-27).
// 앱 안 주소(/로 시작)만 허용한다. "//evil.com", "/\evil.com", "https://…", 빈 값처럼
// 다른 사이트로 나갈 수 있는 값은 전부 기본 화면(/dashboard)으로 바꾼다.
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 에서 그대로 쓰기 위해).

export const DEFAULT_AFTER_LOGIN = '/dashboard'

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_LOGIN
  // 브라우저는 주소 속 탭·줄바꿈을 지우고 읽는다 ("/\t/evil.com" → "//evil.com") → 제어 문자가 있으면 거절
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_AFTER_LOGIN
  if (!raw.startsWith('/')) return DEFAULT_AFTER_LOGIN
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_AFTER_LOGIN
  // 마지막 확인: 실제로 풀어 봐서 같은 사이트 안 주소인지
  try {
    const base = 'http://app.local'
    const url = new URL(raw, base)
    if (url.origin !== base) return DEFAULT_AFTER_LOGIN
    // 로그인 화면으로 돌아가면 다시 로그인 화면이 뜨므로 기본 화면으로
    if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return DEFAULT_AFTER_LOGIN
    return url.pathname + url.search + url.hash
  } catch {
    return DEFAULT_AFTER_LOGIN
  }
}
