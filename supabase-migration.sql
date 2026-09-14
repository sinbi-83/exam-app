-- =============================================
-- 보스턴S영어 - 신규 기능 DB 마이그레이션
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. 시험-문항 연결 테이블
CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question_data JSONB NOT NULL,
  sort_order INTEGER DEFAULT 0,
  points INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_questions_own" ON exam_questions
  FOR ALL USING (auth.uid() = user_id);

-- 2. 출석 관리 테이블
CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, student_id, date)
);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_own" ON attendance
  FOR ALL USING (auth.uid() = user_id);

-- 3. 수업 일정 테이블
CREATE TABLE IF NOT EXISTS schedule_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  event_type TEXT DEFAULT 'class' CHECK (event_type IN ('class', 'exam', 'holiday', 'other')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE schedule_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_events_own" ON schedule_events
  FOR ALL USING (auth.uid() = user_id);

-- 4. 원비 관리 테이블
CREATE TABLE IF NOT EXISTS tuition_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'partial')),
  paid_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, student_id, month)
);
ALTER TABLE tuition_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tuition_records_own" ON tuition_records
  FOR ALL USING (auth.uid() = user_id);

-- 5. 학부모 알림 테이블
CREATE TABLE IF NOT EXISTS parent_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE parent_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parent_notifications_own" ON parent_notifications
  FOR ALL USING (auth.uid() = user_id);

-- 완료!
SELECT 'Migration complete! 5 tables created.' AS result;

-- =============================================
-- 보고서 저장 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,
  student_grade TEXT,
  exam_title TEXT,
  exam_date DATE,
  score INTEGER,
  max_score INTEGER DEFAULT 100,
  strengths TEXT,
  comment TEXT,
  next_steps TEXT,
  type_scores JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_own" ON reports
  FOR ALL USING (auth.uid() = user_id);
