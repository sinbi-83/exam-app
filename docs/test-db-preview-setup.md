# 시험용 Supabase와 Preview 분리 절차

작성 2026-11-02. 목적: 반 관리 Preview를 운영 DB와 분리해 시험한다.
운영 환경변수와 운영 DB는 이 절차에서 건드리지 않는다.

## 1. 현재 위험

- [사실] Vercel의 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`가 Production and Preview로 설정되어 있다. 지금 브랜치를 push하면 Preview가 운영 DB와 실제 AI 키를 쓴다.
- [사실] `.env.local`도 운영 DB를 가리킨다. 저장소의 기존 스크립트는 전부 이 파일을 읽는다.
- [사실] Git 연결 프로젝트는 브랜치를 push하면 Preview 빌드가 자동으로 시작된다.

## 2. 설계

| 항목 | 방법 | 이유 |
|---|---|---|
| 시험용 DB | 새 Supabase 프로젝트 `exam-app-test` | 운영 자료와 완전히 분리 |
| Supabase 연결 | 공식 MCP를 `project_ref`로 시험용 프로젝트에만 연결 | 키와 SQL을 사람이 옮기지 않는다. 연결이 운영 프로젝트에 닿지 않는다 |
| Preview 설정 | `next.config.js`가 Preview 빌드에서만 시험용 값을 코드에 넣음 | Vercel 로그인과 변수 변경이 필요 없다 |
| AI 키 | Preview에는 `disabled-on-preview` | 반 관리 시험에 AI는 필요 없고, 비용이 나가지 않는다 |
| 빌드 차단 | `config/previewGuard.js` | 잘못된 값이나 운영 값이 결과 파일에 있으면 빌드가 실패한다 |
| SQL 차단 | `.oneline.sql` 맨 앞 검사 | 다른 DB에서 실행되어도 아무것도 바뀌지 않고 멈춘다 |
| 스크립트 차단 | `npm run test-db` | 운영과 주소·키를 비교하고, 시험용 표시 표까지 확인한 뒤에만 쓴다 |

## 3. 순서

2026-11-02 향미 선생님 지시로 절차를 바꿨다. 향미 선생님은 SQL, 키, Vercel 변수를 다루지 않는다.

| # | 담당 | 할 일 | 통과 기준 |
|---:|---|---|---|
| 1 | 향미 | 프로젝트 `exam-app-test` 만들기 | 완료 (Healthy 확인) |
| 2 | 향미 | 프로젝트 화면 주소를 채팅에 붙여넣기 (ref 는 비밀값이 아니다) | ref 확인 |
| 3 | 개발 | `claude mcp add --scope local --transport http supabase-test "https://mcp.supabase.com/mcp?project_ref=<ref>&features=database,development"` | `project_ref` 없는 연결은 만들지 않는다 |
| 4 | 향미 | `/mcp` → `supabase-test` → Authenticate → 브라우저에서 승인 | 연결됨 |
| 5 | 개발 | `exam-app-test` 인지 확인, 공개 키를 `.env.test-db.local` 에 기록, `01-schema.oneline.sql` 실행 | `npm run test-db -- check` 통과 |
| 6 | 개발 | `npm run test-db -- account-sql` 의 SQL 실행, `npm run test-db -- seed` | 시험 계정 2개, 가짜 학생 4명 |
| 7 | 개발 | `02-class-management.oneline.sql` 실행, `npm run test-db -- smoke` | 전부 통과 |
| 8 | 개발 | `config/previewSupabase.json` 에 ref 와 공개 키 기록, 복사본에서 Preview 빌드 재검증, 커밋 | `npm run test-test-db-setup` 통과 |
| 9 | 개발 | 이 브랜치만 push. `main`은 건드리지 않는다 | GitHub 상태 API 에서 Vercel 성공 |
| 10 | 향미 | Preview 주소에서 시험 계정 로그인, 반 관리 화면 확인 | 가짜 학생 4명만 보임. 운영 학생이 보이면 즉시 중단 |

## 4. Preview가 시험용 DB만 쓰게 하는 방법

Vercel 변수는 고치지 않는다. Preview 빌드일 때만 `next.config.js`가 `config/previewSupabase.json`의 값을 코드에 넣는다. 저장소가 공개이므로 이 파일에는 주소와 공개 키만 넣는다. 비밀키(service_role)는 쓰지 않고 어디에도 넣지 않는다.

Preview 빌드는 다음 경우 실패한다.
- 시험용 값이 비었거나, Vercel이 주는 운영 주소·키와 같을 때
- 공개 키 칸에 비밀키 형식이 들어 있을 때
- 결과 파일에 Vercel이 준 운영 주소·키·AI 키가 하나라도 들어 있을 때

## 5. 멈추는 조건

아래 중 하나라도 나오면 다음 단계로 가지 않는다.

- SQL 실행 결과에 `STOP:`이 나옴 → 프로젝트를 잘못 고른 것이다. 아무것도 바뀌지 않았다.
- `npm run test-db`가 "운영과 같습니다"로 멈춤
- Preview 빌드가 `[preview-guard]`로 실패 → 의도된 차단이다. 4장의 설정을 확인한다.
- MCP로 확인한 프로젝트 이름이 `exam-app-test`가 아님 → 아무것도 실행하지 않고 연결을 지운다.
- Preview에 가짜 학생 외의 학생이 보임 → 즉시 중단한다.

## 6. 남는 위험

- **이 코드가 없는 브랜치의 Preview는 여전히 운영 DB를 쓴다.** 안전장치가 없는 옛 브랜치(`claude/resume-program-x1vduw`, `feature/phase1-auth-layout`)는 push나 Redeploy를 하면 운영 DB로 연결된다. 이 브랜치 외에는 push하지 않는다.
- **근본 해결은 기존 3개 항목에서 Preview 체크를 빼는 것이다.** 운영 값은 그대로지만 운영 항목을 고치는 일이라 검토자 승인이 필요하다. 이번 시험 뒤 결정한다.
- **옛 Preview 배포는 그대로다.** 새 코드는 새 배포에만 적용된다.
- **차단 장치는 `VERCEL_ENV`로 Preview를 알아본다.** Vercel의 시스템 변수 자동 노출을 끄면 이 코드가 동작하지 않아 Preview가 운영 값으로 빌드된다. Claude는 Vercel 로그와 화면을 볼 수 없으므로 10번의 화면 확인을 생략하지 않는다.
- **시험용 주소와 공개 키는 공개 저장소에 올라간다.** 원래 브라우저에 노출되는 값이고 시험용 DB에는 가짜 자료만 둔다.

## 7. 시험용 DB가 운영과 다른 점

운영 메타데이터(2026-11-02 조회 CSV)의 외래키·인덱스·정책·RLS 159행과 비교했다. 표에 적은 것 외에는 이름이 모두 일치한다.

| 항목 | 내용 | 영향 |
|---|---|---|
| 표 5개의 칸 타입·필수 여부·기본값 | `students`, `exams`, `exam_results`, `question_sets`, `questions`는 코드에서 추정 [추정] | 저장 규칙이 달라 운영에서만 나는 오류는 못 잡을 수 있다 |
| 표 5개의 정책 조건 | `students`만 확인, 나머지는 같은 형태로 추정 [추정] | 위와 같음 |
| `exam_sheets`의 `Authenticated users can ...` 정책 4개 | 조건을 몰라 넣지 않음 | 다른 계정 차단 시험 결과를 운영에 그대로 적용할 수 없다 (`docs/security-backlog.md`) |
| `academies` | `id` 칸만 있음 | 코드가 쓰지 않음 |
| `_test_db_marker` | 시험용에만 있음 | 시험용 확인 표시 |
| 자료 | 가짜 학생만 있음 | 건수가 많을 때의 문제는 못 잡음 |

이 차이 때문에 시험용 통과가 운영 적용의 안전을 보장하지는 않는다. 운영 적용 전 절차(백업, 적용 전 확인)는 `docs/class-management-plan.md` 그대로 지킨다.

## 8. 검증 상태

| 항목 | 상태 |
|---|---|
| SQL 3개를 메모리 Postgres(PGlite)에 실행: 운영 차단, 적용, 계정 간 차단, 퇴원, 되돌리기, 재적용 | 통과. Supabase 일부는 흉내 낸 것 |
| 코드가 쓰는 표 28개 존재 | 통과 |
| `npm run test-test-db-setup` (차단 규칙) | 통과 |
| 복사본 실제 `next build`, 가짜 운영 값 + Preview | 통과. 결과 파일에 시험용 값만 있고 가짜 운영 주소·키·AI 키는 0개 |
| 복사본 빌드, 코드에 운영 값을 숨겨 둠 | 빌드 실패로 차단 확인 |
| 복사본 빌드, Production | 통과. Vercel 값 그대로, 시험용 값 0개 |
| 실제 Supabase에 SQL 적용 | 2026-11-04 완료. `01`, `02`는 MCP 확인 창이 자동 취소되어 향미 선생님이 SQL 화면에서 실행 |
| `npm run test-db -- check`, `account-sql`, `seed`, `smoke` | 2026-11-04 통과. smoke 10개 항목 전부 통과. smoke 자료(퇴원 학생 1명, 시험반 1개)가 `teacher-a`에 남아 있음 |
| 실제 Vercel Preview | **안 함** (9번에서 확인) |

## 9. 되돌리기

`claude mcp remove supabase-test`로 연결을 지우고, Supabase의 `exam-app-test` 프로젝트를 지우면 된다. 운영과 Vercel 설정에는 남는 것이 없다.

SQL 원본을 고치면 `npm run build-test-db-sql`로 `.oneline.sql`을 다시 만든다.
