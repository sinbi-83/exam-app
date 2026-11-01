import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { kstDateString } from '@/lib/dashboard'
import { checkStudentsOwnership } from '@/lib/ownership'
import { addMembersToClass, checkClassManagementReady, checkClassOwnership, closeMemberships } from '@/lib/classManagementData'
import { isDateString, NOT_READY_MESSAGE } from '@/lib/classManagement'

// 반 학생 넣기(POST)·빼기(PATCH). 빼기는 행을 지우지 않고 left_on 을 채운다. 옮기기는 ./move.

type Params = { params: { id: string } }

async function prepare(params: Params['params']) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { response: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  const readiness = await checkClassManagementReady(supabase)
  if (!readiness.ready) {
    return {
      response: readiness.missing
        ? NextResponse.json({ error: NOT_READY_MESSAGE, needsMigration: true }, { status: 503 })
        : NextResponse.json({ error: readiness.error }, { status: 500 }),
    }
  }
  const ownership = await checkClassOwnership(supabase, params.id, user.id)
  if (!ownership.ok) return { response: NextResponse.json({ error: ownership.error }, { status: ownership.status }) }
  return { supabase, user }
}

// POST { student_ids, joined_on? } : 대상 학년이 아니어도 넣고 warnings 로 알려 준다
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await prepare(params)
  if (ctx.response) return ctx.response
  const body = await request.json()
  const studentIds: unknown[] = Array.isArray(body.student_ids) ? body.student_ids : []
  if (studentIds.length === 0) return NextResponse.json({ error: '학생을 골라 주세요.' }, { status: 400 })
  const joinedOn = body.joined_on ?? kstDateString(new Date())
  if (!isDateString(joinedOn)) return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })

  const result = await addMembersToClass(ctx.supabase, ctx.user.id, params.id, studentIds, joinedOn)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ added: result.added.length, alreadyIn: result.alreadyIn.length, warnings: result.warnings })
}

// PATCH { student_ids, left_on? } : 반에서 빼기
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await prepare(params)
  if (ctx.response) return ctx.response
  const body = await request.json()
  const studentIds: unknown[] = Array.isArray(body.student_ids) ? body.student_ids : []
  if (studentIds.length === 0) return NextResponse.json({ error: '학생을 골라 주세요.' }, { status: 400 })
  const leftOn = body.left_on ?? kstDateString(new Date())
  if (!isDateString(leftOn)) return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })

  const ownership = await checkStudentsOwnership(ctx.supabase, studentIds, ctx.user.id)
  if (!ownership.ok) return NextResponse.json({ error: ownership.error }, { status: ownership.status })

  const result = await closeMemberships(ctx.supabase, ctx.user.id, params.id, studentIds as string[], leftOn)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ removed: result.closed })
}
