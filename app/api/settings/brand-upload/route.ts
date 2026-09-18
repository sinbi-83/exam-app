import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

const ALLOWED_TYPES = ['logo', 'signature'] as const
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: Request) {
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
  const destPath = path.join(process.cwd(), 'public', 'brand', `${type}.png`)

  await writeFile(destPath, buffer)

  return NextResponse.json({ ok: true })
}
