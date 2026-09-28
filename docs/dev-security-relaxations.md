# 개발 기간 동안 풀어 둔 설정 (보안 되돌리기 기준 문서)

- 만든 날: 2026-09-28
- 용도: 개발이 끝나고 향미 선생님이 **"보안 되돌려 줘"**라고 하면, 이 문서의 표를 기준으로 하나씩 되돌리고 보안 점검 목록을 만든다.
- 규칙: 편의 때문에 새로 푸는 설정이 생기면 **이 문서에 바로 추가**한다. (날짜 · 무엇을 · 왜 · 되돌리는 방법)

## 개발 기간 중에도 계속 지키는 것

1. DB 데이터를 바꾸거나 지우기 전에는 반드시 백업부터 한다 (`backups/`, git 에는 올리지 않음).
2. 비밀번호·키 파일(`.env`, `.env.local` 등)은 절대 커밋하지 않는다. (2026-09-28 확인: `.env.local` 은 `.gitignore` 로 제외되어 있고 git 기록에 한 번도 올라간 적 없음)
3. 기존 표 구조를 바꾸는 migration 은 승인받고 실행한다. 새 표 추가는 미리 승인됨.

## 1. 지금 풀어 둔 설정

| # | 날짜 | 무엇을 풀었나 | 왜 | 되돌리는 방법 |
|---|---|---|---|---|
| 1 | 2026-09-20 (설정 파일 기준) · 2026-09-28 사용 확인 | **프로젝트 폴더 밖 읽기 허용**: `.claude/settings.local.json` 의 `permissions.additionalDirectories` 에 `C:\Users\SHM\Desktop` | 바탕화면에 둔 원본 파일(공식 기본어휘 CSV 등)을 Claude Code 가 읽기 위해 | `.claude/settings.local.json` 에서 `additionalDirectories` 항목 삭제 (또는 파일 삭제) |
| 2 | 2026-09-28 | **Claude Code 자동 모드(auto mode)** 사용 — 명령·파일 수정을 매번 묻지 않고 실행 | 확인 부담 줄이기 (개발 기간 운영 방침) | Claude Code 에서 권한 모드를 기본(매번 확인)으로 되돌림 (`Shift+Tab` 으로 모드 전환, 또는 `/permissions`) |
| 3 | 2026-09-28 | **Claude Code 가 향미 선생님 계정으로 DB 에 직접 접속**: 스크립트가 `.env.local` 의 `SUPABASE_LOGIN_EMAIL` / `SUPABASE_LOGIN_PASSWORD` 로 로그인해 읽기·쓰기 (1단계 상태 바로잡기, 3단계 기준표 넣기, 조사용 읽기) | migration 뒤 데이터 적용·검증을 사람 손 없이 하기 위해 | 개발 끝나면 Supabase 비밀번호 변경 → `.env.local` 의 두 줄 삭제 (스크립트가 필요할 때만 다시 넣기) |
| 4 | 2026-09-28 | **Claude Code 가 GitHub push → Vercel 배포 실행** (이 PC 에 저장된 git 인증 사용) | "배포해줘" 요청 시 바로 반영하기 위해 | 필요하면 GitHub 토큰 권한 축소·재발급. 배포는 계속 "요청이 있을 때만" 규칙 유지 |
| 5 | 이전부터 | `.claude/settings.json` 의 **SessionStart hook** — 세션 시작 때 `npm run dev` 자동 실행 | 개발 서버 자동 시작 | 해당 hook 삭제. (참고: 경로가 `/home/user/exam-app` 로 되어 있어 이 Windows PC 에서는 실제로 동작하지 않는다) |
| 6 | 2026-09-29 | **셸 명령 허락 창 생략**: `.claude/settings.local.json` 의 `permissions.allow` 에 `Bash(git:*)`, `Bash(npm:*)`, `Bash(npx:*)`, `Bash(node:*)` 추가 — git(push 포함)·npm·npx·node 명령을 묻지 않고 실행 | 자동 모드를 쓸 수 없어 허락 창이 너무 자주 떠서 (향미 선생님 요청) | `.claude/settings.local.json` 의 `allow` 에서 이 네 줄 삭제 |

## 2. 개발 중이라 느슨하게 두었지만 "풀어 둔 설정"은 아닌 것 (보안 점검 때 같이 볼 것)

| 항목 | 지금 상태 | 점검 때 할 일 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` 가 `.env.local` 에 있음 | 코드 어디서도 쓰지 않음 (2026-09-28 검색) | 필요 없으면 `.env.local` 에서 삭제. 이 키는 모든 RLS 를 무시하므로 절대 Vercel 브라우저용 변수(`NEXT_PUBLIC_…`)로 두지 않는다 |
| `ANTHROPIC_API_KEY` | AI 지문 생성·보고서 생성에서 사용 (서버에서만) | 사용 안 하게 되면 Vercel 환경변수와 `.env.local` 에서 삭제, Anthropic 콘솔에서 키 폐기 |
| `exam_sheets` 예전 "누구나 읽기·쓰기" 정책 | `exam-sheets-rls-fix-migration.sql` 로 닫는 파일이 있음 | Supabase 에서 실제 정책이 `exam_sheets_own` 인지 확인 |
| `POST /api/exam-questions` | 문항을 넣을 때 `exam_id` 가 본인 시험인지 서버에서 확인하지 않음 (RLS 가 `user_id` 만 봄) | 본인 시험인지 확인하는 코드 추가 검토 |
| Vercel 배포 보호(Vercel 로그인 필요) | 켜져 있음 → 외부인이 앱 주소로 들어올 수 없음. 대신 Claude Code 도 실제 앱 화면을 직접 확인하지 못함 | 유지 권장. 학부모 링크(`/parent/[id]`)를 외부에 쓸 계획이면 그때 정책 결정 |
| `backups/` 폴더 | DB 값이 들어 있는 백업 파일 (git 제외) | 개발 끝나면 보관할 것만 남기고 삭제 |

## 3. 되돌리기 요청이 오면 할 순서

1. 위 1번 표를 위에서부터 되돌리고, 되돌린 날짜를 표에 적는다.
2. 2번 표 항목을 하나씩 점검해 결과를 적는다.
3. `git log` 로 비밀값이 커밋된 적 없는지 다시 확인한다 (`git log --all -- .env .env.local`).
4. 점검 목록(무엇을 확인했고 무엇이 남았는지)을 짧게 보고한다.
