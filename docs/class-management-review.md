# 반 관리 전 현재 시스템 전체 검토서

- 작성일: 2026-11-01 · 기준 커밋: `860fb8a` · 작업 방식: 읽기만 함 (코드·DB·설정 변경, 마이그레이션, 커밋, 배포 없음)
- 정정: 같은 날 0단계와 후속 작업을 반영했다. 본문은 조사 당시 기준이고, 바뀐 곳은 "정정"으로 표시했다. 자세한 내용은 부록을 본다.
- 표시: **[사실]** 파일이나 DB 조회로 확인함 / **[추정]** 근거로 미루어 판단함, 확인 필요
- 분량이 많아도 이 파일 하나로 썼다. 나뉜 파일 없음.

## 요약 10줄

1. 전체 규모: 화면 57개, API 51개, DB 표 26개, 저장소 1개, 스크립트 56개, SQL 파일 18개, 커밋 161개.
2. 실제 자료: 학생 1명, 원비 2건뿐이고 출석·숙제·성적·보고서·일정·레벨테스트 결과는 0건이라, 지금이 구조를 바꾸기 가장 쉬운 때다.
3. 교재 쪽 자료는 많다: 지문 86개, 시험 35개, 시험 문항 781개, 문제은행 574개, 단어 2,998개.
4. 새로 발견한 기능: 메뉴에 없는 화면 27개(상세·인쇄 포함), 오답 노트, 지문 통합 목록, 인쇄 샘플, 일정 알림 종, 쓰지 않는 API 1개, 코드가 쓰지 않는 `academies` 표와 `academy_id` 칸.
5. 반 관리 관련 현황: 반 표, 학생 상태 칸, 일정과 학생·반의 연결이 모두 없다.
6. 큰 충돌 하나: 출석은 "학생 1명당 하루 1건"이라, 하루에 두 반을 듣는 학생을 반별로 기록할 수 없다.
7. 학생을 이름으로만 연결할 수 있는 곳은 레벨테스트 결과 하나이고(학생 연결은 선택), 학교 연결은 학교 이름 글자 비교다.
8. 미해결 이슈 중 숙제 마감 UTC와 문항 검색 오류는 조사 때 이미 해결돼 있었고, 나머지 UTC 날짜 문제는 0단계와 후속 작업에서 고쳤다(정정). 어법 수정안 4개는 남아 있다.
9. 새로 찾은 문제: 보고서 표에 칸 4개가 없어 보고서 저장이 실패할 것으로 보인다(저장 0건). AI API 4개 모두 비로그인을 막지 않았고, 0단계와 후속 작업에서 고쳤다(정정).
10. 가장 큰 위험 3가지: ① 퇴원 기능 없이 학생을 지우면 기록이 함께 사라짐 ② 실제 DB와 SQL 파일 불일치 ③ 출석 날짜의 UTC 오류(코드는 수정됨, 정정).

### 가장 큰 위험 3가지

1. **학생 삭제가 곧 기록 삭제이고, 모든 화면이 "전체 학생 = 현재 학생"으로 가정한다.** 학생을 지우면 출석·숙제·원비·알림·오답 기록이 연쇄 삭제된다. 학생 상태 칸이 없고, 학생 목록을 쓰는 화면 9곳, 레벨테스트·학교 정보의 공용 부품, 대시보드 집계를 모두 고쳐야 한다.
2. **실제 DB와 저장소의 SQL 파일이 어긋난다.** `students`, `exams`, `exam_results`, `question_sets`, `questions`는 만드는 SQL이 없고, `reports`에는 코드가 쓰는 칸 4개가 없으며, 학부모 조회 함수 정의도 없다. 이 상태로 기존 표를 바꾸면 무엇이 깨질지 미리 알기 어렵다.
3. **출석 날짜가 UTC 기준이었다 (정정: `cca9eeb`에서 코드 수정, 아직 배포 전).** 오전 9시 전에 출석 화면을 열면 기본 날짜가 전날이고, 월간 요약은 말일을 빠뜨렸다. 이미 잘못 저장된 자료는 없다(출석 0건).

---

## 1. 기능 지도

### 1-1. 메뉴 구조

[사실] 근거: `config/navigation.ts`

| 큰 메뉴 | 항목 |
|---|---|
| 대시보드 | 오늘 할 일 |
| 자료 | 지문, 외부지문저장소, 문제은행, 문항 검색, 단어은행, 지문 단어장, 레벨테스트, 학교 정보 |
| 시험 출제 | 문제 시험, 단어 시험, 혼합 시험 |
| 시험 관리 | 시험지 보관함, 채점·결과 |
| 학생관리 | 학생관리, 보고서 작성, 보고서 목록, 성적분석, 출석관리, 숙제관리, 오답 분석 |
| 운영관리 | 설정, API 사용량, 수업 일정, 원비 관리 |
| 알림 | 학부모 알림 |
| 레거시 | 이전 문제 생성기, 시험지 기록 |

옛 주소 16개는 새 주소로 자동 연결된다. [사실] 근거: `config/legacyRoutes.json`

### 1-2. 화면 전체 (57개)

[사실] `app/` 아래 `page.tsx` 전부를 코드에서 조사했다. 표와 API는 화면 파일, 같은 폴더 파일, 불러오는 코드에서 찾은 값이다. "메뉴 없음"은 왼쪽 메뉴에 직접 없다는 뜻이고, 다른 화면의 버튼으로 들어갈 수도 있다.

| 화면 이름 | 주소 | 위치 | 하는 일 | 읽고 쓰는 DB 표 | 쓰는 API (`/api/` 생략) |
|---|---|---|---|---|---|
| 성적분석 | `/analytics` | 메뉴 | 전체 평균 추이, 학생별 점수, 유형별 취약점 | exam_questions, exam_results, exams, students, wrong_answer_records | analytics |
| API 사용량 | `/api-usage` | 메뉴 | AI 호출 기록과 비용, 문제은행 통계 | api_usage_logs, question_sets, questions | api-usage, stats |
| 출석관리 | `/attendance` | 메뉴 | 날짜별 전체 학생 출결 입력, 월간 요약, 학부모 알림 저장 | attendance, parent_notifications, students | attendance, notifications, students |
| 혼합 시험 | `/create/mixed` | 메뉴 | 지문 문항과 단어를 섞어 시험 저장 | exam_questions, exams, passages, question_sets, questions, vocabulary_entries | exams/mixed, mixed-test/candidates, passages-unified, vocabulary |
| 시험 출제 첫 화면 | `/create` | 메뉴 | 문제·단어·혼합 시험 입구 | - | - |
| 문제 시험 | `/create/problem` | 메뉴 | 시험 카드 만들기 → 문항 구성으로 이동 | exams | exams |
| 단어 시험 | `/create/word` | 메뉴 | 단어은행에서 단어 시험 생성 | exam_questions, exams, vocabulary_entries | vocabulary, vocabulary/word-test |
| 단어 시험 인쇄(임시) | `/create/word/print` | 메뉴 없음 | 브라우저 임시 자료로 인쇄 | - | - |
| 대시보드 | `/dashboard` | 메뉴 | 오늘 할 일 숫자, 오늘 시간표, 빠른 실행 | exam_assignments, exam_results, exams, homework, level_test_results, reports, schedule_events, students, tuition_records | - |
| 오답 노트 | `/error-notes` | 메뉴 없음 | 시험별 성취율과 학생 요약 | exam_results, students | exam-results, students |
| 채점·결과 | `/grading` | 메뉴 | 시험 카드, 응시 대상, 점수 입력, 채점 대기 | exam_assignments, exam_results, exams, students | exam-assignments, exam-results, exam-results/{id}, exams, exams/{examId}, students |
| 시험지 기록 상세 | `/history/[id]` | 메뉴 없음 | 이전 문제지 한 건 보기 | exam_sheets | exam-sheets, exam-sheets/{id} |
| 시험지 기록 | `/history` | 메뉴 | 이전 생성기로 만든 문제지 목록 | exam_sheets | exam-sheets, exam-sheets/{id} |
| 숙제관리 | `/homework` | 메뉴 | 학생별 숙제 등록, 완료 처리, 마감 필터 | homework, students | homework, homework/{hw.id}, homework/{id}, students |
| 로그인 | `/login` | 메뉴 없음 | 이메일 로그인 | - | - |
| 레벨테스트 채점 | `/materials/level-tests/[grade]/[form]/grade` | 메뉴 없음 | 종이 답 입력 후 채점, 결과 저장 | level_test_results, students | level-tests/results, students |
| 레벨테스트 인쇄 | `/materials/level-tests/[grade]/[form]/print` | 메뉴 없음 | 시험지·답안지·정답해설 인쇄 | students | students |
| 레벨테스트 응시 | `/materials/level-tests/[grade]/[form]/take` | 메뉴 없음 | 태블릿·휴대폰 응시, 결과 저장 | level_test_results, students | level-tests/results, students |
| 레벨테스트 학년 | `/materials/level-tests/[grade]` | 메뉴 없음 | 학년별 A형·B형과 결과 | level_test_results, students | level-tests/results, students |
| 레벨테스트 | `/materials/level-tests` | 메뉴 | 학년 폴더(초3~고3), 최근 결과 | level_test_results, students | level-tests/results, students |
| 레벨테스트 결과 | `/materials/level-tests/results/[id]` | 메뉴 없음 | 결과 확인·수정, 추천 반 표시 | level_test_results, students | level-tests/results/{id}, students |
| 상담용 결과지 | `/materials/level-tests/results/[id]/print` | 메뉴 없음 | 상담에 쓰는 결과지 인쇄 | academy_settings, level_test_results | level-tests/results/{id}, settings/academy |
| 자료 첫 화면 | `/materials` | 메뉴 | 자료 메뉴 안내 카드 | - | - |
| AI 지문 생성 | `/materials/passages/ai/new` | 메뉴 없음 | AI로 지문·문제 생성 후 저장 | api_usage_logs, question_sets, questions | generate-ai-passage, save-question-set |
| AI 지문 관리 | `/materials/passages/ai` | 메뉴 없음 | 문제 세트 목록, 삭제 | question_sets, questions | question-sets, question-sets/{id} |
| AI 지문 인쇄 | `/materials/passages/ai/print` | 메뉴 없음 | 브라우저 임시 자료로 인쇄 | - | - |
| 지문 통합 목록 | `/materials/passages/all` | 메뉴 없음 | AI·외부 지문을 읽기 전용으로 함께 보기 | passages, question_sets | passages-unified |
| 외부지문 상세 | `/materials/passages/external/[id]` | 메뉴 없음 | 지문·문제 보기와 수정 | passages | passages/{id} |
| 외부지문 인쇄 | `/materials/passages/external/[id]/print` | 메뉴 없음 | 지문과 문제 인쇄 | passages | passages/{id} |
| 외부지문저장소 | `/materials/passages/external` | 메뉴 | 지문·세트 목록, 보관, 삭제 | passage_groups, passages | passage-groups/{groupId}, passages, passages/{id} |
| 지문 첫 화면 | `/materials/passages` | 메뉴 | AI 지문·외부지문 입구 | - | - |
| 문제은행 상세 | `/materials/questions/[id]` | 메뉴 없음 | 세트 문항 보기, 인쇄 연결 | question_sets | question-sets/{id} |
| 문제은행 | `/materials/questions` | 메뉴 | 문제 세트 목록 | question_sets, questions | question-sets |
| 문항 검색 | `/materials/questions/search` | 메뉴 | 문항 조건 검색, 선택 인쇄 | question_sets, questions | questions/search |
| 문항 검색 인쇄 | `/materials/questions/search/print` | 메뉴 없음 | 고른 문항 인쇄 | - | - |
| 학교 상세 | `/materials/schools/[region]/[school]` | 메뉴 없음 | 교과서·시험 일정·출제스타일·예시 문제 칸 | school_profiles, students | schools/profiles, students |
| 학교 목록 | `/materials/schools/[region]` | 메뉴 없음 | 지역 학교 카드, 우리 학생 수(학교 이름 글자 비교) | school_profiles, students | schools/profiles, students |
| 학교 정보 | `/materials/schools` | 메뉴 | 지역 폴더 | - | - |
| 단어은행 | `/materials/vocabulary` | 메뉴 | 단어 검수·승인·수정, 단어 시험 연결 | exam_questions, exams, official_vocabulary, vocabulary_entries, vocabulary_sources | vocabulary, vocabulary/{currentId}, vocabulary/{id}, vocabulary/{selected.id}/exclusion-check, vocabulary/bulk, vocabulary/word-test |
| 단어장 편집 | `/materials/wordbooks/[passageId]` | 메뉴 없음 | 지문별 단어·뜻 편집 | passage_wordbooks, passages, vocabulary_entries | wordbooks/{passageId} |
| 단어장 인쇄 | `/materials/wordbooks/[passageId]/print` | 메뉴 없음 | A4 단어지·단어 테스트지 | passage_wordbooks, passages, vocabulary_entries | wordbooks/{passageId} |
| 지문 단어장 | `/materials/wordbooks` | 메뉴 | 단어장 목록 | passage_wordbooks, passages | passages, wordbooks |
| 학부모 알림 | `/notifications` | 메뉴 | 알림 문구 저장·기록 (실제 발송 기능은 확인되지 않음) | parent_notifications, students | notifications, students |
| 이전 문제 생성기 | `/` | 메뉴 | 지문을 넣어 AI로 문제지 생성 (메뉴의 레거시 항목) | exam_sheets | exam-sheets, exam-sheets/{id}, generate |
| 학부모 조회 | `/parent/[id]` | 메뉴 없음 | 로그인 없이 PIN으로 성적 조회 | - | parent-view |
| 보고서 작성 | `/report` | 메뉴 | 학생·시험 선택, AI 초안, 저장 후 인쇄 | api_usage_logs, exam_questions, exam_results, exams, reports, students, wrong_answer_records | exams, generate-report, reports, reports/autofill, students |
| 보고서 인쇄 | `/report/print` | 메뉴 없음 | 주소 값으로 그리는 인쇄 화면 | academy_settings | settings/academy |
| 보고서 목록 | `/reports` | 메뉴 | 저장된 보고서, 확인·발송 상태 | reports | reports |
| 수업 일정 | `/schedule` | 메뉴 | 날짜별 일정 등록 (학생·반과 연결 없음) | schedule_events | schedule |
| 설정 | `/settings` | 메뉴 | 교습소 이름, 로고, 서명 | academy_settings | settings/academy, settings/brand-upload |
| 학생관리 | `/students` | 메뉴 | 학생 등록·수정·삭제, PIN, 학부모 링크 | students | students, students/{editId}, students/{id} |
| 시험 상세·문항 구성 | `/tests/[id]` | 메뉴 없음 | 문제은행·외부지문·단어에서 문항 담기 | exam_questions, exams, passages, question_sets, questions, vocabulary_entries | exam-questions, exams/{examId}, passages, passages/{id}, question-sets, questions/search, vocabulary, vocabulary/word-test |
| 시험지 인쇄 | `/tests/[id]/print` | 메뉴 없음 | 학생용·교사용·답안지 인쇄, PDF | exam_questions | exam-questions |
| 시험지 보관함 | `/tests` | 메뉴 | 저장된 시험 목록, 이름 수정, 삭제 | exams | exams, exams/{id} |
| 인쇄 샘플(점검용) | `/tests/print-sample` | 메뉴 없음 | 코드 안 예시 문항으로 인쇄 모양 확인 | - | - |
| 원비 관리 | `/tuition` | 메뉴 | 월별 학생 원비 입력, 미납 필터, 알림 | parent_notifications, students, tuition_records | notifications, students, tuition |
| 오답 분석 | `/wrong-answers` | 메뉴 | 틀린 문항 입력, 유형 분석, 보고서로 넘기기 | exam_questions, exams, question_sets, questions, students, wrong_answer_records | exam-questions, exams, questions/search, students, wrong-answers |

### 1-3. API 전체 (51개)

[사실] 근거: `app/api/**/route.ts`, `app/logout/route.ts`

| API | 방식 | DB 표 | 비고 |
|---|---|---|---|
| `/api/analytics` | GET | exam_questions, exam_results, exams, students, wrong_answer_records | - |
| `/api/api-usage` | GET | api_usage_logs | AI 호출 또는 사용량 |
| `/api/attendance` | GET,POST | attendance | - |
| `/api/exam-assignments` | GET,PUT,PATCH | exam_assignments, exams | - |
| `/api/exam-questions` | GET,POST,DELETE,PATCH | exam_questions | - |
| `/api/exam-results/[id]` | DELETE | exam_results | - |
| `/api/exam-results` | GET,POST | exam_results | - |
| `/api/exam-sheets/[id]` | GET | exam_sheets | - |
| `/api/exam-sheets` | GET,POST | exam_sheets | - |
| `/api/exams/[id]` | GET,PATCH,DELETE | exams | - |
| `/api/exams/mixed` | POST | exam_questions, exams, vocabulary_entries | - |
| `/api/exams` | GET,POST | exams | - |
| `/api/generate-ai-passage` | POST | api_usage_logs | AI 호출 또는 사용량; 조사 때 비로그인을 막지 않음 (정정, 부록 A) |
| `/api/generate-passage` | POST | api_usage_logs | AI 호출 또는 사용량; 호출하는 곳 없음; 조사 때 비로그인을 막지 않음 (정정, 부록 A) |
| `/api/generate-report` | POST | api_usage_logs | AI 호출 또는 사용량; 조사 때 비로그인을 막지 않음 (정정, 부록 A) |
| `/api/generate` | POST | - | AI 호출 또는 사용량; 조사 때 로그인 검사 없음 (`cca9eeb`에서 수정) |
| `/api/homework/[id]` | PATCH,DELETE | homework | - |
| `/api/homework` | GET,POST | homework | - |
| `/api/level-tests/results/[id]` | GET,PATCH,DELETE | level_test_results | - |
| `/api/level-tests/results` | GET,POST | level_test_results | - |
| `/api/mixed-test/candidates` | GET | passages, question_sets, questions | - |
| `/api/notifications` | GET,POST,DELETE | parent_notifications | - |
| `/api/parent-view` | POST | - | 로그인 검사 없음 (공개 설계, PIN으로 확인) |
| `/api/passage-groups/[id]` | PATCH,DELETE | passage_groups | - |
| `/api/passages-unified` | GET | passages, question_sets | - |
| `/api/passages/[id]` | GET,PATCH,DELETE | passages | - |
| `/api/passages` | GET | passages | - |
| `/api/question-sets/[id]` | GET,DELETE | question_sets | - |
| `/api/question-sets` | GET | question_sets, questions | - |
| `/api/questions/search` | GET | question_sets, questions | - |
| `/api/reports/autofill` | GET | exam_questions, exam_results, wrong_answer_records | - |
| `/api/reports` | GET,POST,PATCH,DELETE | reports | - |
| `/api/save-question-set` | POST | question_sets, questions | - |
| `/api/schedule` | GET,POST,DELETE | schedule_events | - |
| `/api/schedule/upcoming` | GET | schedule_events | 모든 화면 위 일정 알림 종에서 호출 |
| `/api/schools/profiles` | GET,PUT | school_profiles | - |
| `/api/settings/academy` | GET,PUT | academy_settings | - |
| `/api/settings/brand-upload` | POST | academy_settings + 저장소 brand | - |
| `/api/stats` | GET | question_sets, questions | - |
| `/api/students/[id]` | DELETE,PATCH | students | - |
| `/api/students` | GET,POST | students | - |
| `/api/tuition` | GET,POST,DELETE | tuition_records | - |
| `/api/vocabulary/[id]/exclusion-check` | GET | exam_questions, official_vocabulary, vocabulary_entries | - |
| `/api/vocabulary/[id]` | GET,PATCH | vocabulary_entries, vocabulary_sources | - |
| `/api/vocabulary/bulk` | POST | vocabulary_entries | - |
| `/api/vocabulary` | GET | vocabulary_entries | - |
| `/api/vocabulary/word-test` | POST | exam_questions, exams | - |
| `/api/wordbooks/[passageId]` | GET,PUT,DELETE | passage_wordbooks, passages, vocabulary_entries | - |
| `/api/wordbooks` | GET | passage_wordbooks | - |
| `/api/wrong-answers` | GET,POST,DELETE | wrong_answer_records | - |
| `/logout` | POST | - | - |

공용 부품이 부르는 API: `app/components/ScheduleAlertBell.tsx`(`schedule/upcoming`), `components/levelTest/LevelTestParts.tsx`·`components/schools/SchoolParts.tsx`(`students`). [사실]

### 1-4. 새로 발견한 기능

| 기능 | 내용 | 표시 |
|---|---|---|
| 레벨테스트 | 초3~고3, 학년별 A형·B형. 인쇄, 종이 채점, 태블릿 응시, 추천 반, 상담용 결과지. 결과 0건. 추천 반은 글자로만 나오고 실제 반과 연결되지 않는다 | [사실] `app/materials/level-tests/`, `config/levelTestBands.ts` |
| 지문 단어장 | 지문 36개에 단어장 저장, A4 단어지·테스트지 | [사실] `app/materials/wordbooks/` |
| 학교 정보 | 남구 중학교 6곳, 칸 9개. 학생과는 학교 이름 글자 비교로만 연결 | [사실] `config/schools.ts` |
| 오답 노트 | `/error-notes`. 메뉴에 없고 다른 화면의 연결도 찾지 못함 | [사실] 파일 검색 |
| 지문 통합 목록 | `/materials/passages/all`. 지문 첫 화면의 작은 링크로만 들어감 | [사실] `app/materials/passages/page.tsx:26` |
| 인쇄 샘플 | `/tests/print-sample`. DB를 쓰지 않는 점검용 화면 | [사실] 파일 첫 주석 |
| 학부모 조회 | `/parent/[id]`. 로그인 없이 4자리 PIN으로 성적 조회 | [사실] `middleware.ts`, `app/parent/[id]/page.tsx` |
| 학부모 알림 | 문구를 저장하고 기록하는 화면이다. 문자·카톡 실제 발송 코드는 찾지 못함 | [추정] 코드 검색 결과 |
| 상담 | 별도 화면이나 표는 없다. 레벨테스트 결과지·메모에서 "상담" 문구로만 쓴다 | [사실] 상담 관련 표 조회 없음, 코드 검색 |
| 일정 알림 종 | 모든 화면 위쪽에서 2일 안의 일정을 알려 준다. 메뉴에 없는 공용 기능 | [사실] `app/layout.tsx:77`, `app/components/ScheduleAlertBell.tsx:31` |
| 쓰지 않는 API | `/api/generate-passage`는 어디서도 호출하지 않는다 | [사실] 코드 검색 0건 |
| `academies` 표, `academy_id` 칸 | 코드와 SQL 어디에도 없는데 DB에 있다. 예전 다중 교습소 시도의 흔적으로 보인다 | [사실] 존재·미사용, [추정] 유래 |

---

## 2. DB 구조

### 2-1. 확인 방법과 한계

- [사실] 로그인 계정으로 표마다 건수와 칸 이름을 조회했다. 행이 있으면 실제 칸 이름, 빈 표는 코드·SQL의 후보 칸을 하나씩 조회해 있는지 확인했다.
- [사실] 표 구조 안내(OpenAPI)는 이 계정으로 열리지 않았다(401). 기본키, 외래키, 인덱스, 정책은 **SQL 파일 기준**이고 실제 DB와 다를 수 있다.
- [사실] `SUPABASE_SERVICE_ROLE_KEY`는 모든 보안을 무시하는 키라 쓰지 않았다.
- 건수는 이 계정으로 보이는 행 수다.

### 2-2. 표 전체

| 표 | 건수 | 칸 | 기본키 | 외래키 (SQL 기준) | 인덱스·고유 조건 (SQL 기준) | SQL 파일 |
|---|---:|---|---|---|---|---|
| `students` | 1 | id, user_id, name, grade, pin, created_at, academy_id, school_name, student_phone, parent_phone, enrolled_at, notes | id [추정] | SQL 없음 | 알 수 없음 | **없음** |
| `exams` | 35 | id, user_id, title, exam_date, question_set_id, created_at, academy_id, total_questions, max_score, exam_type | id [추정] | SQL 없음 | 알 수 없음 | **없음**, exam_type만 stage1 |
| `exam_results` | 0 | id, user_id, student_id, exam_id, exam_title, score, max_score, exam_date, created_at (코드 사용 칸만 확인) | id [추정] | SQL 없음 | 알 수 없음 | **없음** |
| `question_sets` | 45 | id, user_id, grade, topic, passage, translation, items, questions, created_at, sentences, essay_questions, summary_questions, academy_id, reading_questions | id [추정] | SQL 없음 | 알 수 없음 | **없음** |
| `questions` | 574 | id, user_id, question_set_id, question_type, question_text, passage_blank_text, choices, correct_answer, explanation, grade, topic, difficulty, tags, weakness_tags, status, review_note, last_used_at, usage_count, created_at, updated_at, academy_id, essay_meta | id [추정] | SQL 없음 | 알 수 없음 | **없음** |
| `academies` | 0 (보이는 행) | 보이는 행이 없어 알 수 없음 | 알 수 없음 | 알 수 없음 | 알 수 없음 | **없음** |
| `exam_questions` | 781 | id, exam_id, user_id, question_data, sort_order, points, created_at | id | exam_id→exams 삭제 연쇄, user_id→auth.users | - | supabase-migration |
| `exam_assignments` | 0 | id, user_id, exam_id, student_id, absent, created_at | id | exam_id→exams 연쇄, student_id→students 연쇄 | 고유(exam_id, student_id) | exam-assignments |
| `exam_sheets` | 1 | id, created_at, user_id, title, style_preset, style_params, grade_level, question_config, questions_data, academy_id | id | user_id 칸 추가 | - | schema.sql, rls-fix |
| `attendance` | 0 | id, user_id, student_id, date, status, note, created_at | id | student_id→students 연쇄 | 고유(user_id, student_id, date) | supabase-migration, schedule-and-related |
| `homework` | 0 | id, user_id, student_id, title, due_date, status, note, created_at | id | student_id→students 연쇄 | - | supabase-migration |
| `tuition_records` | 2 | id, user_id, student_id, month_name, amount, status, paid_at, note, created_at, paid_amount | id | student_id→students 연쇄 | 고유(user_id, student_id, month_name) | supabase-migration, tuition-paid-amount |
| `parent_notifications` | 0 | id, user_id, student_id, title, message, notification_type, created_at | id | student_id→students 연쇄 | - | supabase-migration |
| `reports` | 0 | id, user_id, student_id, exam_id, student_name, student_grade, exam_title, exam_date, score, max_score, strengths, comment, next_steps, type_scores, created_at, status, checked_at, sent_at, sent_via | id | student_id→students 비움, exam_id→exams 비움 | - | supabase-migration, report-status |
| `level_test_results` | 0 | id, user_id, test_id, grade, form, student_id, student_name, mode, answers, overrides, score, recommendation, memo, taken_at, reviewed_at, created_at, updated_at | id | student_id→students 비움 | - | level-test-results, report-status |
| `wrong_answer_records` | 0 | id, user_id, exam_id, student_id, wrong_question_ids, scored_at, notes, created_at, updated_at | id | exam_id→exams 연쇄, student_id→students 연쇄 | 수정 시각 자동 갱신 트리거 | wrong-answers |
| `schedule_events` | 0 | id, user_id, title, event_date, start_time, end_time, event_type, note, created_at | id | user_id만 | - | supabase-migration, schedule-and-related |
| `passages` | 86 | id, user_id, title, level, topic, body, tagged_body, tags, questions, essays, created_at, updated_at, group_id, variant_level, archived, archived_at | id | group_id→passage_groups 연쇄 | 고유(세트·난이도), group_id, archived | supabase-migration, passage-groups, step6 |
| `passage_groups` | 21 | id, user_id, title, level, topic, source_body, status, created_at, updated_at, archived, archived_at | id | user_id | archived | passage-groups, step6 |
| `passage_wordbooks` | 36 | id, user_id, passage_id, words, created_at, updated_at | id | passage_id→passages 연쇄 | 고유(user_id, passage_id) | passage-wordbooks |
| `vocabulary_entries` | 2,998 | id, user_id, expression, expression_key, lemma, entry_type, pos, meaning_ko, meaning_key, accepted_meanings, sense_note, example_sentence, base_difficulty, ko_en_difficulty, ko_en_allowed, status, reject_reason, reject_note, approval_origin, teacher_reviewed_at, archived_at, deleted_at, created_at, updated_at, deferred_at | id | user_id | 고유 1개, 일반 3개 | vocabulary-bank, stage1 |
| `vocabulary_sources` | 3,418 | id, user_id, entry_id, source_type, source_ref, surface_form, source_sentence, context_meaning, suggested_difficulty, rationale, created_by, official_source_name, official_source_version, official_grade, created_at | id | entry_id→vocabulary_entries | 고유 1개, 일반 1개 | vocabulary-bank |
| `official_vocabulary` | 3,000 | id, user_id, list_version, list_no, headword, headword_key, variants, derivatives, tier_code, tier_mark, tier_label, source_raw, created_at | id | user_id | 고유 2개, 일반 1개 | stage3 |
| `academy_settings` | 1 | user_id, academy_name, logo_url, signature_url, updated_at | user_id | user_id→auth.users | - | academy-settings |
| `school_profiles` | 6 | id, user_id, region, school_slug, content, created_at, updated_at | id | user_id | 고유(user_id, region, school_slug) | school-profiles |
| `api_usage_logs` | 0 | id, user_id, route, model, input_tokens, output_tokens, created_at 등 | id | user_id | - | api-usage-logs |

저장소: `brand` 버킷 1개 (로고·서명). 읽기는 공개, 쓰기는 본인 폴더. [사실] `academy-settings-migration.sql`

### 2-3. 학생 중심 관계도

```text
auth.users (로그인 계정)
   │ user_id  (거의 모든 표)
   ▼
students ─┬─ 연쇄 삭제 ─ attendance            (학생+날짜 1건)
          ├─ 연쇄 삭제 ─ homework
          ├─ 연쇄 삭제 ─ tuition_records       (학생+월 1건)
          ├─ 연쇄 삭제 ─ parent_notifications
          ├─ 연쇄 삭제 ─ wrong_answer_records ── exams
          ├─ 연쇄 삭제 ─ exam_assignments ────── exams
          ├─ 알 수 없음 ─ exam_results ───────── exams   (SQL 파일 없음)
          ├─ 비움 ────── reports (이름 사본 있음) ── exams
          └─ 비움 ────── level_test_results (이름 필수, 학생 연결 선택)

exams ── exam_questions (question_data: 출제 당시 문항 사본)
exams ·· question_set_id ·· question_sets ── questions
passage_groups ── passages ── passage_wordbooks
vocabulary_entries ── vocabulary_sources
official_vocabulary, school_profiles, academy_settings, api_usage_logs : 학생과 연결 없음

schedule_events : 학생·반 어디에도 연결 없음  ← 반 관리가 메워야 할 곳
academies ·· academy_id ·· students, exams, question_sets, questions, exam_sheets (코드 미사용)
```

### 2-4. 행 수준 보안(RLS)

| 구분 | 표 | 기준 | 근거 |
|---|---|---|---|
| SQL 파일에 정책 있음 | exam_questions, exam_assignments, exam_sheets, attendance, homework, tuition_records, parent_notifications, reports, level_test_results, wrong_answer_records, schedule_events, passages, passage_groups, passage_wordbooks, vocabulary_entries, vocabulary_sources, official_vocabulary, academy_settings, school_profiles, api_usage_logs | 전부 `auth.uid() = user_id`, 또는 부모 소유권 기준. 역할 기준 없음 | [사실] SQL 파일 |
| SQL 파일에 정책 없음 | students, exams, exam_results, question_sets, questions, academies | 실제 정책을 볼 수 없음 | [사실] SQL 없음 |
| 비로그인 시험 조회 | 행이 있는 표 모두(students, exams, questions, exam_sheets 포함) | 비로그인으로 0건 → 닫혀 있음 | [사실] 건수 조회 |
| 비로그인 시험 불가 | exam_results 등 빈 표 | 행이 없어 비로그인 0건이 의미 없음 | [사실] |
| 다른 계정 공격 시험 | 전체 | 계정이 하나라 못 함 | [사실] `docs/vocabulary-backlog.md`에도 미완으로 남아 있음 |

- [사실] `exam_sheets`는 예전 "Allow all" 정책 파일이 있지만, 행 1건이 비로그인에 보이지 않아 닫는 파일이 적용된 것으로 판단된다.
- [사실] `get_student_report` 함수는 비로그인으로도 호출된다 (없는 학생으로 호출해 `found=false` 확인). 학부모 조회의 설계 그대로지만 정의를 볼 수 없다.
- [추정] 이 함수는 RLS를 넘어 읽도록 만들어졌을 것이다. 비로그인으로 성적을 돌려주려면 그래야 한다.

### 2-5. 마이그레이션

SQL 실행 기록표가 없어 순서는 **git에 처음 들어온 날** 기준이다. 실행일과 다를 수 있다. "적용"은 그 파일이 만드는 표·칸이 실제로 있는지로 판단했다.

| 순서 | 파일 | git 날짜 | 적용 |
|---:|---|---|---|
| 1 | `supabase/schema.sql` | 07-12 | 대체됨 (정책은 rls-fix가 닫음) |
| 2 | `supabase-migration.sql` | 09-13 | 적용 |
| 3 | `wrong-answers-migration.sql` | 09-14 | 적용 |
| 4 | `academy-settings-migration.sql` | 09-21 | 적용 |
| 5 | `api-usage-logs-migration.sql` | 09-21 | 적용 |
| 6 | `exam-sheets-rls-fix-migration.sql` | 09-21 | 적용 [추정] |
| 7 | `passage-groups-migration.sql` | 09-21 | 적용 |
| 8 | `schedule-and-related-tables-migration.sql` | 09-21 | 적용 |
| 9 | `tuition-paid-amount-migration.sql` | 09-21 | 적용 |
| 10 | `step6-archive-migration.sql` | 09-22 | 적용 |
| 11 | `vocabulary-bank-migration.sql` | 09-27 | 적용 |
| 12 | `stage1-vocabulary-exam-type-migration.sql` | 09-28 | 적용 |
| 13 | `stage3-official-vocabulary-migration.sql` | 09-28 | 적용 |
| 14 | `passage-wordbooks-migration.sql` | 10-19 | 적용 |
| 15 | `level-test-results-migration.sql` | 10-25 | 적용 |
| 16 | `report-status-level-test-review-migration.sql` | 10-28 | 적용 |
| 17 | `exam-assignments-migration.sql` | 10-28 | 적용 |
| 18 | `school-profiles-migration.sql` | 10-29 | 적용 (**마지막**) |

### 2-6. 실제 DB와 파일이 어긋난 곳

| 어긋난 곳 | 내용 | 표시 |
|---|---|---|
| `students`, `exams`, `exam_results`, `question_sets`, `questions` | 만드는 SQL 파일이 없음 | [사실] |
| `reports.teacher`, `vocab_analysis`, `grammar_analysis`, `reading_analysis` | 코드는 저장하는데 DB에 칸이 없음 (오류 42703) | [사실] `app/api/reports/route.ts:58-61` |
| `get_student_report` | 함수가 DB에 있는데 정의 파일이 없음 | [사실] |
| `academies`, `academy_id` | DB에 있는데 코드·SQL에 없음. students 1건, question_sets 22건, questions 154건, exam_sheets 1건이 값을 가짐 | [사실] |
| `level_test_results.recommendation`, `score` 등 | SQL과 일치 | [사실] |

### 2-7. 향미 선생님이 SQL Editor에서 돌리면 빈칸이 채워지는 읽기 전용 한 줄

값은 없고 표 구조만 나온다. 결과를 붙여 주시면 기본키, 외래키, 인덱스, 정책을 실제 값으로 고칠 수 있다.

```sql
select 'policy' k, tablename t, policyname n, cmd d from pg_policies where schemaname='public' union all select 'rls', relname, relrowsecurity::text, '' from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' union all select 'index', tablename, indexname, indexdef from pg_indexes where schemaname='public' union all select 'fk', conrelid::regclass::text, conname, pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace and contype='f' union all select 'function', proname, '', pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and proname='get_student_report' order by 1,2;
```

---

## 3. 학생 연결 지도

| 영역 | 표 | 학생을 가리키는 방법 | 학생 삭제 시 | 표시 |
|---|---|---|---|---|
| 출석 | attendance | student_id | 기록 함께 삭제 | [사실] SQL |
| 숙제 | homework | student_id | 기록 함께 삭제 | [사실] SQL |
| 원비 | tuition_records | student_id + 월 글자(`month_name`) | 기록 함께 삭제 | [사실] SQL |
| 알림 | parent_notifications | student_id | 기록 함께 삭제 | [사실] SQL |
| 시험 응시 대상 | exam_assignments | student_id | 함께 삭제 | [사실] SQL |
| 오답 | wrong_answer_records | student_id | 함께 삭제 | [사실] SQL |
| 성적 | exam_results | student_id (필수), 시험 제목 사본 | 알 수 없음 | [사실] `app/api/exam-results/route.ts`, FK는 SQL 없음 |
| 보고서 | reports | student_id + **이름·학년 사본** | 연결만 비고 사본 남음 | [사실] SQL |
| 레벨테스트 | level_test_results | **이름 필수**, student_id 선택 | 연결만 비고 이름 남음 | [사실] `app/api/level-tests/results/route.ts:54` |
| 일정 | schedule_events | **학생 연결 없음** | 영향 없음 | [사실] `class_id`, `student_id` 칸 없음 확인 |
| 학교 | students.school_name ↔ config/schools.ts | **학교 이름 글자 비교** | - | [사실] `config/schools.ts:73` |
| 학년 | students.grade | **자유 글자**, 원비 기본 금액을 글자로 판단 | - | [사실] `app/tuition/page.tsx` |

### 이름·글자로만 연결한 곳 (반 관리 때 가장 위험)

1. **레벨테스트 결과**: 아직 등록 안 한 응시생은 이름만 남는다. 나중에 등록해도 자동 연결되지 않는다. 동명이인을 구별할 수 없다. [사실]
2. **보고서 이름·학년 사본**: 그때의 기록으로는 맞지만, 학생 정보를 고쳐도 옛 보고서는 그대로다. 반 이름도 사본으로 남길지 정해야 한다. [사실]
3. **보고서 인쇄 주소**: 학생 이름과 점수를 주소 값으로 넘겨 그린다. 주소가 브라우저 기록에 남는다. [사실] `app/report/print/page.tsx`
4. **학교·학년 글자**: 반의 "대상 학년"을 `students.grade`와 맞추려면 표기가 통일돼야 한다. "중2"와 "중학교 2학년"은 다른 값이 된다. [사실]
5. **성적의 시험 제목 사본**: `exam_id` 없이 직접 입력한 성적은 시험과 연결되지 않아 채점 대기에 잡히지 않는다. [사실] `docs/dashboard-new-tables-design.md`

---

## 4. 반 관리가 닿는 곳

이미 있는 설계안 `docs/dashboard-new-tables-design.md`의 ①②③을 바탕으로 검토했다. 아래 표의 판단은 모두 **[추정]** 이고, 근거가 되는 현재 구조만 [사실]이다.

| 요구 | 영향받는 표 | 영향받는 화면·코드 | 기존 구조 변경 | 위험 |
|---|---|---|---|---|
| 반 만들기 (이름·요일·시간·대상 학년·담당 선생님, 학생 체크) | 새 표 `classes`, `class_students` | 새 메뉴 `config/navigation.ts`, 새 화면, 새 API | 없음 (새 표는 사전 승인됨) | 설계안에 담당 선생님 칸이 없음. 계정이 하나라 글자 칸이 현실적 |
| 학생관리 목록에서 여러 명 체크 후 반 만들기·넣기, 상세에서 반 변경 | `class_students` | `app/students/page.tsx`, `app/api/students` | 없음 | 학생 상세 화면이 따로 없고 펼침 카드뿐. 화면이 424줄이라 복잡해짐 |
| 학생 상태 재원·휴원·퇴원 | `students` 칸 추가 | `/api/students`를 쓰는 화면 9곳, 공용 부품 2개, 대시보드 | **있음, 승인 필요** | 기존 표 변경. `students` SQL이 없어 먼저 실제 구조 확인 필요 |
| 퇴원 시 모든 반에서 빠짐, 원비 미납 제외 | `students`, `class_students`, `tuition_records` | `lib/dashboard.ts`, `lib/dashboardData.ts`, `app/tuition/page.tsx` | 집계 코드 변경 | 두 번 나눠 쓰다 실패하면 상태가 어긋남. 한 번에 처리하는 DB 함수 검토 필요 |
| 반 상태 운영 중·종료 | `classes.active` | 반 화면 | 없음 | 지우는 버튼을 두면 `class_students`가 연쇄 삭제됨. 삭제 버튼을 두지 않아야 함 |
| 한 학생 여러 반 | `class_students`, `attendance` | 출석, 대시보드 | **출석 고유 조건 변경 필요할 수 있음** | 7번 질문의 답에 따라 갈림 |
| 2단계 반 단위 출석부 | `attendance`, `schedule_events`, 새 칸 `class_id` | `app/attendance/page.tsx`, `app/schedule/page.tsx` | **있음, 승인 필요** | 출석 고유 조건이 학생+날짜 → 하루 두 반이면 덮어씀 [사실 기반]. UTC 날짜 문제도 먼저 해결 필요 |
| 2단계 보강·휴강 | `schedule_events` | 수업 일정 | 있음 | 일정은 날짜별 낱개이고 반복 개념이 없음 [사실]. 요일 고정 반의 일정을 어떻게 만들지 정해야 함 |
| 3단계 반 단위 숙제 | `homework`, 새 칸 또는 묶음 키 | `app/homework/page.tsx` | 있음 | 숙제는 학생별 행 [사실]. 반에 내면 학생 수만큼 행 생성, 묶어 고치는 기능 필요 |
| 3단계 시험 배정 | `exam_assignments` | `app/grading/page.tsx` | 없음 | 이미 학생 여러 명을 한 번에 받는 API가 있음 [사실]. 배정 뒤 반에 들어온 학생은 자동 포함 안 됨 |
| 3단계 채점 대기 연결 | `exam_assignments`, `exam_results` | 대시보드 | 없음 | 숫자는 이미 구현됨 [사실]. 퇴원생 제외만 추가 |

### 설계안에서 고칠 점

- `class_students`의 고유 조건 `(class_id, student_id, joined_on)`은 **같은 학생이 현재 소속 중인 상태로 다른 날짜에 또 들어가는 것을 막지 못한다.** `left_on`이 빈 행을 하나로 제한하는 조건이 필요하다.
- 같은 날 나갔다 다시 들어오면 고유 조건에 걸린다.
- RLS는 `user_id`만 본다. `class_id`, `student_id`가 본인 것인지는 API에서 확인해야 한다. `app/api/exam-assignments/route.ts`도 시험은 확인하지만 학생은 확인하지 않는다 [사실].
- `analytics`의 "반 평균"은 실제로 **전체 평균**이다 [사실] `app/api/analytics/route.ts:59`. 반이 생기면 이름이 헷갈리므로 바꾸거나 반별 평균을 더해야 한다.

### 대시보드에 생기는 항목

| 항목 | 지금 | 반 관리 뒤 | 필요한 단계 |
|---|---|---|---|
| 출석 미체크 | 못 셈. 일정이 학생과 연결 없음 [사실] | 오늘 수업 → 반 → 재원 학생 → 오늘 출석 없는 학생 | 2단계 |
| 채점 대기 | **이미 있음**, 응시 대상을 지정한 시험만 셈 [사실] `lib/dashboardData.ts:112` | 반 단위 배정으로 입력이 쉬워지고 퇴원생 제외 | 3단계 |
| 퇴원 제외 원비 미납 | 전체 학생 수 − 이번 달 납부 학생 수 [사실] `lib/dashboard.ts:30`. 일부 납부도 미납으로 셈 [사실] | 분모를 재원 학생으로, 납부 목록도 재원 학생으로 제한 | 1단계 |
| 반별 인원, 반 없는 학생 | 없음 | 새로 셀 수 있음 | 1단계 |
| 휴원·퇴원 학생 수 | 없음 | 새로 셀 수 있음 | 1단계 |
| 숙제 미완료 | 학생 수로 셈 [사실] | 퇴원생 숙제 제외 필요, 반별 보기 가능 | 1·3단계 |

### 기존 자료 옮기기와 되돌리기

[사실] 옮길 자료가 거의 없다: 학생 1명, 원비 2건, 나머지 학생 관련 표 0건.

1. 백업: `backups/`에 `students`, `tuition_records`, `schedule_events`, `attendance`, `homework`, `exam_results`, `reports`를 JSON으로 저장. `backups/`는 git 제외 [사실].
2. 새 표 추가: `classes`, `class_students`. 기존 자료에 영향 없음.
3. 기존 표 변경(승인 후): `students`에 상태 칸 추가, 기본값은 재원. 학생 1명은 자동으로 재원이 됨.
4. 선생님이 화면에서 반을 만들고 학생을 넣음. 스크립트로 옮길 자료 없음.
5. 코드 배포는 칸이 생긴 뒤. 지금 코드처럼 칸이 없을 때 숨기는 처리를 함께 둠 (`lib/dashboardData.ts`의 방식).

되돌리기: 새 화면 코드를 되돌린 뒤 `class_students`, `classes` 표를 지우고 `students`의 상태 칸을 지운다. 칸을 지우기 전 백업 필수. 2단계 이후 `attendance` 고유 조건을 바꾸면 되돌리기가 어려워지므로(같은 날 두 행이 생김) 별도 승인 항목으로 둔다.

---

## 5. 알려진 미해결 이슈 점검

| 이슈 | 현재 상태 | 근거 |
|---|---|---|
| 숙제관리 마감 판단 | **해결됨.** 한국 날짜 사용 | [사실] `app/homework/page.tsx:127`, `lib/dashboard.ts:10` |
| 다른 화면의 UTC 날짜 | 조사 때 **남아 있었음.** 정정: 아래 표 전부 수정, 배포 전 | [사실] 부록 D |
| test-question-provenance | **실패 1개.** A~J 통과, CLI 항목 실패. 시험용 자료에 단어장이 없어 검사기에 걸림. 2026-10-19 단어장 필수 규칙 이후의 자료 문제로 보임 | [사실] 실행 결과, [추정] 원인 시점 |
| 문항 검색 화면 필드 오류 | **해결됨.** API가 `type/question`과 `question_type/question_text`를 모두 준다 | [사실] `app/api/questions/search/route.ts:73-84`, 커밋 `ad97f90` |
| ESLint | **미설정 그대로.** 설정 파일 없고 패키지도 없음. `npm run lint`는 실행하지 않음 | [사실] `package.json:9` |
| 외부지문 qid 없는 문항 | **그대로.** 지문 14개, 문항 350개 (전체 86개 중, 전체 문항 2,150개). 시험에 담긴 외부지문 문항 75개는 원본 qid 칸이 비어 있음 | [사실] DB 집계 |
| 어법 정답 노출 수정안 `grammar-leak-fix-proposal.csv` | **미적용.** 4개 모두 지금 문장이 수정안과 다르고 승인 표시 0개. 노출 의심 4개 그대로 | [사실] DB 대조 |
| 승인된 어법 수정안 (`…approved-2026-09-29.csv`) | **적용됨.** 169개 모두 DB와 일치 | [사실] DB 대조 |
| 이미 만든 시험의 어법 문항 | **13개 노출 의심 그대로.** 문항 사본은 바꾸지 않는 방침 | [사실] DB 집계, `docs/grammar-leak-audit.md` |
| git 미반영 파일 | 작업 전 없음. 이 문서만 새 파일 | [사실] `git status` |
| git stash | 없음 | [사실] `git stash list` |
| 확인 필요 단어 | **38개 그대로.** 사용 중 2,960개, 전체 2,998개 | [사실] DB 집계 |

### UTC 날짜를 쓰는 곳 전부

한국은 UTC보다 9시간 빠르다. `toISOString()`으로 날짜를 만들면 **오전 9시 전에는 전날**이 된다. [사실] 코드 위치, 영향은 코드에서 판단. 아래 표는 조사 당시 줄 번호다. 정정: 전부 수정됨 (부록 D).

| 위치 | 영향 | 심각도 |
|---|---|---|
| `app/attendance/page.tsx:35` | 출석 화면 기본 날짜가 전날 → 전날로 저장될 수 있음 | **높음** |
| `app/attendance/page.tsx:144` | 월 말일을 잘못 계산해 **월간 요약에서 말일이 빠짐**. 오전 9시 전후와 상관없이 한국 시간 브라우저면 항상 | **높음** |
| `app/grading/page.tsx:58`, `:68` | 성적·시험 카드 기본 날짜 | 중간 |
| `app/api/exam-results/route.ts:58` | 날짜 없는 성적의 기본 날짜 (서버) | 중간 |
| `app/report/page.tsx:296`, `:327` | 보고서 기본 시험일 | 중간 |
| `app/tuition/page.tsx:125` | 납부일 | 중간 |
| `app/materials/level-tests/[grade]/[form]/grade/page.tsx:22` | 응시일 기본값 | 낮음 |
| `app/schedule/page.tsx:39`, `:68` | 새 일정 기본 날짜 | 낮음 |
| `app/api/schedule/upcoming/route.ts:5` | 일정 알림 종의 범위가 오전 9시 전에 하루 앞당겨짐 (서버) | 중간 |
| `lib/examSheets.ts:20` | 문제지 제목 날짜 | 낮음 |

문제 없음: `lib/dashboard.ts`, `lib/dashboardData.ts`, `app/homework/page.tsx`는 한국 날짜. 저장 시각(`created_at`, `updated_at` 등)은 시각 자체라 문제 없음. `app/tuition/page.tsx:41`은 브라우저 시간 사용. [사실]

### 보안 완화 항목 (`docs/dev-security-relaxations.md`)

| # | 항목 | 아직 풀려 있나 | 근거 |
|---|---|---|---|
| 1 | 폴더 밖 읽기 (바탕화면) | **풀려 있음** | [사실] `.claude/settings.local.json` |
| 2 | Claude Code 자동 모드 | 파일로 확인 불가. 이번 세션에서 자동 판단 차단이 작동해 자동 모드로 보임 | [추정] |
| 3 | 향미 선생님 계정으로 DB 직접 접속 | **풀려 있음.** 이번 조사에도 사용 | [사실] `.env.local` 칸 이름 |
| 4 | GitHub push → Vercel 배포 | **풀려 있음** | [사실] 이번 세션 push 성공 |
| 5 | SessionStart 자동 실행 | 설정 남아 있음. 경로가 달라 Windows에서 동작 안 함 | [사실] `.claude/settings.json` |
| 6 | git·npm·npx·node 허락 생략 | **풀려 있음** | [사실] `.claude/settings.local.json` |
| 표2 | service role 키가 `.env.local`에 있음 | **남아 있음.** 코드 사용 0곳 | [사실] 검색 |
| 표2 | `ANTHROPIC_API_KEY` | 사용 중 | [사실] |
| 표2 | `exam_sheets` 정책 | 닫힌 것으로 보임 | [사실] 비로그인 0건 |
| 표2 | `POST /api/exam-questions`의 시험 소유 확인 | 조사 때 없음. 정정: `cca9eeb`에서 추가, 배포 전 | [사실] `lib/examOwnership.ts` |
| 표2 | Vercel 배포 보호 | **켜져 있음.** 앱과 학부모 주소, API 모두 302 | [사실] 접속 시험 |
| 표2 | `backups/` | 18개 파일. git 제외 확인 | [사실] |
| 추가 | `.claude/settings.local.json`에 문서에 없는 허용 | `Bash(node *)`, `Bash(git commit *)`, `Bash(gh api *)` 등이 문서에 없음 | [사실] |
| 추가 | 비밀값 git 기록 | `.env`, `.env.local` 기록 0건 | [사실] `git log --all` |

### 이번에 새로 찾은 이슈

| 이슈 | 내용 | 표시 |
|---|---|---|
| 보고서 저장 실패 | 코드가 없는 칸 4개에 저장함. 저장 때마다 오류가 나고 알림 뒤 인쇄만 될 것으로 보임. 보고서 0건 | [사실] 칸 없음, 0건 / [추정] 실패 (쓰기 시험은 하지 않음) |
| AI API 비로그인 허용 (정정) | 처음에는 `/api/generate`만 문제로 적었으나 잘못이었다. `generate-ai-passage`, `generate-passage`, `generate-report`도 사용량 기록용으로만 계정을 읽고 비로그인을 막지 않았다. `middleware.ts`가 `/api`를 제외하므로 AI API 4개 모두 해당. 조사 때는 Vercel 배포 보호가 막고 있었고, 풀면 누구나 AI 비용을 쓰게 할 수 있었다. 4개 모두 수정, 배포 전 | [사실] 코드, [추정] 영향 |
| 학부모 PIN | 4자리, 시도 횟수 제한 코드를 찾지 못함 | [사실] 코드 범위 내 |
| 학부모 링크 | Vercel 배포 보호 때문에 지금은 외부 학부모가 못 열 것으로 보임 | [사실] 302, [추정] 영향 |

---

## 6. 계정·권한·개인정보

### 계정 구조

- [사실] 거의 모든 표와 API가 `user_id = 로그인 계정`으로 자료를 나눈다. 역할 칸이 없다.
- [사실] `docs/vocabulary-backlog.md`도 "단일 운영자 내부 프로그램"이라 적고 있다.
- 결과: 계정을 하나 더 만들면 **빈 프로그램이 하나 더 생긴다.** 학생과 시험을 함께 볼 수 없다.

선생님을 추가하려면 [추정]:

1. 교습소 단위 칸과 소속 표 (교습소, 구성원, 역할).
2. 모든 표의 RLS를 "본인"에서 "같은 교습소 구성원"으로 변경.
3. 모든 API의 `.eq('user_id', user.id)` 조건 변경 (API 50개 범위).
4. 담당 선생님을 글자에서 계정 연결로 변경.
5. 단어은행·공식 어휘처럼 계정별로 복사된 자료를 공용으로 전환할지 결정.

### 저장 중인 개인정보

칸 이름만 적는다.

| 위치 | 칸 |
|---|---|
| `students` | name, grade, school_name, student_phone, parent_phone, enrolled_at, notes, pin |
| `attendance`, `homework` | 학생별 status, note |
| `tuition_records` | amount, paid_amount, status, paid_at, note |
| `exam_results`, `wrong_answer_records` | score, wrong_question_ids, notes |
| `reports` | student_name, student_grade, score, strengths, comment, next_steps, type_scores |
| `level_test_results` | student_name, answers, score, recommendation, memo |
| `parent_notifications` | title, message |
| `backups/` (이 PC, git 제외) | 시험·단어·학교 정보 백업 파일. 학생 표 포함 여부는 파일 값을 열지 않아 확인 안 함 |
| 브라우저 주소 | 보고서 인쇄 주소의 이름·점수 |
| `.env.local` | 로그인 이메일·비밀번호, 키 (이 문서에 값 없음) |

저장 위치는 Supabase, 이 PC의 `backups/`이다. [사실]

### 외부로 나가는 자료

| 경로 | 나가는 곳 | 학생 정보 | 표시 |
|---|---|---|---|
| `app/api/generate-report/route.ts` | Anthropic | **이름, 학년, 점수, 영역 점수, 선생님 메모** | [사실] `buildUserMessage` |
| `/api/generate`, `/api/generate-ai-passage`, `/api/generate-passage` | Anthropic | 학생 칸 없음. 입력한 지문·주제만 | [사실] 코드 검색 |
| Vercel, Supabase | 앱·DB 운영 | 전체 | [사실] |
| 문자·카톡 | 코드에서 발송 찾지 못함 | - | [추정] |

보고서 AI 초안은 학생 이름 없이도 만들 수 있다. "학생"으로 바꿔 보내고 돌아온 글에 이름을 넣는 방식을 검토할 만하다 [추정].

### 다른 교습소가 쓰게 될 때 걸리는 곳

| 걸리는 곳 | 내용 | 표시 |
|---|---|---|
| 선생님 이름 고정 | 코드에 담당 선생님 실명이 인쇄 화면 등 7곳, `config/copyright.ts`에 저작권자 | [사실] |
| 교습소 이름 고정 | 코드 19개 파일에 "보스턴S영어" 또는 선생님 이름. `academy_settings`와 따로 놂 | [사실] |
| 학교 목록 | `config/schools.ts`에 대구 남구 고정 | [사실] |
| 레벨테스트 내용·기준 | 코드 저장소 JSON과 설정 파일. 교습소별로 바꿀 수 없음 | [사실] `lib/levelTest.ts`, `config/levelTestBands.ts` |
| 계정별 복사 자료 | 공식 어휘 3,000개, 단어은행, 지문이 계정마다 따로 | [사실] `user_id` 칸 |
| `academy_id` 흔적 | 값이 일부만 차 있고 코드가 안 씀. 재사용 전 정리 필요 | [사실] |
| 로그인 전용 스크립트 | `.env.local`의 한 계정으로만 자료 입력 | [사실] |
| 소유 확인 없는 API | 11개, 부록 B. 시험 문항 추가는 `cca9eeb`에서 수정됨 (정정) | [사실] |
| 공개 저장소 | `brand` 버킷은 공개 읽기 | [사실] |
| RLS 공격 시험 | 다른 계정으로 시험한 적 없음 | [사실] 백로그 미완 |
| 약관·개인정보 처리 | 관련 화면·문서를 찾지 못함 | [추정] |

---

## 7. 향미 선생님께 물을 질문

**수업 방식**

1. 소그룹 수업과 개인 수업의 비율은 어느 정도인가요? 개인 수업도 "1명짜리 반"으로 관리해도 될까요?
2. 지금 반은 몇 개이고, 앞으로 몇 개까지 생각하시나요?
3. 반은 요일·시간이 고정인가요? 학기나 방학에 시간이 바뀌나요? (지난번 답: 고정된 반 위주)
4. 같은 반이 요일마다 시간이 다를 수 있나요? (예: 월 5시, 수 6시)
5. 반 이름은 어떻게 짓나요? (예: 중2 월수금 6시반) 자동 이름이 좋을까요, 직접 쓰는 게 좋을까요?
6. 담당 선생님은 지금 향미 선생님 한 분인가요? 앞으로 다른 선생님이 로그인해서 쓰게 되나요?

**소속**

7. 한 학생이 여러 반에 들어갈 수 있나요? 하루에 두 반을 듣는 경우도 있나요? (이 답에 따라 출석 표 구조가 바뀝니다)
8. 반을 옮기면 예전 반의 출석·성적은 예전 반 기록으로 남겨 둘까요?
9. 대상 학년을 벗어난 학생도 반에 넣을 수 있게 할까요, 경고만 할까요?
10. 새 학년이 되면 학생 학년과 반을 한꺼번에 올리는 기능이 필요한가요?

**학생 상태**

11. 휴원 학생은 반에 남겨 둘까요, 빼둘까요? 복원하면 원래 반으로 돌아가나요?
12. 휴원 학생의 원비는 어떻게 하나요? 미납 집계에서 빼나요?
13. 퇴원한 달의 미납 원비는 계속 보여야 하나요, 집계에서만 빼나요?
14. 퇴원 날짜와 이유를 기록할까요? 퇴원생의 학부모 조회(PIN)는 막을까요?
15. 학생 "삭제" 버튼은 없애거나 잘못 등록한 경우에만 쓰게 해도 될까요?

**출석·일정**

16. 보강은 어떻게 처리하시나요? 다른 반에 끼워 넣나요, 따로 시간을 잡나요? 결석과 어떻게 연결할까요?
17. 휴강하면 반 전체에 알림이 필요한가요? 수업 일수 계산에 영향이 있나요?
18. 수업 일정은 요일로 자동 생성할까요, 지금처럼 날짜별로 넣을까요?
19. 출석 미체크는 수업 시작 후 언제부터 알려 주면 좋을까요?

**숙제·시험·원비**

20. 숙제는 반 전체에 내고 학생별 완료를 체크하는 방식인가요? 반에 늦게 들어온 학생에게도 나가야 하나요?
21. 시험은 반 단위로 배정하나요? 시험 뒤에 들어온 학생은 빼면 될까요?
22. 원비는 반마다 다른가요, 학년별 금액인가요, 학생별인가요? 일부 납부는 미납으로 세어도 되나요?

**먼저 정할 것**

23. 보고서 저장 칸이 빠진 문제를 반 관리 전에 먼저 고칠까요?
24. 출석 날짜 문제를 2단계 전에 먼저 고칠까요?
25. 2-7의 읽기 전용 SQL을 실행해 결과를 주실 수 있나요? 기존 표를 바꾸기 전에 필요합니다.
26. 레벨테스트 응시생을 나중에 학생으로 등록할 때 결과를 자동으로 연결해 드릴까요?

---

## 확인하지 못한 부분과 이유

| 부분 | 이유 |
|---|---|
| 실제 기본키, 외래키, 인덱스, RLS 정책, 트리거 | 이 계정으로 표 구조 안내가 열리지 않음(401). 모든 보안을 무시하는 service role 키는 쓰지 않음. 2-7의 SQL로 확인 가능 |
| `exam_results`의 삭제 규칙, 전체 칸 | 만드는 SQL이 없고 행이 0건 |
| 빈 표의 전체 칸 | 행이 없어 후보 칸만 확인. 그 밖의 칸이 더 있을 수 있음 |
| `academies`의 칸과 내용 | 이 계정에 보이는 행이 없음 |
| `get_student_report` 내용 | 정의를 읽을 수 없음. 없는 학생으로 호출만 해 봄 |
| 다른 계정의 행 | 계정 하나로만 조회. 건수는 이 계정 기준 |
| 다른 계정이 내 자료를 볼 수 있는지 | 쓰기와 계정 추가가 필요해 하지 않음 |
| 보고서 저장 실제 실패 | 쓰기 시험을 하지 않음 |
| 실제 배포 화면 | Vercel 배포 보호로 접속 불가 (302). 화면 설명은 코드 기준 |
| 인쇄 결과·화면 모양 | 브라우저로 열어 보지 않음 |
| 마이그레이션 실행 날짜 | 실행 기록표가 없음. git 날짜와 표 존재로만 판단 |
| Vercel 환경변수, Supabase 설정, 자동 모드 현재 값 | 이 조사 도구로 볼 수 없음 |
| `backups/` 파일 내용 | 개인정보가 있을 수 있어 열지 않고 파일 수만 셈 |
| `npm run lint` | 설정 질문으로 멈추거나 파일을 만들 수 있어 실행하지 않음 |
| 화면별 표·API 표 | 코드 글자 검색 결과라, 주소를 조합해 만드는 호출은 빠졌을 수 있음 |

---

## 부록 (2026-11-01 추가)

개인정보 값은 없다. 표 이름, 칸 이름, API 주소만 적었다. 아래 수정은 모두 로컬 커밋이고 **배포 전**이다.

### 부록 A. 정정: AI API의 로그인 확인

처음 검토서는 `/api/generate`만 로그인 검사가 없다고 적어, 다른 AI API는 로그인을 요구하는 것처럼 읽혔다. **사실과 달랐다.** 조사 스크립트가 함수 안에 로그인 관련 코드가 있는지만 보았기 때문이다.

| API | 조사 당시 | 지금 |
|---|---|---|
| `/api/generate` | 로그인 코드 없음, 비로그인 허용 | 비로그인 401 (`cca9eeb`) |
| `/api/generate-ai-passage` | 사용량 기록용으로 계정만 읽음, 비로그인 허용 | 비로그인 401 (후속 작업) |
| `/api/generate-passage` | 같음. 호출하는 곳 없음 | 비로그인 401 (후속 작업). 파일은 유지 |
| `/api/generate-report` | 같음. 학생 이름·점수·메모가 AI로 나감 | 비로그인 401 (후속 작업) |

조사 때 외부 접근은 Vercel 배포 보호가 막고 있었다. [사실] 접속 시험 302

### 부록 B. 소유 확인이 빠진 API 11개 (고치지 않음)

RLS는 행의 `user_id`만 본다. 아래 API는 받은 ID가 본인 것인지 코드에서 확인하지 않는다. [사실] 코드 조사. 다른 계정이 없어 실제 공격 시험은 하지 않았다.

| # | API | 확인하지 않는 값 |
|---:|---|---|
| 1 | `POST /api/attendance` | `student_id` |
| 2 | `PUT /api/exam-assignments` | `student_ids` (시험은 확인함) |
| 3 | `POST /api/exam-results` | `student_id`, `exam_id` |
| 4 | `POST /api/exams` | `question_set_id` |
| 5 | `POST /api/homework` | `student_id` |
| 6 | `POST /api/level-tests/results`, `PATCH /api/level-tests/results/[id]` | `student_id` |
| 7 | `POST /api/notifications` | `student_ids` |
| 8 | `POST /api/reports` | `student_id`, `exam_id` |
| 9 | `POST /api/tuition` | `student_id` |
| 10 | `POST /api/wrong-answers` | `exam_id`, `student_id` |
| 11 | `POST /api/vocabulary/word-test` | `source_vocabulary_entry_id` |

### 부록 C. 0단계 결과 (커밋 `cca9eeb`)

| 항목 | 결과 |
|---|---|
| 출석 화면 | 기본 날짜를 한국 날짜로, 월 말일을 `monthRange`로 계산. 월간 요약에 말일 포함 |
| `/api/generate` | 비로그인 401, AI 호출 전에 검사 |
| `POST /api/exam-questions` | 내 시험이 아니면 403, 저장 전에 검사 (`lib/examOwnership.ts`) |
| 테스트 | `scripts/test-class-stage0.ts` 추가, 타입 검사·빌드 통과 |
| 로컬 서버 확인 | 비로그인 401, 없는 시험 403, 시험 문항 수 781개 그대로 |

### 부록 D. 후속 작업 결과 (이 문서를 올린 커밋)

| 파일 | 고친 내용 |
|---|---|
| `app/grading/page.tsx` | 성적·시험 카드 기본 날짜 |
| `app/api/exam-results/route.ts` | 날짜 없는 성적의 기본 날짜 |
| `app/report/page.tsx` | 보고서 기본 시험일 2곳 |
| `app/tuition/page.tsx` | 납부일 |
| `app/api/schedule/upcoming/route.ts` | 일정 알림 범위 |
| `app/schedule/page.tsx` | 새 일정 기본 날짜 2곳 |
| `app/materials/level-tests/[grade]/[form]/grade/page.tsx` | 응시일 기본값 |
| `lib/examSheets.ts` | 문제지 제목 날짜 |

[사실] `app`, `lib`, `components`에서 UTC로 날짜 글자를 만드는 코드는 이제 `lib/dashboard.ts` 안의 계산 2곳뿐이다. 이미 저장된 자료는 고치지 않았다.

### 부록 E. 로그인 확인이 없는 API (고치지 않음)

`middleware.ts`는 `/api`를 검사하지 않으므로 API마다 직접 확인해야 한다. API 함수 전체를 다시 조사했다. [사실]

| API | 로그인 확인 | 판단 |
|---|---|---|
| `POST /api/parent-view` | 없음, 학생 ID와 PIN으로 확인 | **공개 유지.** 학부모 조회용. 다만 PIN이 4자리이고 시도 횟수 제한 코드를 찾지 못함 |
| `POST /logout` | 없음 | **공개 유지.** 로그아웃만 함 (`app/api` 밖) |
| 그 밖의 `app/api` 함수 전부 | 있음, 비로그인 401 | 해당 없음 |

공개로 두면 안 되는데 확인이 없는 API는 후속 작업 뒤 **없다.**
