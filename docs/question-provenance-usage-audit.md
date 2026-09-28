# 문제은행 원본 추적 / 사용이력 구조조사 (STEP 3-A: 조사 전용)

- 작성일: 2026-09-23
- 범위: 코드 기준 전수조사 + 설계안 비교. **코드 수정, DB migration, 배포 없음.**
- 주의: 실제 DB 데이터는 조회하지 않았다. `questions`, `question_sets`, `exams`, `exam_results` 는 리포에
  `CREATE TABLE` 문이 없어서(대시보드에서 직접 만든 테이블) 컬럼은 **API의 select/insert 코드 기준**으로 적었다.
  실제 데이터 분포를 확인하는 읽기 전용 SQL은 §11에 따로 적어두었다.

---

## 0. 결론 요약

1. **전제 하나가 코드와 다르다.** "일반 문제은행 문제는 원본 ID가 사라진다"는 조사와 달리, 코드상
   `addQuestion`은 처음(2c81e52)부터 문제은행 행을 통째로 펼쳐서(`{ ...q }`) 복사한다. 그래서
   `question_data.id = questions.id`, `question_data.question_set_id = question_sets.id`가 **이미 저장되고 있다.**
   다만 "출처"라고 표시된 필드가 아니라 이름이 모호한 `id`에 우연히 남아 있는 것이고, 출처 표시(`source`), FK, 인덱스가 없다.
   → **"사라진다"가 아니라 "암묵적으로 남아 있지만 공식 provenance가 아니다"** 가 정확하다.
2. 외부지문 문제는 **지문 단위까지만 안정적**이다. 개별 문제는 `source_kind + source_index`(배열 위치)로만
   식별되는데, 외부지문 편집 화면의 개별 삭제가 뒤 문제들의 위치를 당긴다. 그래서 **사용이력 추적에 안전하지 않다.**
   지금도 버그가 생긴다(§3-3).
3. 시험에 실제로 들어가는 출처는 **2개뿐**이다: `questions` 테이블(AI 문제은행)과 `passages`(외부지문저장소).
   직접 입력 경로는 없다. `exam_sheets`(AI 시험지 생성기)는 `exams`와 연결되지 않은 별도 시스템이다.
4. 사용횟수는 `usage_count` 없이도 `exam_questions` 에서 계산할 수 있다. 정답률은 `wrong_answer_records`로
   **부분 가능**하다(맞음/틀림 2가지만 있고, 학생이 고른 답은 없다).
5. 권장: **안 B** (문제은행 출처 필드를 명시하고, 외부지문 문제에 stable ID 부여, 스키마 migration 없음).
   학생별 응답 기록(안 C의 일부)은 곧 할 "학생 누적 학습기록" 설계와 함께 결정한다.

---

## 1. 문제 → 시험 → 결과 흐름 (실제 코드)

```
[원본]
 questions (AI 문제은행, 1문항 = 1행)      passages.questions[] / essays[] (외부지문, JSON 배열 안의 원소)
   │  GET /api/questions/search 로 매핑        │  GET /api/passages/[id]
   ▼                                           ▼
 app/exams/[id]/page.tsx
   addQuestion (:344) / addAllQuestions (:362)   addSelectedExternal (:300) → buildExternalExamQuestionData
   │                                           │
   └──────────── POST /api/exam-questions ─────┘   (question_data 를 그대로 insert, 서버 가공 없음)
                         ▼
 exam_questions (id, exam_id, user_id, question_data JSONB, sort_order, points, created_at)
                         │  exam_id FK ON DELETE CASCADE
                         ▼
 exams (id, title, exam_date, total_questions, max_score, created_at)
        │                                      │
        ▼                                      ▼
 exam_results                                 wrong_answer_records
 (student_id, exam_id NULL 가능,               (exam_id CASCADE, student_id,
  exam_title 복사, score, max_score,           wrong_question_ids TEXT[] = 틀린 exam_questions.id,
  exam_date) — 총점만, 문항 정보 없음          scored_at, notes) — FK 아님, 문자열 배열
```

- 문항 단위 결과는 `wrong_answer_records.wrong_question_ids`뿐이다. 이 값은 **`exam_questions.id`**(시험 문항)를
  가리키고, 원본 문제를 가리키지 않는다. 그래서 원본 문제별 정답률은 `wrong_question_ids → exam_questions → question_data의 출처`
  두 단계를 거쳐야 한다.
- `exam_results`는 총점만 저장한다. 같은 학생×시험으로 매번 insert하므로 여러 건일 수 있다.

---

## 2. 문제 출처 전수조사

| 출처 | 원본 테이블 / PK | 시험 추가 함수 | exam_questions에 복사되는 것 | 원본 ID 보존 | 원본 수정/삭제 시 기존 시험 |
|---|---|---|---|---|---|
| **AI 문제은행** (`/questions`, `/question-search`에서 보는 것과 같은 `questions` 테이블. 앱에서 말하는 "일반 문제은행"도 이것) | `questions.id` (uuid). 소속 세트는 `question_set_id → question_sets.id` | `addQuestion`, `addAllQuestions` (`app/exams/[id]/page.tsx:344, :362`) | 검색 API가 매핑한 모양 전체: `id, type(접두어 reading_/essay_ 제거), question, options, answer, explanation, grade, topic, difficulty, question_set_id` + `passage`(세트 원문 복사) | **암묵적으로 있음**: `question_data.id`(=questions.id), `question_data.question_set_id`. `source` 표시 없음 | 영향 없음(snapshot). 앱에 `questions` 수정/삭제 API는 없다. `question_sets` 삭제(`/passages` 화면) 시 `questions`가 CASCADE로 지워지는지는 스키마가 리포에 없어 미확인. 어느 쪽이든 시험 문항은 남고, `question_data.id`만 가리킬 곳이 없어진다 |
| **외부지문저장소** | `passages.id` (uuid). 개별 문제는 `passages.questions[i]`, `passages.essays[i]` → **자체 PK 없음** | `addSelectedExternal` → `buildExternalExamQuestionData` (`lib/externalPassageExam.ts:62`) | 변환된 문제(mc/blank/tf/order/match/essay) + `passage`(본문 복사) + `source:'external_passage'`, `source_passage_id`, `source_kind:'question'\|'essay'`, `source_index` | 지문: **있음**. 개별 문제: **배열 위치만** | 영향 없음(snapshot). 지문 삭제 시 `source_passage_id`가 가리킬 곳이 없어진다. 개별 문제를 삭제하면 **뒤 문제들의 index가 밀린다**(§3) |
| AI 시험지 생성기 (`/`, `/history`) | `exam_sheets.id` / `questions_data` JSON | 없음 — `exams`/`exam_questions`와 연결 안 됨 | — | — | 사용이력 대상 밖(별도 시스템) |
| 문제 검색 인쇄 (`/question-search/print`) | `questions` | 없음 — 시험 레코드 없이 바로 인쇄 | — | — | **사용 기록이 남지 않는 사용 경로** (알아만 둘 것) |
| 오답분석 "문제은행 직접 선택" (`app/wrong-answers/page.tsx`) | `questions.id` | 시험에 추가하지 않음. 오답 기록에 `exam_id: null`로 저장 시도 | — | `wrong_question_ids`에 exam_questions.id가 아닌 **questions.id**가 들어간다 | ⚠️ **현재 저장 불가 버그**: `POST /api/wrong-answers`가 `exam_id` 없으면 400을 돌려준다(`route.ts:37`). 이 화면은 `exam_id: null`을 보낸다(`page.tsx:218`) |
| 직접 입력/생성 | — | **존재하지 않음** | — | — | — |

`exam_questions`에 insert하는 곳은 위 3개 함수와 테스트 스크립트(`scripts/test-exam-external*.ts`)뿐이다.

---

## 3. exam_questions 구조와 외부지문 식별 가능성

### 3-1. 컬럼 (`supabase-migration.sql`)

`id uuid PK, exam_id → exams ON DELETE CASCADE, user_id, question_data JSONB NOT NULL, sort_order int, points int, created_at`
— 출처용 컬럼은 없다. 출처 정보는 전부 `question_data` JSON 안에 있다.

### 3-2. question_data 필드 현황

| 필드 | AI 문제은행 | 외부지문 |
|---|---|---|
| `id` | ✅ questions.id (이름이 모호함) | ❌ 없음 |
| `question_set_id` | ✅ | ❌ |
| `source` | ❌ | ✅ `'external_passage'` |
| `source_passage_id` | — | ✅ |
| `source_kind` / `source_index` | — | ✅ (배열 위치) |
| `type` | ✅ (단, `reading_주제` → `주제`, `essay_어법고쳐쓰기` → `어법고쳐쓰기`로 접두어가 제거됨. 원래 유형 정보 일부 손실) | ✅ mc/blank/tf/order/match/essay |
| `grade`, `topic`, `difficulty` | ✅ | ❌ (지문의 level/topic은 복사 안 됨) |
| tags | ❌ (`questions.tags`는 검색 API가 매핑하지 않음) | ❌ (지문 tags 복사 안 됨) |
| variant (`variant_level`, `group_id`) | — | ❌ 복사 안 됨. 지문이 살아 있으면 `source_passage_id`로 되짚을 수 있지만, 지문이 삭제되면 잃는다 |
| `passage` 본문 | ✅ 세트 원문 | ✅ 지문 본문 |

### 3-3. 외부지문 개별 문제: index 식별은 안전한가? → **아니다**

index가 바뀌거나 다른 문제를 가리키게 되는 경로:

| 경로 | 결과 |
|---|---|
| 편집 화면 개별 문제 삭제 `removeQuestion(idx)` (`app/external-passages/[id]/page.tsx:153`) — `filter((_, i) => i !== idx)` | 삭제한 문제 뒤의 모든 문제 index가 1씩 당겨진다 |
| 편집 화면 서술형 삭제 `removeEssay` (`:161`) | 같은 현상 |
| `scripts/add-passage-set-questions.ts` — `questions`/`essays` 배열 통째로 교체 | 같은 index가 완전히 다른 문제가 될 수 있다 |
| 편집 화면 문제 수정 `updateQuestion` (`:139`) | index는 그대로, 내용만 바뀜(같은 문제로 볼지는 정책 문제) |

**지금도 생기는 버그(참고, 이번 STEP에서 수정 안 함):** 시험에 5번 문제를 담은 뒤 원본 지문에서 3번 문제를 삭제하면:
- 시험출제 화면의 "✓ 추가됨" 표시는 index 기준(`extAddedKeySet`, `app/exams/[id]/page.tsx:248`)이라
  **원래 6번이던 다른 문제**가 추가됨으로 잘못 표시된다.
- 실제로 담았던 문제는 이제 4번이 되어 "미추가"로 보이고, 같은 문제를 한 번 더 담을 수 있다.

---

## 4. 외부지문 문제 stable ID 비교

| 방식 | 삭제/순서변경 후 | 오타 수정 후 | 같은 문장 중복 | 구현 부담 | 판정 |
|---|---|---|---|---|---|
| 배열 index (현재) | ❌ 다른 문제를 가리킴 | ✅ 유지 | ✅ | 없음 | 이력 추적 불가 |
| 문제 텍스트 hash | ✅ | ❌ 오타 하나 고치면 다른 문제가 됨 | ❌ 충돌 | 낮음 | 이력이 쉽게 끊김 |
| **새 stable ID** (각 원소에 `qid: uuid`) | ✅ | ✅ | ✅ | 중간: 모든 작성 경로가 qid를 만들고 유지해야 함 | **권장** |

stable ID 도입 시 지켜야 할 것:
- `passages.questions`/`essays`는 JSONB라서 **테이블 스키마 변경 없이** 원소에 `qid`만 추가하면 된다.
- 작성 경로 4곳이 qid를 만들거나 유지해야 한다.
  - 편집 화면 저장(기존 qid 유지)
  - `add-passage.ts`
  - `add-passage-set.ts`
  - `add-passage-set-questions.ts`: 배열 통째 교체라서 "교체 = 새 문제(새 qid)"로 할지 "위치별로 qid 계승"으로 할지 정책을 정해야 함
- 기존 지문에 qid를 채우는 백필은 DB 데이터 쓰기다. 스키마 migration은 아니지만 백업 후 향미님 승인을 받고 실행한다.
- 과거 `exam_questions`의 `source_index`를 백필한 qid로 **바꾸지 않는다.** 담은 뒤 지문이 편집됐는지 확인할 수 없기 때문이다.
  과거 행은 `source_index` 그대로 두고 "legacy(지문 단위만 신뢰)"로 다룬다.
- 나중에 "수정 여부" 신호: 원본(qid로 찾은 현재 내용)과 시험 snapshot을 비교하면 알 수 있다. 추가 컬럼은 필요 없다.

---

## 5. 문제은행 원본 추적: 가장 작은 변경안

기존 외부지문의 `source_*` JSON 관례(STEP 7에서 "DB 컬럼 추가 없이" 정한 방식)를 그대로 따른다.
새 체계를 만들지 않는다.

```jsonc
// AI 문제은행 문제 추가 시 question_data 에 명시적으로 추가
{
  "source": "question_bank",
  "source_question_id": "<questions.id>",
  "source_question_set_id": "<question_sets.id>",
  // 기존 id / question_set_id 는 호환을 위해 그대로 둔다(중복 방지 addedIds 가 id 를 씀)
}
// 외부지문 (안 B 이후)
{
  "source": "external_passage",
  "source_passage_id": "...",
  "source_kind": "question",
  "source_index": 4,            // 기존 유지(legacy 호환)
  "source_question_id": "<qid>" // 신규: stable ID
}
```

- 변경 위치: `addQuestion`, `addAllQuestions`(2곳, 같은 객체 생성), `buildExternalExamQuestionData`(외부지문)
- 공통 키 `source_question_id` 하나로 두 출처를 같은 방식으로 조회할 수 있다: `question_data->>'source' + question_data->>'source_question_id'`
- **기존 행 분류(추측 연결 금지):**
  - `source` 있음 → 신규 provenance
  - `source` 없음 + `id` + `question_set_id` 있음 → `legacy_bank`. 추측이 아니라 복사된 PK 그대로다.
    그래도 공식 provenance가 아니므로 통계에 넣을지는 별도로 선택하고, 넣을 때는 `questions`에 그 id가 실제로 있는지 확인한다.
  - `source='external_passage'` + `source_question_id` 없음 → `legacy_external`(지문 단위만 신뢰)
  - 그 외 → `unknown`

---

## 6. usage_count를 원장으로 쓰지 않는 이유와 대안

실제 사용 관계(`원본 → exam_questions → exams`)를 source of truth로 둔다. 누적 숫자가 틀어지는 경우:

| 사건 | 누적 usage_count | 관계 기반 계산 |
|---|---|---|
| 시험 삭제 (`exams` DELETE → exam_questions CASCADE) | 그대로 남아 부풀려짐 | 자동 반영 |
| 시험에서 문제 제거 | 감소 로직 필요, 빠지기 쉬움 | 자동 반영 |
| 같은 시험에 중복 추가 | 2로 셈 | `count(distinct exam_id)`로 1 |
| 원본 교체/재추가 | 추적 불가 | 행 단위로 추적 |

**관계 기반 계산 시 정해야 할 정책(설계 결정 사항):**
- "사용"의 정의: exam_questions에 담기만 한 것(초안 포함)과 실제로 치른 것(`exam_results` 또는
  `wrong_answer_records`가 있는 시험)을 구분해야 한다. 두 값 모두 계산 가능하다.
- 시험 삭제/문항 삭제 시 이력도 같이 사라진다(CASCADE, 하드 삭제). 채점까지 끝난 시험의 문항을 지우면
  `wrong_question_ids`가 가리킬 곳이 없어지고 그 학생 결과도 사실상 사라진다. 치른 시험의 이력을 보존하려면
  나중에 삭제 대신 보관/soft delete를 검토한다(안 C).
- 성능용 cached count는 데이터가 수천 시험 규모가 된 뒤에 view/materialized view로 검토한다. 지금은 불필요.

---

## 7. 알고 싶은 정보별 가능 여부

| 정보 | 현재 (AI 문제은행) | 현재 (외부지문 개별 문제) | 원본 ID 연결만 추가하면 | 추가 구조가 더 필요한 부분 |
|---|---|---|---|---|
| 총 사용 횟수 | 부분 가능 (`question_data.id`로 JSON 조회, legacy) | 부분 가능 (지문 단위 ✅, 문제 단위는 index 불안정) | ✅ 가능 | — |
| 사용된 시험 목록 | 부분 가능 | 부분 가능 | ✅ | — |
| 마지막 사용일 | 부분 가능 (`exams.exam_date` nullable → 없으면 `exam_questions.created_at`로 대체) | 부분 가능 | ✅ (날짜 기준 정책만 정하면) | — |
| 최근 사용 여부 | 부분 가능 | 부분 가능 | ✅ | — |
| 사용 학생 수 | 부분 가능 | 부분 가능 | 부분 가능 | `wrong_answer_records`(시험×학생)가 있는 시험만 셀 수 있다. `exam_results`는 `exam_id`가 null인 옛 기록이 있을 수 있다. 응시했는데 채점 기록이 없는 학생은 알 수 없다 |
| 정답률 / 오답률 | 부분 가능 | 부분 가능 | 부분 가능 | "기록 있음 + 틀린 목록에 없음 = 정답"이라는 가정에 기댄다. 결시/미응답 구분 없음, 서술형 부분점수 없음(맞음/틀림만), 문항 삭제 시 결과 소실 |
| "특정 오답이 반복된 문제" (어떤 보기를 골랐는지) | **불가능** | **불가능** | 불가능 | 학생 응답(고른 답/획득 점수)을 저장하는 문항 단위 응답 구조 필요 |

정리하면, **사용횟수·시험 목록·날짜 계열은 원본 ID 연결만으로 가능하다.**
**학생·정답률 계열은 학생별 문항 응답 구조가 있어야 제대로 된다.** 이 부분은 "학생 누적 학습기록" 설계에서 함께 결정하는 게 맞다.

---

## 8. 기존 시험 snapshot 보존

- 현재 방식(추가 시점에 `question_data`로 내용 전체 복사, 원본과 FK 없음)은 원본이 수정되거나 삭제돼도 시험이 바뀌지 않는다. **이 성질은 모든 안에서 그대로 유지한다.**
- 목표는 `snapshot(시험 당시 내용) + provenance(원본으로 돌아가는 포인터)` 둘 다 갖는 것이다. provenance는 **가리키기만 하고**,
  시험 표시·인쇄·채점은 계속 snapshot만 읽는다. 원본이 사라지면 포인터만 끊긴다(dangling 허용, 화면에서는 "원본 삭제됨"으로 표시).
- 품질점수(quality_score), 추천점수(recommended_score)는 어느 안에서도 만들지 않는다. 사용 횟수는 여러 신호 중 하나로만 다룬다.

---

## 9. 설계안 비교

| | **안 A: 최소 변경** | **안 B: 중간 수준 (권장)** | **안 C: 장기 정석** |
|---|---|---|---|
| 내용 | AI 문제은행 추가 시 `question_data`에 `source='question_bank'`, `source_question_id`, `source_question_set_id` 명시. 외부지문은 현행(index) 유지 | A + 외부지문 questions/essays 원소에 stable `qid` 부여 + `question_data.source_question_id` 로 기록 + 중복 방지/“추가됨” 판정을 qid 기준으로 변경(index는 legacy 대체 경로) + 사용이력 조회 함수(읽기 전용) | B + `exam_questions`에 실제 컬럼(`source_type`, `source_question_id`, `source_parent_id`) + 인덱스, 문항 단위 응답 테이블(학생×exam_question: 정오, 고른 답, 점수), 채점 후 문항은 soft delete |
| DB 변경 | 없음 | 스키마 migration 없음. **기존 passages 데이터에 qid 백필 1회**(백업 후, 승인 필요). 규모가 커지면 JSON 식 인덱스 1개(선택) | migration 여러 개(컬럼, 인덱스, 새 테이블, soft delete 컬럼), 기존 `wrong_question_ids`와의 이중 기록 기간을 어떻게 할지 결정 필요 |
| 코드 변경 범위 | `app/exams/[id]/page.tsx` 2곳 | A + `lib/externalPassageExam.ts`, 외부지문 편집 저장, add-passage 계열 스크립트 3개, 시험출제 화면 중복판정, 백필 스크립트 | B + exam-questions API, 오답분석/채점 화면 저장 방식, 분석(`analytics`, `reports/autofill`) 읽기 경로 |
| 기존 데이터 호환 | 과거 행은 legacy/unknown으로 정상 작동 | 같음. 과거 외부지문 행은 `source_index` 유지, 지문 단위만 신뢰 | 과거 행은 새 컬럼 null(=legacy). 과거 오답기록은 응답 테이블로 옮기지 않거나 "정오만" 이관 |
| 장점 | 즉시 가능, 위험 거의 없음 | 두 출처 모두 개별 문제까지 안정 추적. §3-3 버그 해소. DB 스키마 그대로 | 조회 성능·무결성(FK) 최상. "특정 오답 반복", 서술형 부분점수까지 가능 |
| 단점 | 외부지문(앞으로 주력 자료) 개별 문제 추적 불가 그대로. 버그 남음 | 모든 작성 경로가 qid 규칙을 지켜야 함(빠뜨리면 새 이력 끊김). JSON 조회라 대규모에선 인덱스 필요 | 범위 큼. 채점/오답 화면 재작업. 학생 누적기록 설계 전에 하면 다시 바꿀 위험 |
| 정답률/추천 확장성 | 낮음 (문제은행만) | 중간~높음: 사용횟수·최근사용·재선택·수정여부(snapshot vs 원본) 계산 가능. 정답률은 기존 오답기록 수준 | 높음 |
| 위험도 | 낮음 | 중간 (백필과 스크립트 정책. 백업과 되돌리기 가능) | 높음 |

**권장: 안 B.** 스키마를 건드리지 않고 원본 추적 문제(특히 외부지문)를 끝낼 수 있다.
안 C의 핵심인 **학생별 문항 응답 구조**는 곧 할 "학생 누적 학습기록" 설계와 같은 결정이라서
그때 함께 정한다. B는 C로 가는 길을 막지 않는다. B의 `source_question_id`는 C에서 컬럼으로 옮길 수 있다.

B를 나누면: **B-1** 문제은행 명시 필드(=안 A, 무위험) → **B-2** 외부지문 qid 부여(작성 경로 + 백필) → **B-3** 시험 추가/중복판정을 qid로 바꾸고 사용이력 조회.

---

## 10. 이번 조사에서 발견한 부수 이슈 (수정하지 않음)

1. 외부지문 문제 삭제 후 시험출제 화면의 "✓ 추가됨"이 엉뚱한 문제에 붙고, 같은 문제를 중복으로 담을 수 있음(§3-3). 안 B에서 해결.
2. 오답분석 "문제은행 직접 선택" 모드 저장 불가(`exam_id: null` ↔ API 필수 검사). 별도 수정 후보.
   - **원인 (STEP 3-B에서 기록만, 수정 안 함):** `app/wrong-answers/page.tsx`의 `handleSave`가 bank 모드에서
     `exam_id: null`을 보내는데, `app/api/wrong-answers/route.ts`의 POST가 `if (!exam_id || !student_id)`로 400을 돌려준다.
     DB(`wrong_answer_records.exam_id`)는 nullable이라 DB 제약 문제는 아니다.
   - **최소 수정안:** API 검사를 `student_id` 필수 + (`exam_id` 또는 bank 모드 표시)로 완화한다. 그리고 exam_id가 null이면
     "기존 기록 찾아서 update" 단계를 건너뛰고 항상 insert한다(지금 로직은 `.eq('exam_id', null)`이 SQL에서 `IS NULL`로 동작하지 않아서 조회가 어긋난다).
   - **주의:** 이 모드의 `wrong_question_ids`에는 `exam_questions.id`가 아니라 `questions.id`가 들어간다. `analytics`/`autofill`은
     `exam_id`가 null인 기록을 건너뛰니까 지금은 섞이지 않는다. 고칠 때 이 ID 체계 차이를 문서화하거나, 별도 필드로 나눌지 결정해야 한다.
3. AI 문제은행 문제의 `type` 접두어(`reading_`, `essay_`)가 시험 복사 시 제거됨. 원본 `question_type`은 provenance로 되짚을 수 있다.
4. `questions`, `question_sets`, `exams`, `exam_results`의 `CREATE TABLE`이 리포에 없음(스키마 드리프트). `question_sets` 삭제 시 `questions` CASCADE 여부 미확인.

---

## 11. 실제 데이터 확인용 읽기 전용 SQL (실행하지 않음, 필요 시 향미님이 Supabase SQL Editor에서)

```sql
-- exam_questions 가 현재 어떤 출처 정보를 갖고 있는지 분포 확인 (읽기 전용)
select
  case
    when question_data ? 'source' then question_data->>'source'
    when question_data ? 'id' and question_data ? 'question_set_id' then 'legacy_bank'
    else 'unknown'
  end as provenance,
  count(*)
from exam_questions
group by 1;
```
