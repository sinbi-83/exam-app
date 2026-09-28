# 야간 무인 작업 진행 기록 (2026-09-28 밤)

재개할 때: 이 파일을 먼저 읽고 "끝난 것"은 다시 하지 않는다.

## 끝난 것 (코드만. 커밋·배포 여부는 옆에 적음)
- 1. 단어시험 레벨 변경 버그: 코드 완료 (lib/wordTestDraft.ts, app/vocab-test/BankMode.tsx, scripts/test-word-test-draft.ts)
  - 비슷한 패턴 점검·수정: app/question-search/page.tsx, app/exams/[id]/page.tsx (세트 선택)
- 2. 1,000줄 제한: 코드 완료 (api/vocabulary, api/vocabulary/bulk, scripts 9개, scripts/test-supabase-paging.ts)
- 3. 카피라이트: 코드 완료 (config/copyright.ts, lib/printCopyright.ts, app/components/AppFooter.tsx·CopyrightNotice.tsx, 인쇄 6화면, 단어은행·문제은행, '학원' 표기 정리, scripts/test-copyright.ts)
- 4. 애매한 단어: 파일 준비 완료 (data/vocabulary/stage4-ambiguous-derivatives.json, scripts/stage4-apply-ambiguous.ts, tire 원본 수정)
  - ⏳ DB 반영(파생어 3개 확인 필요로 추가, tire 대표 뜻) 아직
- 5. 색 이름 되돌리기: scripts/restore-color-meanings.ts 준비 완료 (실행 안 함 — 향미 선생님 결정)
- ⏳ 1~4 모두: 테스트 실행·빌드·커밋·배포 아직 (셸 검사 무응답)

## ✅ 2026-09-29 아침: 전부 완료 (테스트·빌드·커밋·배포 2회·DB 반영·메뉴 개편 배포) → docs/morning-report.md

## (밤) 지금 하는 것
- 6. 5단계 메뉴 개편 (코드)

## 남은 것
- 셸 복구 후: 테스트 → 빌드 → 1·2·3·4 순서로 커밋·배포 → DB 개수·출제 가능 수 → 4번 DB 반영
- 6. 메뉴 개편 점검 → 통과 시 배포
- 8. 아침 보고서 docs/morning-report.md

## 메모
- 도구 상태: 시작 직후부터 Bash/PowerShell 자동 모드 검사가 응답하지 않음(오류, 판정 없음).
- 설계도 v1 원문 파일은 폴더에 없음 → 5단계는 명령서 설명 + docs/stage0 4장(Q4) 기준으로 진행.
