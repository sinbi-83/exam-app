import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

const ALLOWED_TYPES = ['logo', 'signature'] as const
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const formData = await request.formData()
  const type = formData.get('type')
  const file = formData.get('file')

  if (typeof type !== 'string' || !ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json({ error: '잘못된 이미지 종류입니다.' }, { status: 400 })
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 400 })
  }

  if (file.type !== 'image/png') {
    return NextResponse.json({ error: 'PNG 파일만 업로드할 수 있습니다.' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 5MB 이하여야 합니다.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const path = `${user.id}/${type}.png`

  const { error: uploadError } = await supabase.storage
    .from('brand')
    .upload(path, buffer, { contentType: 'image/png', upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: publicUrlData } = supabase.storage.from('brand').getPublicUrl(path)
  const url = `${publicUrlData.publicUrl}?v=${Date.now()}`
  const urlField = type === 'logo' ? 'logo_url' : 'signature_url'

  const { error: upsertError } = await supabase
    .from('academy_settings')
    .upsert({
      user_id: user.id,
      [urlField]: url,
      updated_at: new Date().toISOString(),
    })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, [type === 'logo' ? 'logoUrl' : 'signatureUrl']: url })
}
