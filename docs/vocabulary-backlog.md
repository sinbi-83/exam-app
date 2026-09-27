# 단어은행 백로그 (2026-09-27 기록)

오늘 목표(단어시험 실제 생성·저장·인쇄)를 위해 뒤로 미룬 항목.

## 향후 상용화 / 다중계정 보안
- [ ] vocabulary_entries / vocabulary_sources 다중 사용자 RLS 공격 테스트
      (두 번째 계정으로 남의 어휘 조회·수정·삭제·출처 연결 시도 → 전부 차단되는지).
      준비된 검증 스크립트 항목: 다른 계정 SELECT 0행, UPDATE/DELETE 0행, 남의 entry 에 source 연결 시 RLS 오류.
- [ ] 상용화용 권한 시스템 (현재는 단일 운영자 내부 프로그램)

## 난이도 기준
- [ ] `config/vocabularyLevels.ts` 의 중1 4단계 범위는 **향미 선생님 검수 전 임시 기준**
      (학교형 1~30 / 일반학원형 15~45 / 상위학원형 30~60 / 선행형 45~75). 검수 후 min/max 만 고친다.
- [ ] 다른 학년 변환표
- [ ] 방향별(영→한/한→영) 범위가 달라지면 `app/vocab-test/BankMode.tsx` 에서 방향별 범위 사용

## 데이터
- [ ] seed(`data/vocabulary/bostons-teacher-seed-v1.json`, 60개)는 기능 검증용. status=approved / approval_origin=batch 로 들어가 있고
      teacher_reviewed_at 은 비어 있음 → 선생님이 /vocabulary 에서 확인·수정하면 기록된다.
- [ ] 공식 2022 개정 교육과정 어휘 (원본 파일 확보 후에만)
- [ ] 과거 자료 대량 백필

## 기능
- [ ] 일괄 승인/반려, 수정 이력, 시험 이력 탭
- [ ] 미리보기에서 바로 단어은행 반려/난이도 수정 (현재는 /vocabulary 에서만)
- [ ] 단어시험 채점 시 accepted_answers 활용
