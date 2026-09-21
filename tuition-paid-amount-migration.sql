-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- 원비 관리: 부분납부 시 "실제로 얼마 냈는지"를 저장할 컬럼 추가.

ALTER TABLE tuition_records ADD COLUMN IF NOT EXISTS paid_amount INTEGER;
