'use client'

// 반 관리 화면 공용 부품: 반 입력 양식, 준비 중 안내, 경고 문구 (반 목록·반 상세·학생관리가 함께 쓴다)

import { GRADE_CODES, type GradeWarningReason } from '@/lib/gradeNormalize'
import { NOT_READY_MESSAGE, WEEKDAY_LABELS, type ScheduleInput } from '@/lib/classManagement'

export type ClassFormState = {
  name: string
  target_grades: string[]
  teacher_name: string
  note: string
  schedules: ScheduleInput[]
}

export const EMPTY_CLASS_FORM: ClassFormState = { name: '', target_grades: [], teacher_name: '', note: '', schedules: [] }

export function NotReadyNotice() {
  return <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{NOT_READY_MESSAGE}</p>
}

const INPUT = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none'

export function ClassFields({ form, setForm }: { form: ClassFormState; setForm: (f: ClassFormState) => void }) {
  function toggleGrade(code: string) {
    const has = form.target_grades.includes(code)
    setForm({ ...form, target_grades: has ? form.target_grades.filter((g) => g !== code) : [...form.target_grades, code] })
  }
  function setSchedule(index: number, patch: Partial<ScheduleInput>) {
    setForm({ ...form, schedules: form.schedules.map((s, i) => (i === index ? { ...s, ...patch } : s)) })
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">반 이름 *</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="중2 내신반" className={INPUT} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">담당 선생님</label>
          <input type="text" value={form.teacher_name} onChange={(e) => setForm({ ...form, teacher_name: e.target.value })} className={INPUT} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">대상 학년</label>
        <div className="flex flex-wrap gap-1">
          {GRADE_CODES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => toggleGrade(code)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                form.target_grades.includes(code) ? 'border-blue-800 bg-blue-800 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-blue-500'
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">요일·시간</label>
        <div className="space-y-2">
          {form.schedules.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={s.weekday} onChange={(e) => setSchedule(i, { weekday: Number(e.target.value) })} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" aria-label="요일">
                {WEEKDAY_LABELS.map((label, d) => (
                  <option key={label} value={d + 1}>{label}요일</option>
                ))}
              </select>
              <input type="time" value={s.start_time} onChange={(e) => setSchedule(i, { start_time: e.target.value })} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" aria-label="시작 시간" />
              <span className="text-gray-400">~</span>
              <input type="time" value={s.end_time} onChange={(e) => setSchedule(i, { end_time: e.target.value })} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" aria-label="끝 시간" />
              <button type="button" onClick={() => setForm({ ...form, schedules: form.schedules.filter((_, n) => n !== i) })} className="text-xs text-gray-400 hover:text-red-500">
                빼기
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setForm({ ...form, schedules: [...form.schedules, { weekday: 1, start_time: '16:00', end_time: '17:00' }] })}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            + 요일·시간 추가
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">메모</label>
        <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={INPUT} />
      </div>
    </div>
  )
}

export function classFormBody(form: ClassFormState) {
  return { name: form.name, target_grades: form.target_grades, teacher_name: form.teacher_name, note: form.note, schedules: form.schedules }
}

const REASON_LABEL: Record<GradeWarningReason, string> = {
  not_target: '대상 학년이 아님',
  unknown_grade: '학년을 확인할 수 없음',
}

export type MemberWarningView = { student_id: string; name: string; grade: string; reason: GradeWarningReason }

export function warningText(warnings: MemberWarningView[]): string {
  return warnings.map((w) => `${w.name}${w.grade ? ` (${w.grade})` : ''}: ${REASON_LABEL[w.reason]}`).join('\n')
}
