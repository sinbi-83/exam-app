'use client'

// 인쇄 모양 샘플 (저장 안 됨): 코드 안 예시 문항(lib/printSample.ts)으로 혼합 시험 인쇄를 미리 본다.
// DB 에서 읽거나 쓰지 않는다. 쪽 나누기·A4 미리보기·단어 열 수·학생용/교사용 점검용.

import { useState } from 'react'
import { type PrintView } from '@/lib/printView'
import { SAMPLE_PRINT_QUESTIONS } from '@/lib/printSample'
import ExamSheetPrint, { type ExamQuestion } from '../[id]/print/ExamSheetPrint'

export default function PrintSamplePage() {
  const [view, setView] = useState<PrintView>('student')
  return (
    <ExamSheetPrint
      title="인쇄 모양 샘플"
      date=""
      questions={SAMPLE_PRINT_QUESTIONS as ExamQuestion[]}
      view={view}
      onViewChange={setView}
      notice={
        <p className="rounded bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          예시 문항으로 만든 인쇄 모양 샘플입니다. 저장된 시험이 아니며 DB 에 저장되지 않습니다.
        </p>
      }
    />
  )
}
