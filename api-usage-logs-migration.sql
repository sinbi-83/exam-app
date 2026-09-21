-- 이 파일 전체를 Supabase 웹사이트 > SQL Editor 에 붙여넣고 실행(Run)하면 됩니다.
-- Claude API 호출할 때마다 토큰 사용량을 기록해서, 진짜 API 비용을 계산할 수 있게 한다.

create table if not exists api_usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  route text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz default now()
);

alter table api_usage_logs enable row level security;

drop policy if exists "api_usage_logs_own_select" on api_usage_logs;
create policy "api_usage_logs_own_select"
  on api_usage_logs
  for select
  using (auth.uid() = user_id);

drop policy if exists "api_usage_logs_own_insert" on api_usage_logs;
create policy "api_usage_logs_own_insert"
  on api_usage_logs
  for insert
  with check (auth.uid() = user_id);
