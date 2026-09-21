-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- exam_sheets 테이블이 로그인 기능 도입 전에 "누구나 읽고 쓰기 허용"으로 열려있던 것을 닫는다.

-- 1) 기존에 user_id가 비어있던 행을 현재 계정으로 채움
update exam_sheets set user_id = 'ac06fc89-db8e-41a3-be98-3e43178b2c0d' where user_id is null;

-- 2) user_id 필수화 + 본인 것만 접근하도록 정책 교체
alter table exam_sheets alter column user_id set not null;

drop policy if exists "Allow all for now" on exam_sheets;
create policy "exam_sheets_own"
  on exam_sheets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
