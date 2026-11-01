# 반 관리 1단계 설계와 적용 순서

작성 2026-11-01. 코드와 SQL 파일만 있고 **DB에는 아직 적용하지 않았다.** 배포도 하지 않았다. 개인정보 값은 적지 않았다.
바탕: `docs/class-management-review.md`.

## 1. 적용 순서

순서를 바꾸지 않는다. 코드는 SQL 적용 전에도 깨지지 않으므로, 배포를 먼저 해도 "준비 중"으로 보일 뿐이다.

| 단계 | 할 일 | 확인 |
|---:|---|---|
| 1 | **백업**: `backups/`에 `students`, `tuition_records`, `schedule_events`, `attendance`, `homework`, `exam_results`, `reports`를 JSON으로 저장 | 파일이 생겼고 건수가 맞음 |
| 2 | **적용 전 확인**: `class-management-migration.sql` 맨 위 주석의 읽기 전용 한 줄을 SQL Editor에서 실행 | `id_type = uuid`, `id_is_unique = true`. 다르면 멈추고 결과를 공유 |
| 3 | **SQL 적용**: 같은 파일의 한 줄짜리 SQL을 SQL Editor에서 실행 | 오류 없음. 실패하면 아무것도 바뀌지 않는다 (한 트랜잭션) |
| 4 | **확인**: 로컬 `/classes`에서 "준비 중"이 사라지고, 학생관리에 상태 필터가 보임 | 기존 학생이 재원으로 보임. 시험용 반을 만들어 넣기·빼기·옮기기·종료, 시험용 학생으로 퇴원 |
| 5 | **배포**: 위 확인 뒤 "배포해줘" | Vercel 주소에서 4번과 같은 화면 |

되돌리기: 백업 → `class-management-rollback.sql`의 한 줄 SQL. 반, 시간표, 소속 기록, 학생 상태·퇴원일·사유가 지워진다. 앱은 다시 "준비 중"으로 돌아가므로 코드를 되돌릴 필요는 없다.

## 2. DB 설계

`students`만 바꾸고(칸 3개 추가) 나머지는 새 표다.

| 표 | 칸 | 규칙 |
|---|---|---|
| `students` | `status`, `withdrawn_on`, `withdraw_note` | `status`는 active·paused·withdrawn, 기본 active |
| `classes` | id, user_id, name, target_grades, teacher_name, status, closed_on, note, created_at | status는 active·closed. 종료 상태와 종료일은 짝이 맞아야 함. 학년 코드는 초3~고3만 |
| `class_schedules` | id, user_id, class_id, weekday, start_time, end_time | weekday 1=월 ~ 7=일. 끝 시간은 시작보다 늦어야 함 |
| `class_students` | id, user_id, class_id, student_id, joined_on, left_on | `left_on`이 비면 현재 소속. `left_on >= joined_on` |

- **부분 고유 조건** `class_students_one_open`: 같은 반에서 `left_on`이 빈 행은 학생당 하나. 나갔다가 같은 날 다시 들어오는 것은 된다.
- **외래키**: 전부 삭제 제한(RESTRICT). 계정을 지우려면 이 표들을 먼저 정리해야 한다.
- **삭제 정책 없음**: `classes`, `class_students`는 RLS에 삭제 정책이 없다. 반은 종료만, 소속은 기록으로 남긴다. `class_schedules`만 시간 수정을 위해 삭제가 된다.
- **RLS**: `user_id = auth.uid()`에 더해 `class_id`, `student_id`가 내 것인지 EXISTS로 확인한다. 비로그인은 권한 없음.
- **퇴원 함수** `withdraw_student(학생, 퇴원일, 사유)`: security invoker. 학생 상태 변경과 열린 소속 닫기를 한 번에 하고, 하나라도 실패하면 둘 다 되돌린다. 닫은 소속 수를 돌려준다.

### 스스로 정한 것 (바꾸려면 말씀해 주세요)

| 정한 내용 | 이유 |
|---|---|
| 퇴원일이 입반일보다 빠르면 그 소속의 `left_on`은 입반일로 채움 | `left_on >= joined_on` 검사에 걸려 퇴원 자체가 막히지 않도록 |
| 퇴원일은 오늘 이후로 정할 수 없음 | 상태가 곧바로 퇴원이 되므로 미래 날짜는 실제와 어긋남 |
| 반을 종료하면 열린 소속의 `left_on`을 종료일로 채움. 종료는 되돌릴 수 없음 | 끝난 반에 "현재 소속"이 남지 않도록 |
| 휴원 학생은 반 소속을 유지, 대시보드 숙제·원비에서는 제외 | "재원 학생 기준" 요청. 반별 인원에는 "휴원 n"으로 따로 표시 |
| 퇴원 학생은 반에 넣을 수 없음 | 퇴원은 모든 반에서 빠지는 처리이므로 |
| 퇴원 뒤 재원으로 돌아와도 예전 반에 자동으로 넣지 않음. 마지막 퇴원일·사유는 남김 | 사용자가 쓴 내용을 지우지 않도록. 화면에는 퇴원 상태일 때만 보임 |
| 학년 코드는 초3~고3. 초1·초2 학생은 "학년을 확인할 수 없음" 경고만 | 요청한 범위. 학생 등록 화면에는 초1·초2가 있지만 막지는 않음 |
| 학생관리 첫 화면은 "재원" 필터 | 퇴원 학생이 목록에 섞이지 않도록. "전체" 버튼도 둠 |

## 3. 코드

| 파일 | 역할 |
|---|---|
| `lib/gradeNormalize.ts` | 학년 표기 → 코드, 대상 학년 경고 |
| `lib/classManagement.ts` | 입력 검사, 넣기 계획, 현황 계산, 오류 구별 |
| `lib/classManagementData.ts` | 준비 여부 확인, 넣기·빼기, 연관 기록 세기, 대시보드 현황 |
| `app/api/classes` | 목록·만들기 |
| `app/api/classes/[id]` | 상세·수정·종료 (삭제 없음) |
| `app/api/classes/[id]/students`, `.../move` | 넣기·빼기·옮기기 |
| `app/api/students/[id]/status` | 재원·휴원 변경, 퇴원(DB 함수) |
| `app/api/students/[id]` | 삭제 전 연관 기록 확인 |
| `app/classes`, `app/classes/[id]` | 반 목록·상세 |
| `app/students/page.tsx`, `components/classes/*` | 상태 필터, 여러 명 선택, 반 만들기·넣기, 퇴원 양식 |
| `lib/dashboardData.ts`, `app/dashboard/page.tsx` | 재원 기준 집계, 반·재원 현황 |
| `app/homework/page.tsx`, `app/tuition/page.tsx` | 대시보드 숫자를 눌렀을 때 같은 학생들이 보이도록 같은 기준 적용 |

### 칸이 없을 때의 대비

- `checkClassManagementReady`가 표 3개와 `students.status`를 **일반 조회**로 확인한다.
- 없으면 목록 API는 빈 값과 `needsMigration: true`, 쓰기 API는 503, 화면은 "반 관리 준비 중(DB 적용 필요)"을 보인다.
- 대시보드 숙제·원비는 지금까지처럼 전체 학생 기준으로 센다.
- **head 조회로 판단하면 안 된다.** 실제 DB로 확인한 결과 표가 없어도 head 조회는 오류 없이 204를 돌려주고, 칸이 없을 때는 오류 코드가 비어 있다. [사실]

### 학생 삭제

`attendance`, `homework`, `tuition_records`, `parent_notifications`, `exam_assignments`, `exam_results`, `wrong_answer_records`, `reports`, `level_test_results`, `class_students`를 세어 1건이라도 있으면 409와 건수를 돌려주고 퇴원 처리를 안내한다. 세다가 오류가 나면 지우지 않는다. **SQL 적용 전에도 이 규칙이 적용된다.**

## 4. 검증

| 방법 | 범위 |
|---|---|
| `npm run test-ownership` | 11개 API를 실제 함수로 실행 (가짜 DB) |
| `npm run test-class-management` | 학년 표기, 부분 고유 규칙, 퇴원 제외 집계, 칸 없을 때, 소유 확인 (가짜 DB) |
| 메모리 Postgres (PGlite) | migration·rollback SQL을 여러 줄·한 줄 양쪽으로 실행. check, 부분 고유, RESTRICT, RLS, 퇴원 함수 되돌림, 재실행, 기본키 없는 경우 |
| 로컬 서버 + 실제 DB 읽기 | SQL 적용 전 상태에서 화면·API 확인 |

PGlite의 `students`는 시험용으로 흉내 낸 표다. 실제 `students`의 정책은 SQL 파일이 없어 볼 수 없다.

## 5. 1단계에 넣지 않은 것

- 출석, 숙제, 시험 배정 화면의 학생 고르기에는 퇴원 학생이 그대로 나온다. 원비 화면의 전체 목록과 납부완료·전체 학생 숫자도 그대로다.
- 반 옮기기는 두 단계 저장이라 중간에 실패하면 학생이 두 반에 남는다. 이때는 오류로 알리고 "빼기"로 정리한다.
- 반을 만들 때 시간 또는 학생 저장이 실패하면 반은 남는다. 이때는 오류로 알리고 반 화면에서 이어서 입력한다.
- 반 단위 출석·숙제·시험 배정(2·3단계), 반 다시 열기.
