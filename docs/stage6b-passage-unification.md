# 6단계 B: AI 지문과 외부지문 — 차이 조사와 통합 목록(읽기 전용)

- 작성: 2026-09-29 · 코드 기준 조사 + DB 읽기 전용 확인 (값은 바꾸지 않음)
- 결론: **두 표를 합치지 않고, 한 목록에서 함께 보여주는 읽기 전용 화면만 만들었다.** DB 구조 변경(migration)은 필요 없었다.
- 화면: `/materials/passages/all` (자료 > 지문 첫 화면 아래 "한 목록에서 보기" 링크) · API: `GET /api/passages-unified` · 규칙: `lib/passageUnified.ts` · 테스트: `npm run test-passage-unified`

## 1. 두 지문의 차이 (지금 코드 기준)

| 항목 | AI 지문 (AI 세트) | 외부지문 |
|---|---|---|
| 저장 표 | `question_sets` 한 행 = 지문 1개 + 문항 JSON(`questions`, `summary_questions`, `reading_questions`, `essay_questions`) | `passages` 한 행 = 지문 1개 + `questions`·`essays` JSON. 4단계 세트는 `passage_groups` 로 묶음(`group_id`) |
| 문항 사본 | 저장할 때 `questions` 표에도 문항을 한 줄씩 복사 (`app/api/save-question-set/route.ts`) → 문제은행·문항 검색은 이 표를 읽는다 | 복사 없음. 문항은 `passages` JSON 안에만 있다 |
| 문항 ID | `questions.id` (uuid, 행마다). `question_sets` JSON 안 문항에는 ID 없음 (DB 확인: 369개 중 0개) | 문항마다 `qid`(uuid, `lib/passageQid.ts`) — 새 지문은 필수, 예전 지문은 없을 수 있음 (DB 확인: 지금 14개 지문 350문항 모두 qid 없음 = 예전 방식) |
| 만드는 곳 | 앱 안에서 AI 호출로 생성 (`/materials/passages/ai/new`) | AI API 호출 없음. JSON 을 `scripts/add-passage.ts` 로 저장 |
| 학년 표기 | `"중학교 1학년"` 같은 긴 글자 (생성 화면 `GRADE_OPTIONS`: 초등학교 4학년 ~ 고등학교 3학년). DB: 초5 11 · 초6 6 · 초4 4 · 중1 18 · 중3 4 · 고1 2 (45세트) | `"중1"` 같은 짧은 글자 (`passages.level`). DB: 초6 9 · 중1 1 · 중3 4 (14개) |
| 난이도 | **문항마다** `beginner / intermediate / advanced`. `questions` 표에는 숫자로 바꿔 저장 (1~5 척도, beginner 2 · intermediate 3 · advanced 4). 세트 전체 난이도 칸은 없음 | **지문마다** 4단계 `variant_level`: 학교형 / 일반학원형 / 상위학원형 / 선행형. 4단계 세트가 아닌 지문은 비어 있음 (DB: 2개) |
| 지우는 방식 | **삭제만** (`DELETE /api/question-sets/[id]`, 보관 기능 없음). `questions` 표 문항이 같이 지워지는지는 스키마가 리포에 없어 미확인 | **보관**(`archived`, 그룹은 `passage_groups.archived`) + 삭제 둘 다. 목록은 "전체 자료 / 보관함" 탭 |
| 목록 화면 | `/materials/passages/ai`, 문항 보기 `/materials/questions/[id]` | `/materials/passages/external`, 상세 `/materials/passages/external/[id]` |
| 1,000행 제한 | 기존 목록 API 는 나눠 읽기 없음 (지금 45개라 문제 없음) | 기존 목록 API 도 나눠 읽기 없음 (14개) |

## 2. 통합 목록에서 맞춘 규칙

### 학년 → 한 가지 표기 ("중1")
- `초등학교 N학년 / 초등 N학년 / 초N` → `초N`, 중·고도 같은 방식 (`normalizeGrade`).
- 알아볼 수 없는 값(예: "기타", "중학교 4학년")은 원래 글자 그대로 보여주고, 학년 필터에서는 "학년 미정"으로 묶는다.
- 지금 DB 의 학년 값은 모두 변환된다 (AI 45 / 외부 14).

### 난이도 → 통합 눈금 1~4

| 통합 | 이름 | 외부지문 4단계 | AI 문항 난이도 (questions 표 숫자) |
|---|---|---|---|
| 1 | 기초 | 학교형 | beginner (2) |
| 2 | 표준 | 일반학원형 | intermediate (3) |
| 3 | 심화 | 상위학원형 | advanced (4) |
| 4 | 선행 | 선행형 | (없음) |

- AI 세트는 문항마다 난이도가 섞여 있으므로 **가장 많은 난이도**를 세트 난이도로 본다. 같은 수면 **높은 쪽**. 서술형은 `level` 을 같은 방식으로 센다. 문항이 없으면 "미정".
- 외부지문 중 4단계 세트가 아닌 지문(`variant_level` 없음)은 "미정".
- 원래 값은 괄호로 함께 보여준다 (예: "심화 (상위학원형)", "표준 (문항 대부분 intermediate)").
- 이 눈금은 **지문끼리 대강 비교하는 용도**다. 단어은행의 1~100 절대 난이도와는 관계없다.

### 목록·필터
- 한 줄: 종류(AI / 외부) · 학년 · 제목(AI 는 주제) · 난이도 · 문항 수(서술형 포함) · 만든 날 · **열기**(원래 화면).
- 필터: 종류, 학년, 난이도, "보관된 외부지문도 보기"(기본은 보관 제외 — 외부지문 목록의 "전체 자료" 탭과 같은 기준).
- 수정·삭제·보관 버튼은 없다. "열기"로 원래 화면에 가서 한다 (AI → 문항 보기, 외부 → 외부지문 상세).
- 정렬: 최근 만든 것부터.

## 3. 안전

- API 는 `GET` 만 있고 두 표를 `lib/supabasePaging.ts` 로 1,000행씩 나눠 읽는다. 본인 것만 (`user_id`).
- 목록에 정답·본문을 내려보내지 않는다 (개수와 난이도만 계산해서 보냄).
- 옛 화면(`/materials/passages/ai`, `/materials/passages/external`, `/materials/passages`, 옛 주소 `/passages`·`/external-passages` 연결)은 그대로다.

## 4. 못 한 것 / 다음에 결정할 것

- **4단계 세트 묶음 표시 없음**: 외부지문 4단계 세트는 통합 목록에서 지문 4개가 따로 나온다 (외부지문 목록처럼 한 줄로 묶지 않음). 필요하면 다음에.
- **AI 지문 보관 기능 없음**: 보관하려면 `question_sets` 에 칸을 더해야 해서 (migration) 이번에 하지 않았다.
- **문항 ID 통일 안 함**: AI 는 `questions.id`, 외부는 `qid`. 통합 목록은 지문 단위라 필요 없었다. 문항 단위 통합(예: 한 검색에서 두 종류 문항 함께 찾기)은 별도 설계가 필요하다.
- 예전 외부지문 14개에 qid 가 아직 없다 (`npm run backfill-passage-qids` 대상인지 확인 필요 — 이번 작업 범위 밖이라 실행하지 않음).
