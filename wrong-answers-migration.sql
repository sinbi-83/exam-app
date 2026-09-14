-- 오답 분석 기록 테이블
CREATE TABLE IF NOT EXISTS wrong_answer_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  wrong_question_ids TEXT[] DEFAULT '{}',   -- 틀린 exam_question id 배열
  scored_at DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE wrong_answer_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wrong_answer_records"
  ON wrong_answer_records FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_wrong_answers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wrong_answers_updated_at
  BEFORE UPDATE ON wrong_answer_records
  FOR EACH ROW EXECUTE FUNCTION update_wrong_answers_updated_at();
