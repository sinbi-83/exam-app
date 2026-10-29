import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { findSchool, SCHOOL_PROFILE_SECTIONS, type SchoolProfileContent } from '@/config/schools'

// 학교 정보 칸 저장 (표: school_profiles, school-profiles-migration.sql)

function isTableMissing(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || (error.message ?? '').includes('school_profiles')
}

// GET ?region=daegu-namgu &school=daegu : 지역의 학교 정보 (school 이 있으면 그 학교만)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const region = request.nextUrl.searchParams.get('region') ?? ''
  const school = request.nextUrl.searchParams.get('school')
  let query = supabase.from('school_profiles').select('school_slug, content, updated_at').eq('user_id', user.id).eq('region', region)
  if (school) query = query.eq('school_slug', school)
  const { data, error } = await query
  if (error) {
    if (isTableMissing(error)) return NextResponse.json({ data: [], tableMissing: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data, tableMissing: false })
}

// PUT { region, school, content } : 학교 정보 칸 전체 저장
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const region = String(body.region ?? '')
  const school = String(body.school ?? '')
  if (!findSchool(region, school)) return NextResponse.json({ error: '학교를 찾을 수 없습니다.' }, { status: 400 })

  // 정해진 칸만 저장한다
  const raw = (body.content ?? {}) as SchoolProfileContent
  const content: SchoolProfileContent = {}
  for (const { key } of SCHOOL_PROFILE_SECTIONS) {
    const section = raw[key]
    if (!section) continue
    const status = section.status === 'confirmed' || section.status === 'estimated' ? section.status : ''
    content[key] = { text: String(section.text ?? ''), status }
  }

  const { error } = await supabase
    .from('school_profiles')
    .upsert(
      { user_id: user.id, region, school_slug: school, content, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,region,school_slug' },
    )
  if (error) {
    if (isTableMissing(error)) return NextResponse.json({ error: '학교 정보 표가 아직 없어요.', tableMissing: true }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
