import { createClient } from "@supabase/supabase-js";

// 아직 Vercel에 실제 Supabase 키를 안 넣었을 때도 빌드가 깨지지 않도록,
// 값이 없으면 임시 값을 사용합니다. 실제 키를 넣고 나면 정상적으로 저장/조회됩니다.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
