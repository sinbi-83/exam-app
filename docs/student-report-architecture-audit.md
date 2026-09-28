# 학생관리 / 학부모 보고서 구조조사 (STEP: 조사 전용)

- 작성일: 2026-09-23
- 범위: 코드/DB 스키마 전수조사. **기능 추가, DB migration, UI 변경, 배포 없음.**
- 결론 요약: 향후 계획했던 `학생 → 시험출제 → 문제선택 → 시험 → 결과 → 학생기록 → 학부모보고서` 파이프라인은
  **이미 대부분 구현되어 있다.** 새로 설계할 필요는 없고, 기존 테이블·API를 재사용하면서 몇 군데 "연결"과
  "정리"만 하면 되는 상태다. 아래에 근거를 정리한다.

---

## 1. 학생관리 조사

| 항목 | 위치 |
|---|---|
| 목록/등록/수정/삭제 페이지 | `app/students/page.tsx` (단일 페이지, `'use client'`) |
| API | `app/api/students/route.ts` (GET 목록 / POST 등록), `app/api/students/[id]/route.ts` (PATCH 수정 / DELETE 삭제) |
| DB 테이블 | `students` — **주의:** 리포에 체크인된 migration 파일이 없다. 다른 테이블들(`FOREIGN KEY REFERENCES students(id)`)로 존재는 확인되지만, `students` 자체의 `CREATE TABLE` 문은 어느 `*.sql` 파일에도 없다 → Supabase 대시보드에서 초기에 직접 만든 테이블로 추정 (스키마 드리프트, §4 참고) |
| 저장되는 필드 (API select 기준) | `id, name, grade, pin, created_at, school_name, student_phone, parent_phone, enrolled_at, notes`, `user_id`(RLS용) |
| 학생 상세/펼침 구조 | `students/page.tsx` 내 `expandedId` state로 카드 클릭 시 펼침(별도 상세 페이지 없음). 펼친 상태에서 인라인 수정 폼(`StudentForm` 컴포넌트 재사용)으로 바로 수정 가능 |
| 성적 버튼 연결 위치 | `students/page.tsx:327` → `<Link href={'/analytics?student_id='+id}>📈 성적</Link>` — `/analytics` 페이지(반 평균·개인 추이·유형별 취약점, `exam_results` 기반)로 이동 |
| 보고서 버튼 연결 위치 | `students/page.tsx:332` → `<Link href={'/report?student_id='+id}>📝 보고서</Link>` — `/report` 작성 폼으로 이동, `student_id` 쿼리로 학생 자동 선택 |
| 기타 | PIN 4자리 자동 생성(`generatePin()`), 학부모 조회 링크/안내문 복사 기능(`/parent/[id]` 로 연결) |

**결론:** 학생관리는 CRUD·검색·펼침카드·연동 버튼까지 이미 완결된 기능이다. 실제 DB(`students`)에 정상 저장되고, 인증된 사용자(`user_id`) 단위로 RLS 격리된다.

---

## 2. 보고서 기능 조사

파일: `app/report/page.tsx`(작성 폼), `app/api/reports/route.ts`(저장 API), `app/api/generate-report/route.ts`(AI 초안), `app/report/print/page.tsx`(인쇄), `app/reports/page.tsx`(저장된 보고서 목록)

| 화면 항목 | DB 저장 여부 | 실제 소스 |
|---|---|---|
| 학생 선택 | 저장됨 (`reports.student_id`, `student_name`, `student_grade`) | `/api/students` 목록에서 선택, `students` 테이블 실시간 조회 |
| 시험 선택 | 저장됨 (`reports.exam_id`, `exam_title`) | `/api/exams` 목록, `exams` 테이블. 선택 시 `max_score`/`exam_date` 자동 채움. 직접입력(시험 미선택)도 가능 |
| 시험일 / 총점 | 저장됨 (`exam_date`, `score`, `max_score`) | 사용자가 직접 입력하거나 시험 선택 시 자동 채움. `exam_results`와 자동 연결되지는 않음(§4) |
| 담당교사 | 저장 시도됨 (`reports.teacher`) | **UI 자유 텍스트 입력.** DB 어디에도 "교사명" 소스가 없음 — `academy_settings`에도 필드 없음 (§5) |
| 영역별 점수(어휘/어법/독해/지문요약/서술형) | 저장됨 (`reports.type_scores` jsonb) | 순수 UI 수동 입력. `exam_questions`/`wrong_answer_records` 기반 유형별 정답률(§4의 analytics 로직)과는 **연결 안 됨** |
| 강점/보완/학습계획/어휘·어법·독해 메모(③, AI 입력용 원본) | **DB 저장 안 됨** | 순수 UI 상태(휘발). AI 프롬프트 재료로만 쓰이고 제출 시 사라짐 |
| AI 초안 생성 결과(강점/보완/학습계획/어휘·어법·독해 분석, ④ 최종본) | 저장됨 (`strengths, comment, next_steps, vocab_analysis, grammar_analysis, reading_analysis`) | AI가 채운 뒤 교사가 textarea에서 직접 수정 가능한 "최종 편집본" |
| AI 초안 버튼 | — | `POST /api/generate-report` 호출 → **Anthropic Claude API를 실제로 호출한다** (`https://api.anthropic.com/v1/messages`, 모델 `claude-haiku-4-5-20251001`, `ANTHROPIC_API_KEY` 사용). 응답 토큰은 `logApiUsage`로 `api_usage_logs`에 기록됨 |
| 보고서 저장 | `handlePrint()`에서 `POST /api/reports` 호출 → `reports` 테이블 insert. **실패해도 인쇄는 그대로 진행**(에러를 조용히 무시, `report/page.tsx:225`) |
| 보고서 수정/재생성 | **불가능.** `/api/reports`에는 GET(목록)·POST(신규 생성)·DELETE만 있고 PATCH(수정) 없음. "재생성"은 새 폼 작성 후 재저장 = 새 row 생성일 뿐, 기존 row를 고치는 기능은 없음 |
| PDF/인쇄 연결 | `report/print/page.tsx`가 **URL 쿼리 파라미터만으로 렌더링**(DB를 직접 읽지 않음). `html2pdf.js`로 클라이언트에서 PDF 다운로드 가능(`downloadPdf()`). `/reports` 목록 페이지의 "보기/인쇄" 버튼이 저장된 row 데이터를 params로 변환해 `/report/print`를 열어줌 → 간접적으로 DB와 연결 |

### 발견된 구체적 문제 (수정 전, 기록만)

1. **스키마 드리프트 위험**: `/api/reports` POST가 `teacher, vocab_analysis, grammar_analysis, reading_analysis` 컬럼에 insert를 시도하는데, 체크인된 `supabase-migration.sql`의 `CREATE TABLE reports` 정의에는 이 4개 컬럼이 없다. 실제 운영 DB에는 대시보드에서 직접 추가됐을 가능성이 높다 — **동작은 하고 있는 것으로 보이나(전체 build는 통과), 리포의 SQL 파일과 실제 스키마가 어긋나 있다.** 다음에 새 환경(다른 계정/새 Supabase 프로젝트)에서 마이그레이션을 다시 실행하면 이 컬럼들이 없어서 저장이 조용히 실패할 수 있다.
2. **재인쇄 시 필드 누락**: `app/reports/page.tsx`의 `openPrint()`는 저장된 report row를 인쇄 파라미터로 변환할 때 `teacher`, `vocabAnalysis`, `grammarAnalysis`, `readingAnalysis`를 포함하지 않는다. 즉 저장 직후 1회 인쇄는 모든 내용이 나오지만, `/reports` 목록에서 나중에 다시 "보기/인쇄"를 누르면 담당교사명과 상세 분석 3종이 빠진 채로 출력된다.
3. **저장 실패가 사용자에게 전달 안 됨**: 위 1번 문제가 실제로 발생해도 `handlePrint()`가 `catch`로 삼키기 때문에 교사는 "저장됐다"고 착각한 채 인쇄만 하게 된다.

---

## 3. 시험/성적 관계 조사

현재 리포에는 시험/성적 관련 테이블이 **4개**로 나뉘어 있다. 역할이 서로 다르므로 혼동하지 않아야 한다.

| 테이블 | 역할 | 학생 종속 여부 |
|---|---|---|
| `exams` | **시험 카드(메타데이터)**: `title, exam_date, total_questions, max_score, question_set_id` | 학생과 무관. 하나의 시험을 여러 학생에게 재사용 가능(설계 그대로 이미 지원됨) |
| `exam_questions` | 시험(`exams`) 1개에 딸린 문항 구성. `exam_id FK, question_data(jsonb), sort_order, points` | 학생 무관, 시험 종속 |
| `exam_results` | **학생별 시험 결과 기록.** `student_id FK, exam_id FK(nullable), exam_title(텍스트 복사), score, max_score, exam_date` | 학생 종속. `exam_id`가 있으면 시험 카드와 연결, 없으면 "직접 입력" 자유 기록도 허용 |
| `exam_sheets` | **별개 기능.** 학생/성적과 무관한 "인쇄용 문제지 생성기"(`/`, `/history`) 저장소. `style_preset, question_config, questions_data` 등 시험지 디자인 데이터. 학생 성적 파이프라인과는 **완전히 분리된 기능**이다 |

**학생 → 시험 → 성적 → 보고서 관계가 어디까지 구현되어 있는가:**

- `학생 → 시험(exams) → 시험결과(exam_results)`: **이미 구현되어 있고 실제로 작동한다.** `app/grading/page.tsx`("채점관리")가 이 흐름의 UI다 — 시험 카드를 만들고, 학생을 골라 점수(직접 입력 또는 "틀린 개수로 자동 계산")를 `exam_results`에 저장한다.
- `시험결과(exam_results) → 학생기록`: 별도의 "학생기록" 테이블은 없다. `exam_results` 자체가 그 역할을 하고 있으며, 다음 화면들이 모두 이를 재사용한다.
  - `/analytics`, `/api/analytics` — 반 평균 추이, 학생별 점수 히스토리, 유형별 취약점(`exam_questions` + `wrong_answer_records`와 조인해 실시간 계산, 별도 저장 없음)
  - `/error-notes` — 시험별 성취율/학생별 요약 (역시 `exam_results` 재사용, 별도 저장 없음)
  - `/parent/[id]` (학부모 PIN 조회) — `POST /api/parent-view` → Postgres **RPC** `get_student_report(p_student_id, p_pin)` 호출 → `exam_results` 기반 성적 이력 반환. **이 RPC 함수의 정의도 리포의 `*.sql` 파일 어디에도 없다** → `students` 테이블과 마찬가지로 대시보드에서 직접 만든 것으로 추정(§4 스키마 드리프트 목록에 추가)
- `시험결과 → 학부모보고서(reports)`: **직접 연결은 약하다.** `reports`는 `exam_id`/`student_id` FK를 갖고 있지만, 실제로는 `exam_results`의 값을 그대로 읽어와 자동 채우지 않는다. `report/page.tsx`는 `exams`(시험 카드)만 참조하고, 학생의 실제 `exam_results` 점수를 자동으로 끌어오는 로직은 없다. 유일한 자동 연동 경로는 **오답분석(`/wrong-answers`) → URL 쿼리 파라미터로 `/report`에 handoff**(`wrong-answers/page.tsx:306`, `window.location.href = '/report?...'`)뿐이며, 이것도 DB 레벨 연결이 아니라 브라우저 URL을 통한 1회성 프리필이다.
- 문항 소스(문제선택): `exams/[id]/page.tsx`("문항 구성") 화면에서 이미 **AI 생성 문제은행(`question_sets`/`questions`)** 과 **외부지문저장소(`passages`)** 양쪽에서 문항을 `exam_questions`로 담아올 수 있다(STEP 7-A/7-B, 최근 커밋에서 구현 완료). 중복 추가 방지 로직(`source_passage_id`, `externalSourceKey`)도 이미 있다.

**결론:** "시험이 시험지 자체인가, 학생별 기록인가"라는 질문에 대한 답은 — **둘 다 이미 분리되어 존재한다.** `exams`가 시험지(재사용 가능한 카드), `exam_results`가 학생별 기록이다. 계획했던 파이프라인의 앞부분(학생→시험출제→문제선택→시험→결과→학생기록)은 사실상 완성되어 있고, 마지막 구간(결과→학부모보고서)만 수동 연결 상태다.

---

## 4. 중복 위험 조사

앞으로 만들려던 `학생 → 시험출제 → 문제선택 → 시험 → 결과 → 학생기록 → 학부모보고서` 파이프라인을 기존 기능과 비교하면:

| 계획 단계 | 대응하는 기존 기능 | 판정 |
|---|---|---|
| 학생 | `students` 테이블 + `/students` | 이미 존재함 → 그대로 재사용 |
| 시험출제 | `exams` 테이블 + `/exams`, `/exams/[id]` | 이미 존재함 → 그대로 재사용 |
| 문제선택 | `exam_questions` + 문제은행(`questions`/`question_sets`) + 외부지문저장소(`passages`) 연동 | 이미 존재함(최근 STEP 7에서 완성) → 그대로 재사용 |
| 시험(응시/채점) | `exam_results` + `/grading` | 이미 존재함 → 그대로 재사용 |
| 결과 | `exam_results`가 이미 결과 테이블 | 이미 존재함 → 그대로 재사용 |
| 학생기록 | `exam_results`를 `/analytics`, `/error-notes`, `/parent/[id]`가 이미 재사용 중 | 이미 존재함 → 그대로 재사용 |
| 학부모보고서 | `reports` 테이블 + `/report`, `/reports`, AI 초안(`/api/generate-report`) | 이미 존재함, 다만 `exam_results`와 자동 연결이 약함 | 연결만 하면 됨 |

**중복 저장 위험(실제로 발견된 것):**

- `reports` 테이블은 `student_name`, `student_grade`, `exam_title`, `score`, `max_score`를 `students`/`exams`/`exam_results`에서 **텍스트로 복제 저장**한다. `student_id`/`exam_id` FK가 있음에도 조회 시 조인해서 쓰지 않고 스냅샷 방식으로 설계돼 있다. (보고서 발행 시점의 이름을 보존한다는 점에서 의도적인 설계일 수 있으나, 학생 이름을 나중에 고치면 과거 보고서에는 옛 이름이 남는다는 뜻이기도 하다.)
- 만약 앞으로 "결과 → 보고서 자동 연동"을 만들면서 `exam_results`와 별도로 또 다른 "학생 시험 기록" 테이블을 새로 만들면, `exam_results`와 완전히 중복된 데이터가 두 군데 쌓이게 된다. **`exam_results`를 재사용하는 것이 맞고, 새 테이블을 만들 필요는 없다.**

**스키마 드리프트(리포 SQL 파일에 없는 실제 DB 객체) 종합:**

1. `students` 테이블 — CREATE TABLE 문 없음
2. `exams` 테이블 — CREATE TABLE 문 없음(단, `exam_sheets`와는 다른 테이블)
3. `exam_results` 테이블 — CREATE TABLE 문 없음
4. `reports.teacher`, `reports.vocab_analysis`, `reports.grammar_analysis`, `reports.reading_analysis` 컬럼 — ALTER 문 없음
5. Postgres 함수 `get_student_report(p_student_id, p_pin)` — 정의 없음

→ 이 5가지는 실제로는 정상 동작하고 있는 것으로 보이지만(빌드 통과, 로직상 참조 정합), **리포만 보고 새 환경을 구축하면 재현이 안 된다.** 구조조사 범위를 벗어나므로 이번 STEP에서 손대지 않았고, 필요하면 별도 STEP으로 "실제 Supabase 스키마 export → 리포 SQL과 동기화"를 제안한다.

---

## 5. 보고서 자동화 가능성 조사

### Supabase에서 자동으로 가져올 수 있는 항목 (정량 정보)

| 항목 | 현재 상태 |
|---|---|
| 학생 이름/학년 | 이미 자동(학생 선택 시 `students`에서 가져옴) |
| 시험명/시험일/만점 | 이미 자동(시험 선택 시 `exams`에서 가져옴, 단 시험 미선택 시 수동) |
| 총점 | 자동 채움 **안 됨** — `exam_results`에 이미 있는 값인데 `report/page.tsx`가 다시 물어봄(§3) → **연결만 하면 자동화 가능** |
| 영역별 점수(어휘/어법/독해 등) | 자동 채움 **안 됨** — `exam_questions.question_data.type` + `wrong_answer_records`로 유형별 정답률을 계산하는 로직(`lib/analyticsShared.ts`의 `computeTypeStats`)이 `/api/analytics`에 이미 있음 → **같은 로직을 재사용해 연결만 하면 자동화 가능** |
| 담당교사 | 자동 소스 없음 — `academy_settings`에 `academy_name`은 있지만 교사명 필드는 없음 → **작은 스키마 추가가 필요(새로 만들어야 함)**, 구조조사 범위 밖 |

### 교사가 직접 작성해야 하는 항목 (정성 정보)

- 강점 메모 / 보완 메모 / 학습계획 메모 / 어휘·어법·독해 메모 (AI 입력 원본) — 사람의 관찰이 필요한 영역, 자동화 대상 아님
- AI 초안의 최종 편집본(강점/보완/학습계획/상세분석 3종) — AI가 초안을 쓰고 교사가 검수·수정하는 현재 구조가 이미 "정성 판단은 교사 또는 AI 초안" 목표와 일치함

**결론:** "정량정보 = DB 자동입력, 정성정보 = 교사 작성/AI 초안" 이라는 목표 구조는 **이미 상당 부분 구현되어 있다.** 남은 작업은 새 기능 개발이 아니라 ①`exam_results`와 `report` 폼 사이의 자동 채움 연결, ②`type_scores`와 `computeTypeStats` 로직 연결, ③(선택) `academy_settings`에 교사명 필드 추가 정도다.

---

## 6. 종합 표

| 기능 | 현재 존재 여부 | 현재 데이터 소스 | 실제 작동 여부 | 재사용 여부 | 수정 필요 | 위험요소 |
|---|---|---|---|---|---|---|
| 학생 등록/수정/삭제 | 있음 | `students` | 작동함 | 재사용 | 없음 | `students` 테이블 CREATE 문 리포에 없음(드리프트) |
| 학생 상세(펼침카드) | 있음 | `students` | 작동함 | 재사용 | 없음 | 없음 |
| 학생→성적 버튼 | 있음 | 없음(라우팅만) | 작동함 | 재사용 | 없음 | 없음 |
| 학생→보고서 버튼 | 있음 | 없음(라우팅만) | 작동함 | 재사용 | 없음 | 없음 |
| 시험 카드(exams) | 있음 | `exams` | 작동함 | 재사용 | 없음 | `exams` CREATE 문 리포에 없음(드리프트) |
| 시험 문항 구성 | 있음 | `exam_questions` | 작동함 | 재사용 | 없음 | 없음 |
| 문제은행/외부지문 → 시험 담기 | 있음 | `questions`,`question_sets`,`passages` | 작동함 (STEP 7 완료) | 재사용 | 없음 | 없음 |
| 학생별 시험결과 등록(채점관리) | 있음 | `exam_results` | 작동함 | 재사용 | 없음 | `exam_results` CREATE 문 리포에 없음(드리프트) |
| 성적 분석(analytics) | 있음 | `exam_results`+`exam_questions`+`wrong_answer_records` | 작동함, 실시간 계산 | 재사용(유형별 정답률 로직) | 없음 | 없음 |
| 오답노트(error-notes) | 있음 | `exam_results` | 작동함 | 재사용 | 없음 | 없음 |
| 오답분석→보고서 핸드오프 | 있음 | URL 쿼리 파라미터(DB 아님) | 작동함, 1회성 | 재사용 가능하나 취약 | 연결 개선 여지 | DB 레벨 연결 아님, 새로고침하면 유실 |
| 학부모 PIN 조회 | 있음 | `exam_results` (RPC 경유) | 작동함 | 재사용 | 없음 | RPC 함수 정의 리포에 없음(드리프트) |
| 보고서 작성 폼 | 있음 | UI 상태 + `students`/`exams` | 작동함 | 재사용 | 총점/영역별 점수 자동연결 필요 | `exam_results`와 자동 연결 안 됨 |
| AI 초안 생성 | 있음 | `/api/generate-report` → Anthropic API 실호출 | 작동함 | 재사용 | 없음 | 없음(단, API 키/토큰 사용량 로그는 `api_usage_logs`로 이미 추적됨) |
| 보고서 저장 | 있음 | `reports` | 작동하는 것으로 보임 | 재사용 | 없음(스키마 동기화는 별도) | `teacher`/`vocab_analysis`/`grammar_analysis`/`reading_analysis` 컬럼 리포 SQL에 없음(드리프트), insert 실패 시 조용히 무시됨 |
| 보고서 목록/삭제 | 있음 | `reports` | 작동함 | 재사용 | 없음 | 없음 |
| 보고서 재인쇄 | 있음 | `reports` → URL 파라미터 변환 | **부분 작동** | 재사용 | 담당교사/상세분석 3종 파라미터 누락 수정 필요 | 재인쇄 시 일부 필드 빠짐(§2-2) |
| 보고서 수정/재생성 | **없음** | — | — | — | PATCH 엔드포인트 신규 필요 | 현재는 새 row로만 재작성 가능 |
| 담당교사 자동 채움 | **없음** | — | — | — | `academy_settings`에 필드 추가 필요 | 작은 스키마 변경 필요(신규) |

---

## 7. 최종 분류

**A. 그대로 유지**
- 학생관리 전체(CRUD, 펼침카드, 검색, PIN/링크 복사)
- 시험 카드(`exams`), 문항 구성(`exam_questions`), 문제은행/외부지문 담기 연동
- 채점관리(`exam_results` CRUD)
- 성적분석(`/analytics`), 오답노트(`/error-notes`), 학부모 PIN 조회(`/parent/[id]`)
- AI 초안 생성(`/api/generate-report`) 자체 로직

**B. 연결만 하면 됨**
- 보고서 작성 폼의 "총점"을 `exam_results`에서 자동 프리필 (시험+학생 선택 시)
- 보고서 작성 폼의 "영역별 점수"를 `computeTypeStats`(이미 `/api/analytics`에 존재) 로직과 연결해 자동 계산
- 오답분석(`/wrong-answers`) → 보고서 핸드오프를 URL 파라미터 대신 더 견고한 방식으로 다듬기(선택)

**C. 개선 필요**
- `/reports` 목록의 "보기/인쇄" 시 누락되는 필드(`teacher`, `vocabAnalysis`, `grammarAnalysis`, `readingAnalysis`) 보완
- `reports` insert 실패를 사용자에게 알리기(현재 조용히 무시됨)
- 리포 SQL 파일과 실제 Supabase 스키마 동기화(`students`, `exams`, `exam_results`, `reports`의 4개 신규 컬럼, `get_student_report` RPC를 마이그레이션 파일로 문서화)

**D. 새로 만들어야 함**
- 보고서 수정/재생성(PATCH) 엔드포인트 — 현재 없음
- `academy_settings`에 담당교사명 필드 추가 + 보고서 폼 자동 채움(선택 사항, 작은 스코프)

---

## 8. Build 확인 결과

```
npm run build
✓ Compiled successfully
✓ Linting and checking validity of types ... (오류 없음)
✓ Generating static pages (59/59)
```

빌드 오류 없음. 조사 과정에서 코드/DB/데이터 변경 없음, migration 실행 없음, 배포 없음, 외부 AI API 신규 호출 없음(기존 `/api/generate-report` 흐름을 코드 리딩만 함).

---

## 다음 단계 제안 (실행하지 않음, 승인 대기)

이번 STEP은 조사까지다. 다음에 진행한다면 제안 우선순위는:

1. (C) `/reports` 재인쇄 필드 누락 수정 — 가장 작고 안전한 버그 수정
2. (C) 리포 SQL 파일과 실제 스키마 동기화 문서화 — 위험 관리 차원
3. (B) 보고서 폼 ↔ `exam_results`/유형별 정답률 자동 연결 — 이번에 조사한 핵심 가치
4. (D) 보고서 수정(PATCH) 기능 추가
5. (D) 담당교사 자동 채움

각 항목은 별도 STEP으로 나눠서 진행하는 것을 권장한다(한 번에 다 하지 않음).
