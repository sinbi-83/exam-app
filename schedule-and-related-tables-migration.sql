-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- supabase-migration.sql 중 아직 안 만들어진 4개 테이블만 다시 뽑은 것.
-- (attendance, schedule_events, tuition_records, parent_notifications)

-- 1. 출석 관리 테이블
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
DROP POLICY IF EXISTS "attendance_own" ON attendance;
CREATE POLICY "attendance_own" ON attendance
  FOR ALL USING (auth.uid() = user_id);

-- 2. 수업 일정 테이블
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
DROP POLICY IF EXISTS "schedule_events_own" ON schedule_events;
CREATE POLICY "schedule_events_own" ON schedule_events
  FOR ALL USING (auth.uid() = user_id);

-- 3. 원비 관리 테이블
CREATE TABLE IF NOT EXISTS tuition_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  month_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'partial')),
  paid_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, student_id, month_name)
);
ALTER TABLE tuition_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tuition_records_own" ON tuition_records;
CREATE POLICY "tuition_records_own" ON tuition_records
  FOR ALL USING (auth.uid() = user_id);

-- 4. 학부모 알림 테이블
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
DROP POLICY IF EXISTS "parent_notifications_own" ON parent_notifications;
CREATE POLICY "parent_notifications_own" ON parent_notifications
  FOR ALL USING (auth.uid() = user_id);
