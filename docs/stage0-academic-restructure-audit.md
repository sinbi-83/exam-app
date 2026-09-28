# 학업관리 개편 0단계 조사 보고서 (설계도 v1 기준)

- 작성일: 2026-09-28
- 범위: 코드 전수 확인 + DB **읽기 전용** 조회(select만, 로그인 계정 RLS 범위). 코드·DB·migration·commit 변경 없음.
- DB 조회 시점 수치: 시험 16 / 시험문항 301 / 성적 0 / 오답기록 0 / AI 세트(question_sets) 45 / 문제은행(questions) 574 / 외부지문 14 / 단어 101 / 단어 출처행 202 / API 사용기록 0
- ⚠️ 작업 폴더에 **이전 세션의 커밋 안 된 변경**이 있다 (단어시험 학습지 출력, "같은 단어로 다른 형태 시험 만들기", 문제 수 프리셋 20/40/60/80, 기본 40).
  파일: `app/exams/[id]/page.tsx`, `app/exams/[id]/print/WordTestPrint.tsx`, `app/exams/[id]/print/page.tsx`, `app/vocab-test/BankMode.tsx`, `lib/wordTest.ts`, `scripts/test-word-test.ts`.
  아래 조사는 이 변경이 들어간 상태 기준이다.

---

## 1. 질문 1~7 답

### Q1. 시험 종류 판별

**`exams` 표에는 종류 칸이 없다.** 실제 칸: `id, user_id, title, exam_date, question_set_id, created_at, academy_id, total_questions, max_score`
(`question_set_id`는 16개 모두 비어 있음, `academy_id`는 코드 어디서도 안 씀. 표 정의 SQL은 리포에 없음 — 대시보드에서 만든 표).

| 위치 | 판별 방식 |
|---|---|
| `lib/wordTest.ts:172` `isWordTestExam` | **문항 type 추론**: 문항이 1개 이상이고 전부 `question_data.type === 'word'`이면 단어시험 |
| `app/exams/[id]/print/page.tsx:171` | 위 함수로 단어시험 전용 레이아웃(`WordTestPrint`) / 일반 레이아웃 분기 |
| `app/exams/[id]/page.tsx:472` (미커밋) | 위 함수로 "학습지 출력", "다른 형태로 만들기" 버튼 표시 |
| `lib/wordTest.ts` `studySheetTitle`, `app/exams/[id]/page.tsx` `convertTo` | 제목 끝 `(영→한|한→영|혼합)`을 정규식으로 떼어 **새 제목을 만들 때만** 씀. 종류 판별에는 안 씀 |
| `app/exams/page.tsx` (시험 목록), `app/grading/page.tsx` (채점·시험카드), `app/api/exams/*`, `app/api/exam-results/*` | **판별 없음.** 제목·만점·문항수만 씀. 성적(`exam_results`)은 `exam_title`을 복사해 저장 |
| `app/api/analytics/route.ts`, `app/wrong-answers/page.tsx`, `app/api/reports/autofill/route.ts` | 시험 종류가 아니라 **문항별 `question_data.type`**으로 영역 점수 계산 (`lib/analyticsShared.ts` `TYPE_LABELS` = vocab/grammar/reading/essay/summary만). `word` 문항은 보고서 자동채움에선 빠지고, 성적분석·오답분석에선 라벨 없이 `word`로 표시됨 (현재 성적·오답 0건이라 실제 영향 없음) |

- 제목으로 종류를 추론하는 코드는 **없다**.
- 실제 데이터: 16개 = 문제시험 3 (AI문제은행 1, 외부지문 2) + 단어시험 13 (전부 `word`/`vocabulary_bank`). 문항 type 추론으로 16개 전부 정확히 나뉜다 → 나중에 `exam_type` 채울 때 기준으로 쓸 수 있음.
- 약점: 단어시험 상세 화면에도 "문제은행/외부지문 담기" 탭이 그대로 있다. 일반 문항을 1개라도 담으면 **그 순간 일반 시험으로 판정이 바뀌어** 인쇄 레이아웃이 바뀌고 정답이 같이 찍힌다.

### Q2. exam_type 확장성

- **시험 단위로 모든 분류를 한 칸에 넣게 강제하는 코드는 없다.** `exam_type` 칸 추가 후, 나중에 `exam_purpose`(Placement 등)·응답 방식 칸을 따로 더하는 구조로 문제없다.
- 단, **문항 단위 `question_data.type`은 이미 여러 축이 섞여 있다**: 내용 영역(vocab/grammar/reading/summary) + 응답 방식(mc/blank/tf/order/match/essay) + 독해 세부(주제/제목/분위기/요지/내용일치) + word.
  성적분석은 이 칸을 "영역"으로 읽는다. → 앞으로 응답 방식·영역 축을 이 칸에서 추론하도록 늘리면 안 된다(원칙 B-6과 같은 방향).
- `exam_type`을 추가할 때 손봐야 할 곳:
  - `exams`에 insert하는 곳 2군데: `app/api/exams/route.ts:51` (시험출제·채점 "시험카드" 생성), `app/api/vocabulary/word-test/route.ts:31`
  - 목록 조회가 칸 이름을 직접 나열함: `app/api/exams/route.ts:19` (새 칸을 select에 추가해야 목록에 보임)
  - 기존 16행: 값이 비어 있을 때 `isWordTestExam`으로 읽을 때 계산하면 **기존 데이터 수정 없이** 동작한다.

### Q3. 정답·해설 출력 경로

| 인쇄 화면 | 현재 정답 출력 | 기본값 |
|---|---|---|
| `app/exams/[id]/print/page.tsx:356-367` 일반 시험지 | **같은 장 맨 아래에 "정답 (선생님용 / 출력 후 제거)" 격자가 항상 찍힌다.** 끄는 방법 없음. 해설은 안 찍힘 | ❌ 답이 찍힘 |
| `app/exams/[id]/print/WordTestPrint.tsx` 단어시험지 | "정답지 포함 (다음 장)" 체크 시 뒷장에 인정 뜻까지 | ✅ 기본 꺼짐 |
| 같은 파일 `StudySheet` (학습지, 미커밋) | 뜻이 보이는 게 목적인 학습지 | — (시험지 아님) |
| `app/external-passages/[id]/print/page.tsx:215` 외부지문 인쇄 | "정답 및 해설" 뒷장(page-break). 태그(어휘/어법/주제 표시)도 기본 켜짐 | ❌ 기본 켜짐 |
| `app/ai-passage/print/page.tsx:456` | `mode: exam/answer/essay`를 sessionStorage로 받아 이미 따로 출력 | 분리돼 있음 |
| `app/question-search/print/page.tsx` | `mode: exam/answer` 분리 | 분리돼 있음 |
| `app/vocab-test/print/page.tsx` (직접 입력 단어테스트) | 정답 영역이 화면에만 보이고 인쇄 시 CSS로 숨김 | ✅ |

- **스냅샷 수정 없이 3가지(학생용/교사용/답안지만)로 나눌 수 있다.** 필요한 값은 모두 `question_data`에 있다 (`answer`, `explanation`, 단어는 `accepted_answers`). 인쇄 화면이 읽는 방식만 바꾸면 된다 (주소 `?view=` 값 + 화면 토글).
- 주의점:
  - 해설이 있는 것: 문제은행 문항, 외부지문 mc/blank/tf, 서술형(채점기준 `rubric` → `explanation`). 없는 것: 외부지문 order/match, 단어 문항 → 해설 칸은 "있을 때만" 표시해야 한다.
  - PDF 저장은 `.print-area` 한 덩어리만 캡처한다(`print/page.tsx:10`). 교사용 뒷장도 그 안에 있어야 하고, 일반 레이아웃에는 뒷장 page-break 설정이 없다 → 추가해야 함.
  - 인쇄 주소는 `title`/`date`를 주소창 값으로 받는다(DB가 아니라). 옵션을 주소에 더할 때 기존 값은 유지해야 한다.

### Q4. 메뉴 URL

학업관리 8개 (`app/components/SidebarNav.tsx:34-44`, `app/components/MobileNav.tsx:36-42`):

| 메뉴 | URL | 하위 주소 | 코드 안 직접 참조 |
|---|---|---|---|
| AI 지문 생성 | `/ai-passage` | `/ai-passage/print` | `app/passages/page.tsx:85,99`; `app/ai-passage/page.tsx:252`, `app/questions/[id]/page.tsx:159,177,193` (print, **sessionStorage `printData`**) |
| AI지문관리 | `/passages` | — | 메뉴에서만 |
| 외부지문저장소 | `/external-passages` | `/[id]`, `/[id]?edit=1`, `/[id]/print` | `app/external-passages/page.tsx:481-598`, `app/external-passages/[id]/page.tsx:108,180,195` |
| 문제은행 | `/questions` | `/questions/[id]` | `app/passages/page.tsx:136`, `app/question-search/page.tsx:364`, `app/questions/page.tsx:188` |
| 문항 검색 | `/question-search` | `/question-search/print` | `app/question-search/page.tsx:238` (**sessionStorage `searchPrintData`**) |
| 시험출제 | `/exams` | `/exams/[id]`, `/exams/[id]/print?exam_id&title&date&sheet` | `app/exams/page.tsx:222`, `app/exams/[id]/page.tsx:422,464`, `app/vocab-test/BankMode.tsx:144,292`, `app/vocabulary/page.tsx:408,415` |
| 단어은행 | `/vocabulary` | — | 메뉴에서만 |
| 단어 테스트 | `/vocab-test` | `/vocab-test/print?title&type&data` | `app/vocabulary/page.tsx:333`, `app/vocab-test/page.tsx:41` |

- 이미 있는 불일치: **모바일 메뉴에 `외부지문저장소`가 없다** (`MobileNav.tsx`).
- 주의: **`/passages` 화면은 AI 세트(`question_sets`)인데, `/api/passages` API는 외부지문(`passages` 표)이다.** 이름이 반대로 겹친다.
- `next.config.js`에 redirect 설정 없음. `middleware.ts`는 로그인 검사만 한다 → `next.config.js`의 `redirects()`로 옛 주소를 연결하면 된다 (쿼리값은 그대로 넘어감).
- **자동 연결이 필요한 주소 목록** (메뉴를 옮겨 URL이 바뀔 때):
  `/ai-passage`, `/passages`, `/external-passages`, `/external-passages/:id`, `/external-passages/:id/print`, `/questions`, `/questions/:id`, `/question-search`, `/question-search/print`, `/exams`, `/exams/:id`, `/exams/:id/print`, `/vocabulary`, `/vocab-test`, `/vocab-test/print`
- sessionStorage로 데이터를 넘기는 인쇄 화면 2개(`/ai-passage/print`, `/question-search/print`)는 같은 탭에서 redirect되면 데이터가 유지되지만, 저장 키 이름을 바꾸면 깨진다.

### Q5. 지문 데이터 흐름 비교

| | AI 지문 (`/ai-passage` → `/passages`) | 외부지문 (`/external-passages`) |
|---|---|---|
| 만드는 방법 | 화면에서 Claude API 호출(`/api/generate-ai-passage`) → "문제 만들기" 누를 때 `POST /api/save-question-set` | Claude Code가 JSON 작성 → `scripts/add-passage.ts` (API 호출 없음) |
| 저장 표 | `question_sets` (세트 1행: grade, topic, passage, translation, items, questions/essay/summary/reading JSON) + `questions` (문항 1개 = 1행) | `passages` (지문 1행 안에 questions[]·essays[] 배열) + `passage_groups` |
| 문항 ID | `questions.id` (uuid, DB 행) | JSON 안의 `qid` |
| 학년 표기 | **`중학교 1학년`, `초등학교 5학년`** (자유 문자열) | **`중1`, `초5`** |
| 난이도 | 문항별 숫자 2/3/4 (beginner/intermediate/advanced) | 지문별 `variant_level` school/academy/advanced/prestudy (그룹 4단계) |
| 문항 유형 | vocab/grammar/summary/reading_*/essay_* (4지선다 중심) | mc/blank/tf/order/match + essay |
| 고유 칸 | translation(해석), sentences | tagged_body(태그 마크업), tags, title |
| 보관/삭제 | 보관(archive) 없음, 삭제만 | archived/archived_at 있음 |
| 인쇄 | sessionStorage로 넘김 (`/ai-passage/print`) | id 주소 (`/external-passages/[id]/print`) |
| 시험 담기 | `/exams/[id]` 문제은행 탭 (`source: 'question_bank'`) | `/exams/[id]` 외부지문 탭 (`source: 'external_passage'`, qid) |

**합칠 때 깨질 수 있는 곳**
1. 두 표를 한 목록으로 보여주려면 학년 표기(`중학교 1학년` ↔ `중1`)와 난이도 체계(숫자 ↔ 4단계)를 화면에서 변환해야 한다. DB 값은 바꾸지 않는다.
2. `/passages` 주소를 "지문" 통합 화면으로 쓰면 옛 `/passages`(AI 세트 목록)와 뜻이 달라진다. 새 주소를 쓰거나 탭으로 흡수해야 한다.
3. 삭제 방식이 다르다: AI 세트는 삭제하면 `questions` 행도 사라진다(고아 문항 0개 → CASCADE로 보임). 외부지문은 보관 방식. 통합 목록의 "삭제" 버튼이 두 방식을 섞으면 위험.
4. 이미 시험에 담긴 문항은 스냅샷이라 합쳐도 영향 없음.

**AI 지문 생성 최근 사용 기록**
- 저장된 AI 세트 45개: 2026-08-21 ~ **2026-09-14 (마지막)** (8월 15개, 9월 30개).
- API 사용기록(`api_usage_logs`)은 9/21부터 남는데 **0건** → 9/21 이후 AI 지문 생성 호출 없음.
- AI 문제은행 문항으로 만든 시험: 1개 (2026-09-03 "6학년 영어test").

### Q6. 단어은행 상태 이력 (101개)

| 현재 상태 | 개수 | 출처 |
|---|---|---|
| approved (사용 중) | 73 | teacher-seed 59 + floor 11 + ceiling 3 (address 91, undermine 88, yield 85) |
| archived (사용 중단) | 28 | ceiling 27 + teacher-seed 1 (contribute 81) |
| pending / rejected | **0 / 0** | — |

- **어떻게 들어왔나:** 101개 모두 `scripts/add-vocabulary-seed.ts`가 넣었다(2026-09-27 22:23 KST에 60개, 23:09 KST에 41개). 이 스크립트는 처음부터 **`status='approved'`, `approval_origin='batch'`**로 넣는다 (`scripts/add-vocabulary-seed.ts:68-72`).
  → **101개 모두 교사가 직접 "승인"을 누른 기록이 없다** (`approval_origin='individual'` 0개).
- **교사 확인 기록:** 101개 모두 `teacher-review:` 검수 완료 기록이 정확히 1개씩 있다 (2026-09-28 12:57~13:23 KST, 검수 모드). 판단 이유는 101개 모두 "검수 완료"뿐이고 사유(너무 어려움, 교육 범위 밖 등)는 없다.
  → "값이 맞는지 봤다"는 기록은 있지만 "사용하기로 승인했다"는 기록은 아니다.
- **아카이브 경로:** 아카이브를 하는 스크립트나 일괄 처리 코드는 없다. 아카이브는 `/vocabulary` 상세의 버튼(개별)으로만 된다.
  28개 중 26개는 아카이브 시각과 검수 완료 시각이 0~2초 차이 → 검수 모드에서 교사가 개별로 누른 것으로 보인다.
  나머지 2개(`account for`/설명하다 86, `arbitrary` 92)는 **9/27 23:20~23:22 KST에 아카이브**됐고(시드 등록 11분 뒤, 검수 모드 커밋 직후), 이 시각을 뒷받침할 기록이 없어 **경로를 확정할 수 없다** (상태 변경 이력 표가 없음).
- **아카이브 사유:** **저장되지 않는다.** 칸이 없고(`reject_reason`은 DB 제약상 반려 상태에서만 허용), 검수 메모도 "검수 완료"뿐이다.
  → 기록으로는 "중1 범위 밖"을 구분할 수 없다. 다만 **정황상 구분은 된다**: 아카이브 28개는 난이도가 **전부 81~97**이고, 현재 중1 기준표 최고치는 75(`config/vocabularyLevels.ts` 선행형 45~75)다. 28개 모두 중1 범위 밖이다.
  또 27개는 ceiling 기준점이라 아카이브하지 않아도 일반 단어시험 후보에서 이미 빠진다(`generalTestCandidates`).

### Q7. '나중에 결정' 보류 표시 + '결정 안 된 단어 N개'

- **추가형으로 가능하다.** 최소 변경:
  1. migration 1개: `vocabulary_entries`에 `deferred_at timestamptz` (null 허용) 추가 + 제약 `deferred_at is null or status = 'pending'`. 기존 행은 전부 null이라 데이터 변경 없음.
  2. API `PATCH /api/vocabulary/[id]`에 `action: 'defer'` 추가(pending→pending + deferred_at 기록). 사용하기/영구 제외로 옮길 때 deferred_at 비우기.
  3. 탭 계산: 확인 필요 = pending & deferred_at null / 나중에 결정 = pending & deferred_at 있음. **"결정 안 된 단어 N개" = pending 전체 수** (DB 칸 추가 없이 계산).
- migration 없이 하는 방법(출처 표에 `teacher-defer:` 행 추가)도 있지만, 출처 표는 수정 정책이 없어 보류 해제 때 행을 지워야 한다. 기록 표를 상태 저장에 쓰게 되어 권하지 않는다.
- 현재 pending이 0개라 지금 N은 0이다.

---

## 2. 설계도와 현재 코드가 충돌하는 곳

| 설계도 | 현재 코드 | 위치 |
|---|---|---|
| C-1 스크립트는 '확인 필요'로만 넣는다 | 시드 스크립트가 `approved`/`batch`로 넣음 | `scripts/add-vocabulary-seed.ts:68-72` |
| C-1 사용 중단 → 영구 제외 가능 | `archived → rejected` 전환 불가 (archived는 approved로만) | `lib/vocabulary.ts:173-178` |
| C-1 영구 제외 사유 4개, '너무 쉬움' 없음 | 사유 8개 (`too_easy`, `too_hard`, `level_mismatch`, `extraction_error` 포함). DB CHECK도 8개 | `lib/vocabulary.ts:41`, `vocabulary-bank-migration.sql` |
| C-1 화면 이름 (확인 필요/사용 중/사용 중단/영구 제외) | 검토대기/승인/아카이브/반려 | `lib/vocabulary.ts:27` |
| C-1 영구 제외 = "같은 표현+같은 뜻"이면 막음 | 중복 판정 키에 **품사도 포함** (표현+품사+뜻). 품사만 다르면 다시 들어옴. 반려 항목을 soft delete하면 막힘도 풀림 | `lib/vocabulary.ts:96`, unique index |
| C-2 '범위 밖'은 상태로 저장하지 않는다 | 중1 범위 밖 28개가 `archived` 상태로 저장돼 있음 (정황) | DB |
| C-2 1차 대상 초5·중1·중3 | 기준표는 중1(임시)만 있음 | `config/vocabularyLevels.ts` |
| C-3 공식 기준표는 단어은행 항목이 아니다 | `vocabulary_sources.source_type='official'` 칸은 있지만 별도 기준표 구조는 없음 (3단계에서 새로 만들어야 함) | `vocabulary-bank-migration.sql` |
| C-4 기본값 학생용 | 일반 시험지는 정답이 항상 찍힘. 외부지문 인쇄는 정답 기본 켜짐 | `app/exams/[id]/print/page.tsx:356`, `app/external-passages/[id]/print/page.tsx:39` |
| C-5 단어 시험 = 단어은행 자동 / 직접 입력(저장 안 됨) | 이미 `/vocab-test`에 두 모드 존재 → 설계와 일치 | `app/vocab-test/*` |
| B-6 exam_type 두 값 | 칸 자체가 없음 | `exams` 표 |
| B-1 API 0 | 기존 AI 지문 생성·보고서 생성이 `ANTHROPIC_API_KEY`로 API를 호출 중 (새로 추가하는 건 아니므로 원칙 위반은 아님. C-5 "존치 여부"와 연결) | `app/api/generate-*` |

---

## 3. 1~6단계에서 깨질 위험 (위험한 순서)

1. **인쇄 (2단계, 5단계):** 지금 일반 시험지를 그냥 인쇄하면 답이 찍힌다. 2단계 전까지는 실제 사고 위험. 2단계에서 PDF(`.print-area` 한 덩어리 캡처)와 뒷장 page-break를 같이 고치지 않으면 교사용 PDF가 깨진다.
2. **시험 종류 추론 (5단계):** `isWordTestExam`이 문항 구성으로 판단해서, 단어시험에 일반 문항을 1개 담으면 종류가 바뀐다. `exam_type`을 넣은 뒤에도 옛 시험(null)은 추론에 기대므로 두 방식을 같이 가져가야 한다.
3. **단어 상태 바로잡기 (1단계):** 28개 아카이브를 '사용 중'으로 돌리면 전환 규칙과 DB 제약(archived↔archived_at 짝, approval_origin 필수)은 통과하지만, **교사가 정한 값을 스크립트가 덮지 않는다(B-5)**는 원칙과 부딪친다. 교사 화면에서 직접 누르게 하거나 명시적 승인이 필요하다.
4. **URL 이동 (5·6단계):** `/exams/[id]`, `/exams/[id]/print`는 시험 목록·시험 상세·단어시험 저장 완료·단어은행 검수 화면(4개 파일 7곳)에서 직접 만든다. sessionStorage 인쇄 2개는 키 이름에 기대고 있다. `/passages` 이름 충돌.
5. **지문 통합 (6단계):** 학년 표기·난이도 체계·삭제 방식이 달라서 통합 목록에서 필터·정렬·삭제가 섞이면 오동작할 수 있다.
6. **공식 기준표 (3단계):** 새 표가 필요(migration). 단어은행 항목과 섞지 않는다는 설계(C-3)를 지키려면 `vocabulary_entries`에 넣지 않는 구조로 가야 한다.
7. **어휘 보강 (4단계):** 시드 스크립트를 그대로 쓰면 `approved`로 들어간다 → 4단계 전에 반드시 `pending`으로 바꿔야 한다.

---

## 4. 조사하면서 스스로 판단한 내용

1. **DB는 읽기 전용으로 조회했다.** 질문 5·6은 DB를 봐야 답할 수 있어서, `.env.local`의 로그인 계정으로 select만 했다(스크립트는 작업 공간 밖 임시 폴더, 프로젝트에 남기지 않음).
2. **아카이브 28개 = "중1 범위 밖"으로 판정했다(정황).** 기록은 없지만 28개 전부 난이도 81~97이고, 중1 기준표 최고치 75를 넘는다. 다른 공통점은 없었다.
3. **'검수 완료' 기록을 교사 승인으로 치지 않았다.** 값 확인이지 사용 결정이 아니고, 승인 경로는 101개 모두 `batch`다. 설계도 B-5("실제로 확인하지 않은 것은 교사 확인으로 표시하지 않음")를 엄격하게 적용했다.
4. **보류 표시는 migration(칸 1개 추가)을 권한다.** 출처 표를 쓰는 우회책은 기록 표를 상태 저장에 쓰게 된다.
5. **`exam_type`은 null 허용 + 읽을 때 추론 fallback을 권한다.** 기존 16행을 migration으로 채우는 건 원칙 3·"기존 데이터 수정"에 해당해서 따로 승인받을 일로 분리했다.
6. **C-4의 "모든 시험 인쇄 화면"은 `/exams/[id]/print`(일반·단어 두 레이아웃)로 해석했다.** 외부지문 인쇄·AI 지문 인쇄·문항검색 인쇄는 시험(`exams`) 인쇄가 아니다. 외부지문 인쇄의 정답 기본 켜짐은 충돌 목록에만 적고 2단계 보고 때 따로 제안한다.
7. **커밋 안 된 이전 작업은 이번 조사에서 건드리지 않았다.**

---

## 5. 1단계 시작 전에 결정할 것

1. **아카이브 28개 + 승인 73개의 처리.** (a) 28개를 '사용 중'으로 되돌리고 학년 범위 필터에 맡긴다 (설계 C-2대로) — 교사가 화면에서 직접 하거나, 명시적 승인 후 일괄 처리 / (b) 그대로 둔다.
   그리고 스크립트가 승인한 73개(교사 개별 승인 없음)를 '사용 중'으로 인정할지, '확인 필요'로 돌려 다시 볼지.
2. **'나중에 결정'용 migration(칸 1개 `deferred_at`) 실행을 승인할지.** 1단계 C-1 탭의 전제다.
3. **커밋 안 된 이전 작업(학습지·형태 바꾸기·문제 수 프리셋)을 1단계 전에 따로 커밋할지.** 단계별 커밋 원칙상, 1단계 커밋에 섞이지 않게 먼저 정리해야 한다.
