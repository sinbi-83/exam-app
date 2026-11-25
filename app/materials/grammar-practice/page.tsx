'use client'

import { useState } from 'react'
import { grammarGoals, selectGrammarItems } from '@/lib/grammarWorksheet'

export default function GrammarPracticePage() {
  const [goals, setGoals] = useState<string[]>([])
  const [activity, setActivity] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [teacher, setTeacher] = useState(false)
  const [title, setTitle] = useState('to부정사 보충 학습지')
  const candidates = selectGrammarItems(goals, activity)
  const questions = candidates.filter(q => selected.includes(q.fixtureId))
  function toggleGoal(id: string) {
    setGoals(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id])
    setSelected([])
  }
  return (
    <div className="grammar-workspace mx-auto max-w-5xl">
      <div className="worksheet-controls space-y-5">
        <header>
          <p className="text-sm text-amber-700">선생님 검수용 · 시험 기능</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">문법 학습지</h1>
          <p className="mt-2 text-sm text-slate-600">to부정사 세부 목표를 고르고, 문항을 확인한 뒤 인쇄하세요.</p>
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">예제 9문항은 검토용 초안입니다. 학년·4단계 난이도는 아직 확정하지 않았습니다. 학생 자료를 읽거나 저장하지 않으며 화면을 나가면 선택은 초기화됩니다.</p>
        </header>
        <section className="rounded-lg border bg-white p-5" aria-labelledby="goal-heading">
          <h2 id="goal-heading" className="mb-3 font-bold">1. 문법 목표 선택</h2>
          <div className="grid gap-3 sm:grid-cols-3">{grammarGoals.map(g => <label key={g.id} className={`cursor-pointer rounded border p-3 ${goals.includes(g.id) ? 'border-amber-600 bg-amber-50' : ''}`}>
            <input type="checkbox" checked={goals.includes(g.id)} onChange={() => toggleGoal(g.id)} className="mr-2" />
            <span className="font-semibold">{g.label}</span><span className="mt-2 block text-xs text-slate-600">{g.description}</span>
          </label>)}</div>
          <label className="mt-4 block text-sm">활동 형태 <select className="ml-2 rounded border p-2" value={activity} onChange={e => { setActivity(e.target.value); setSelected([]) }}>
            <option value="all">전체</option>{['고르기', '조건 영작', '문장 전환'].map(a => <option key={a}>{a}</option>)}
          </select></label>
        </section>
        <section className="rounded-lg border bg-white p-5" aria-labelledby="question-heading">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="question-heading" className="font-bold">2. 문항 확인 · 선택</h2>
            <button type="button" disabled={!candidates.length} onClick={() => setSelected(candidates.map(q => q.fixtureId))} className="rounded border px-3 py-2 text-sm disabled:opacity-40">현재 문항 전체 선택</button></div>
          <p role="status" className="my-3 text-sm text-slate-600">검색 {candidates.length}문항 · 선택 {questions.length}문항. 각 목표의 예제는 3문항이며 부족한 문항을 자동 생성하지 않습니다.</p>
          {!candidates.length && <p className="py-5 text-center text-slate-500">먼저 문법 목표를 선택해주세요.</p>}
          <div className="space-y-3">{candidates.map(q => <article key={q.fixtureId} className="rounded border p-4">
            <label className="flex cursor-pointer items-start gap-2"><input type="checkbox" checked={selected.includes(q.fixtureId)} onChange={() => setSelected(old => old.includes(q.fixtureId) ? old.filter(x => x !== q.fixtureId) : [...old, q.fixtureId])} className="mt-1" />
              <span><span className="mb-2 block text-xs text-amber-800">{grammarGoals.find(g => g.id === q.goal)?.label} · {q.activity}</span><span className="whitespace-pre-line text-sm">{q.prompt}</span></span></label>
            {q.choices && <ol className="mt-2 space-y-1 pl-6 text-sm">{q.choices.map((v,i) => <li key={v}>{['①','②','③','④','⑤'][i]} {v}</li>)}</ol>}
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-blue-800">정답·해설·채점 기준 검토</summary><p className="mt-2">정답: {q.answer}</p><p>{q.explanation}</p><p className="text-slate-600">{q.rubric}</p></details>
          </article>)}</div>
        </section>
        <section className="rounded-lg border bg-white p-5">
          <h2 className="mb-3 font-bold">3. 미리보기 · 인쇄</h2>
          <label className="block text-sm">학습지 제목<input maxLength={80} value={title} onChange={e => setTitle(e.target.value)} className="ml-2 w-full max-w-md rounded border p-2" /></label>
          <label className="my-3 block text-sm"><input type="checkbox" checked={teacher} onChange={e => setTeacher(e.target.checked)} className="mr-2" />교사용 정답·해설 포함 (학생용 인쇄 시 해제)</label>
          <button type="button" disabled={!questions.length} onClick={() => window.print()} className="rounded bg-slate-800 px-5 py-2 text-white disabled:opacity-40">{teacher ? '교사용' : '학생용'} 인쇄 / PDF 저장</button>
          <p className="mt-2 text-xs text-slate-500">브라우저 인쇄 창에서 A4를 선택하세요. 시험지 보관함·학생 결과 저장은 이번 시험 범위에 포함되지 않습니다.</p>
        </section>
      </div>
      <section className="worksheet-output mt-6 rounded border bg-white p-6" aria-label="학습지 미리보기">
        <p className="mb-2 text-xs text-slate-500">보스턴S영어 · 검토용 예제 · {teacher ? '교사용' : '학생용'}</p>
        <h2 className="break-words text-xl font-bold">{title.trim() || '문법 보충 학습지'}</h2>
        <p className="my-3 border-b pb-3 text-sm">이름: ____________________　 총 {questions.length}문항</p>
        {!questions.length && <p className="text-sm text-slate-500">문항을 선택하면 이곳에 학습지가 표시됩니다.</p>}
        {questions.map((q,i) => <article key={q.fixtureId} className="worksheet-question mb-6">
          <p className="mb-2 whitespace-pre-line text-sm leading-6"><strong>{i+1}. </strong>{q.prompt}</p>
          {q.choices && <ol className="space-y-1 text-sm">{q.choices.map((v,j) => <li key={v}>{['①','②','③','④','⑤'][j]} {v}</li>)}</ol>}
          <p className="mt-4 text-sm">답: __________________________________________________</p>
          {teacher && <div className="mt-3 rounded bg-slate-50 p-3 text-sm"><p><b>정답:</b> {q.answer}</p><p>{q.explanation}</p><p><b>채점:</b> {q.rubric}</p></div>}
        </article>)}
      </section>
      <style jsx global>{`
        @page { size: A4; margin: 16mm; }
        @media print {
          body * { visibility: hidden !important; }
          .worksheet-output, .worksheet-output * { visibility: visible !important; }
          .worksheet-controls { display: none !important; }
          .worksheet-output { position: absolute; left: 0; top: 0; width: 100%; margin: 0 !important; padding: 0 !important; border: 0 !important; color: black; background: white; }
          .worksheet-question { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
