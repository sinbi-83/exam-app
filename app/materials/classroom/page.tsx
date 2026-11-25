'use client'

import { useRef, useState, type PointerEvent } from 'react'
type Point = { x: number; y: number }
type Stroke = { id: number; points: Point[]; color: string }
const lessons = [
  { title: '함께 연습: Mina의 공책', passage: 'Mina left her notebook in the classroom. She went back to get it.', question: 'Why did Mina go back to the classroom?', answers: ['She went back to get her notebook.', 'She went back because she wanted to get her notebook.'], note: '이유가 포함되어야 합니다. because를 요구하는 문제가 아니라면 두 표현을 모두 인정합니다.' },
  { title: '혼자 적용: Leo의 물', passage: 'Leo was thirsty. He went to the kitchen to get some water.', question: 'Why did Leo go to the kitchen?', answers: ['He went to the kitchen to get some water.', 'He went to the kitchen because he wanted to get some water.', 'He went to the kitchen because he was thirsty.'], note: '갈증이라는 이유 또는 물을 얻으려는 목적을 타당하게 표현하면 인정합니다. 이 문장만으로 독립 숙달을 확정하지 않습니다.' },
]
const stages = ['질문 확인', '종이에 첫 답', '근거 표시', '종이에 고쳐 쓰기', '혼자 적용']
const guidance = [
  '무엇을 묻는 질문인지 학생이 자기 말로 설명하게 합니다. 정답과 근거는 미리 표시하지 않습니다.',
  '학생이 종이에 먼저 답합니다. 질문 파악·근거 찾기·문장화 중 어디서 막혔는지 확인합니다.',
  '펜을 선택하고 학생이 직접 질문과 근거를 표시합니다. 왜 답이 되는지, 대명사가 무엇을 가리키는지 설명하게 합니다.',
  '학생이 종이에 다시 쓴 다음 아래 확인란을 체크하고 예시 답안을 엽니다.',
  '아래 지문 전환 버튼으로 새 지문을 엽니다. 단서나 예시 답을 먼저 보여주지 말고 혼자 적용하는지 확인합니다.',
]
export default function ClassroomPage() {
  const [lesson, setLesson] = useState(0), [stage, setStage] = useState(0)
  const [size, setSize] = useState(30)
  const [tool, setTool] = useState<'move'|'pen'|'eraser'>('move')
  const [color, setColor] = useState('#b91c1c')
  const [strokes, setStrokes] = useState<Stroke[]>([]), [history, setHistory] = useState<Stroke[][]>([])
  const [answerOpen, setAnswerOpen] = useState(false), [rewritten, setRewritten] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false), [observation, setObservation] = useState('미평가')
  const svg = useRef<SVGSVGElement>(null), active = useRef<number | null>(null)
  const strokeId = useRef(0), currentStroke = useRef<number | null>(null)
  const current = lessons[lesson], scale = size / 30
  function point(e: PointerEvent<SVGSVGElement>): Point | null {
    const matrix = svg.current?.getScreenCTM()
    if (!matrix) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
    return { x: p.x, y: p.y }
  }
  function erase(p: Point) {
    setStrokes(old => old.filter(s => !s.points.some((a,i) => {
      const b=s.points[Math.max(0,i-1)], dx=a.x-b.x, dy=a.y-b.y, length=dx*dx+dy*dy
      const t=length?Math.max(0,Math.min(1,((p.x-b.x)*dx+(p.y-b.y)*dy)/length)):0
      return Math.hypot(p.x-(b.x+t*dx),p.y-(b.y+t*dy))<15
    })))
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if(tool==='move'||active.current!==null||e.button!==0)return
    const p=point(e);if(!p)return
    e.preventDefault();active.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId)
    setHistory(old=>[...old.slice(-39),strokes])
    if(tool==='eraser'){erase(p);return}
    const id=++strokeId.current;currentStroke.current=id
    setStrokes(old=>[...old,{id,color,points:[p]}])
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if(active.current!==e.pointerId)return
    const p=point(e);if(!p)return
    if(tool==='eraser'){erase(p);return}
    setStrokes(old=>old.map(s=>s.id===currentStroke.current?{...s,points:[...s.points,p]}:s))
  }
  function end(e: PointerEvent<SVGSVGElement>) {
    if(active.current!==e.pointerId)return
    active.current=null;currentStroke.current=null
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
  }
  function reset(next:number) {
    if(strokes.length&&!window.confirm('현재 판서는 저장되지 않습니다. 지우고 지문을 바꿀까요?'))return
    active.current=null;currentStroke.current=null
    setLesson(next);setStage(next===1?4:0);setStrokes([]);setHistory([]);setAnswerOpen(false);setRewritten(false);setObservation('미평가');setClearConfirm(false)
  }
  return <div className="mx-auto max-w-5xl space-y-5">
    <header><p className="text-sm text-amber-800">첫 수업 시연 · 저장하지 않는 연습 화면</p><h1 className="mt-1 text-2xl font-bold">전자칠판 수업</h1><p className="mt-2 text-lg">깊이 읽고, 자기 문장으로 답하다.</p><p className="mt-2 text-sm text-slate-600">첫 답과 수정 답은 종이에 씁니다. 판서·관찰 기록은 이동·새로고침 시 사라지며 학생 자료에 저장되지 않습니다.</p></header>
    <div className="flex flex-wrap gap-2" role="group" aria-label="수업 단계">{stages.map((s,i)=><button key={s} type="button" aria-pressed={stage===i} onClick={()=>setStage(i)} className={`rounded border px-3 py-2 ${stage===i?'bg-slate-800 text-white':'bg-white'}`}>{i+1}. {s}</button>)}</div>
    <section className="rounded border bg-white p-4" aria-label="수업 안내"><b>{stages[stage]}</b><p className="mt-1 text-sm">{guidance[stage]}</p></section>
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="칠판 도구">
      <button type="button" onClick={()=>{if(active.current===null)setSize(x=>Math.max(24,x-6))}} disabled={size<=24} className="rounded border bg-white px-3 py-2 disabled:opacity-40" aria-label="축소">글자 −</button><span className="text-sm">{Math.round(scale*100)}%</span>
      <button type="button" onClick={()=>{if(active.current===null)setSize(x=>Math.min(48,x+6))}} disabled={size>=48} className="rounded border bg-white px-3 py-2 disabled:opacity-40" aria-label="확대">글자 ＋</button>
      {(['move','pen','eraser'] as const).map((t,i)=><button key={t} type="button" aria-pressed={tool===t} onClick={()=>{if(active.current===null)setTool(t)}} className={`rounded border px-3 py-2 ${tool===t?'bg-slate-800 text-white':'bg-white'}`}>{['이동·스크롤','펜','지우개'][i]}</button>)}
      <label className="text-sm">펜 색 <select value={color} onChange={e=>setColor(e.target.value)} className="rounded border p-2"><option value="#b91c1c">빨강</option><option value="#1d4ed8">파랑</option><option value="#166534">초록</option></select></label>
      <button type="button" disabled={!history.length} onClick={()=>{if(active.current!==null)return;setStrokes(history[history.length-1]);setHistory(old=>old.slice(0,-1))}} className="rounded border bg-white px-3 py-2 disabled:opacity-40">되돌리기</button>
      <button type="button" disabled={!strokes.length} onClick={()=>setClearConfirm(true)} className="rounded border bg-white px-3 py-2 disabled:opacity-40">전체 지우기</button>
    </div>
    {clearConfirm&&<div className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 p-3" role="group" aria-label="판서 삭제 확인"><span>판서를 모두 지울까요?</span><button type="button" className="rounded border px-3 py-2" onClick={()=>{setHistory(old=>[...old.slice(-39),strokes]);setStrokes([]);setClearConfirm(false)}}>판서 모두 지우기</button><button type="button" className="rounded border px-3 py-2" onClick={()=>setClearConfirm(false)}>취소</button></div>}
    <p className="text-xs text-slate-600">펜·지우개로 한 손가락 또는 펜 표시가 가능합니다. 화면 이동은 ‘이동·스크롤’을 선택하세요. 지우개는 닿은 선 전체를 지웁니다. 실제 기기의 펜·손바닥 구분은 별도 확인이 필요합니다.</p>
    <section className="overflow-auto rounded border-2 border-slate-300 bg-white" style={{maxHeight:'72vh'}} aria-label="칠판 화면" tabIndex={0}>
      <div style={{width:900*scale,height:390*scale,position:'relative'}}>
        <div style={{width:900,height:390,transform:`scale(${scale})`,transformOrigin:'top left',position:'relative'}}>
          <div style={{padding:32,color:'#142e49'}}><p style={{fontSize:15,marginBottom:14}}>지문 · {current.title}</p><p style={{fontSize:30,lineHeight:'1.7',margin:0}}>{current.passage}</p><hr style={{margin:'28px 0',borderColor:'#d4c8ab'}} /><p style={{fontSize:15,marginBottom:12}}>질문</p><p style={{fontSize:30,lineHeight:'1.7',margin:0}}>{current.question}</p></div>
          <svg ref={svg} data-testid="ink-layer" role="img" aria-label="학생 근거 표시 판서 영역" viewBox="0 0 900 390" style={{position:'absolute',inset:0,width:900,height:390,touchAction:tool==='move'?'auto':'none',pointerEvents:tool==='move'?'none':'auto',cursor:tool==='eraser'?'cell':'crosshair'}} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={()=>{active.current=null;currentStroke.current=null}}>
            {strokes.map(s=><polyline key={s.id} data-stroke={s.id} points={s.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={s.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>
        </div>
      </div>
    </section>
    <section className="rounded border bg-white p-4" aria-label="고쳐 쓰기 확인"><h2 className="font-bold">종이에 고쳐 쓴 뒤 비교하기</h2>
      <label className="my-3 block text-sm"><input type="checkbox" className="mr-2" checked={rewritten} onChange={e=>{setRewritten(e.target.checked);setAnswerOpen(false)}} />학생이 종이에 답을 고쳐 썼습니다</label>
      <button type="button" disabled={!rewritten} onClick={()=>setAnswerOpen(x=>!x)} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-40">{answerOpen?'예시 답안 닫기':'예시 답안 열기'}</button>
      {answerOpen&&<div className="mt-4 rounded bg-amber-50 p-4"><ul className="space-y-2">{current.answers.map(a=><li key={a} className="text-lg">{a}</li>)}</ul><p className="mt-3 text-sm">{current.note}</p></div>}
    </section>
    <section className="rounded border bg-white p-4"><h2 className="font-bold">선생님 관찰 · 임시 메모</h2><label className="mt-3 block text-sm">이번에 확인한 부분 <select className="rounded border p-2" value={observation} onChange={e=>setObservation(e.target.value)}>{['미평가','질문이 묻는 것부터 확인','근거 찾기 지원 필요','근거는 찾음 · 영어 문장화 지원 필요','근거와 문장화 모두 지원 필요','도움 없이 적용 확인'].map(s=><option key={s}>{s}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">교사의 관찰 선택이며 자동 판정이나 학생 성적 기록이 아닙니다.</p></section>
    <div className="flex flex-wrap gap-3"><button type="button" onClick={()=>reset(0)} className="rounded border bg-white px-4 py-3">Mina 지문 다시 시작</button><button type="button" onClick={()=>reset(1)} className="rounded bg-slate-800 px-4 py-3 text-white">새 지문으로 혼자 적용</button></div>
  </div>
}
