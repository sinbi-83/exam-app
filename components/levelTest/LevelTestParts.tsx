'use client'

// 레벨테스트 화면들(인쇄·태블릿 응시·종이 채점 입력·결과)이 함께 쓰는 작은 부품.

import { useEffect, useState } from 'react'
import { CHOICE_MARKS, SECTION_LABELS } from '@/lib/levelTest'
import { schoolStageBadgeClass } from '@/lib/gradeLevel'
import type { LevelTestItem, LevelTestPassage, LevelTestSection } from '@/types/levelTest'

export function GradeBadge({ grade }: { grade: string }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${schoolStageBadgeClass(grade)}`}>{grade}</span>
}

export function FormBadge({ form }: { form: string }) {
  const cls = form === 'A' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{form}형</span>
}

export const SECTION_EMOJI: Record<LevelTestSection, string> = { vocab: '🔤', grammar: '🧩', reading: '📖', writing: '✏️' }

export function sectionTitle(section: LevelTestSection): string {
  return `${SECTION_EMOJI[section]} ${SECTION_LABELS[section]}`
}

// 지문 상자 (인쇄·화면 공통)
export function PassageBox({ passage, large }: { passage: LevelTestPassage; large?: boolean }) {
  return (
    <div className={`rounded border border-gray-300 bg-gray-50 ${large ? 'p-4 text-lg leading-8' : 'p-3 text-[13px] leading-6'}`}>
      {passage.title && <p className={`mb-1 font-semibold text-gray-800 ${large ? 'text-lg' : ''}`}>{passage.title}</p>}
      <p className="whitespace-pre-line text-gray-800">{passage.text}</p>
    </div>
  )
}

// 문제 + 그림/단어(stimulus) (보기·답 칸은 화면마다 다르게 그린다)
export function ItemHead({ item, num, large }: { item: LevelTestItem; num: number; large?: boolean }) {
  return (
    <div>
      <p className={`text-gray-900 ${large ? 'text-lg font-medium' : 'text-[13px]'}`}>
        <span className="mr-1 font-semibold">{num}.</span>
        {item.prompt}
        {!large && <span className="ml-1 text-[11px] text-gray-400">({item.points}점)</span>}
      </p>
      {item.stimulus && (
        <p className={`mt-1 ${isEmojiOnly(item.stimulus) ? (large ? 'text-6xl' : 'text-4xl') : large ? 'text-2xl font-medium' : 'text-[15px] font-medium'} text-gray-900`}>
          {item.stimulus}
        </p>
      )}
      {item.hint && <p className={`mt-0.5 text-gray-500 ${large ? 'text-base' : 'text-[12px]'}`}>힌트: {item.hint}</p>}
    </div>
  )
}

function isEmojiOnly(s: string): boolean {
  // 영어·숫자·한글·밑줄 칸이 하나도 없으면 그림(이모지)으로 보고 크게 보여 준다
  return !/[A-Za-z0-9가-힣_]/.test(s)
}

// 인쇄용 보기: 짧으면 한 줄에 4개, 길면 2열/1열
export function PrintChoices({ choices, answer, showAnswer }: { choices: string[]; answer?: number; showAnswer?: boolean }) {
  const longest = Math.max(...choices.map((c) => c.length))
  const cols = longest <= 12 ? 'grid-cols-4' : longest <= 26 ? 'grid-cols-2' : 'grid-cols-1'
  return (
    <div className={`mt-1 grid ${cols} gap-x-4 gap-y-0.5 text-[13px] text-gray-800`}>
      {choices.map((c, i) => (
        <span key={i} className={showAnswer && answer === i ? 'font-bold text-red-600' : ''}>
          {CHOICE_MARKS[i]} {c}
        </span>
      ))}
    </div>
  )
}

// 학생이 고른/쓴 답을 글자로 (결과 화면·상담용 결과지)
export function givenText(item: LevelTestItem, given: number | string | undefined): string {
  if (given === undefined || given === '') return '(안 씀)'
  if (item.type === 'mc') return `${CHOICE_MARKS[Number(given)] ?? ''} ${item.choices?.[Number(given)] ?? ''}`
  return String(given)
}

// 학생 목록 (선택하면 이름이 채워진다. 신규 상담 학생은 이름만 써도 된다)
export interface StudentOption {
  id: string
  name: string
  grade: string | null
}
export function useStudents(): StudentOption[] {
  const [students, setStudents] = useState<StudentOption[]>([])
  useEffect(() => {
    fetch('/api/students')
      .then((r) => r.json())
      .then((j) => setStudents(Array.isArray(j.data) ? j.data : []))
      .catch(() => setStudents([]))
  }, [])
  return students
}

export function StudentPicker({
  name,
  studentId,
  onChange,
  large,
}: {
  name: string
  studentId: string | null
  onChange: (v: { name: string; studentId: string | null }) => void
  large?: boolean
}) {
  const students = useStudents()
  const size = large ? 'px-4 py-3 text-lg' : 'px-3 py-1.5 text-sm'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => onChange({ name: e.target.value, studentId: null })}
        placeholder="학생 이름"
        className={`w-44 rounded border border-gray-300 ${size}`}
      />
      {students.length > 0 && (
        <select
          value={studentId ?? ''}
          onChange={(e) => {
            const s = students.find((x) => x.id === e.target.value)
            onChange(s ? { name: s.name, studentId: s.id } : { name, studentId: null })
          }}
          className={`rounded border border-gray-300 ${size}`}
        >
          <option value="">등록 학생에서 고르기 (선택)</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.grade ? ` (${s.grade})` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function TableMissingNotice() {
  return (
    <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
      결과 저장 표가 아직 없어요. 시험지 인쇄·태블릿 풀이·채점 계산은 되지만 <b>결과 저장</b>은 Supabase SQL Editor 에서
      <code className="mx-1">level-test-results-migration.sql</code>의 한 줄 SQL 을 실행한 뒤부터 됩니다.
    </div>
  )
}
