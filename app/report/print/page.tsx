'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

async function downloadPdf(filename: string) {
  const html2pdf = (await import('html2pdf.js')).default
  const el = document.querySelector('.print-area') as HTMLElement
  if (!el) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    margin: 0,
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  }
  html2pdf().set(options).from(el).save()
}

function getCefr(pct: number): { level: string; label: string } {
  if (pct >= 95) return { level: 'C2', label: 'Mastery' }
  if (pct >= 85) return { level: 'C1', label: 'Advanced' }
  if (pct >= 75) return { level: 'B2', label: 'Upper Intermediate' }
  if (pct >= 60) return { level: 'B1', label: 'Lower Intermediate' }
  if (pct >= 45) return { level: 'A2', label: 'Elementary' }
  return { level: 'A1', label: 'Beginner' }
}

function toBullets(text: string): string[] {
  return text
    .split(/\n|•|-/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function ReportContent() {
  const params = useSearchParams()

  const studentName  = params.get('studentName')  ?? ''
  const studentGrade = params.get('studentGrade') ?? ''
  const examTitle    = params.get('examTitle')    ?? ''
  const examDate     = params.get('examDate')     ?? ''
  const teacher      = params.get('teacher')      ?? 'Jennifer.T'
  const score        = Number(params.get('score')    ?? 0)
  const maxScore     = Number(params.get('maxScore') ?? 100)
  const comment      = params.get('comment')    ?? ''
  const nextSteps    = params.get('nextSteps')  ?? ''
  const strengths    = params.get('strengths')  ?? ''
  const vocabAnalysis    = params.get('vocabAnalysis')    ?? ''
  const grammarAnalysis  = params.get('grammarAnalysis')  ?? ''
  const readingAnalysis  = params.get('readingAnalysis')  ?? ''

  const typeScoresRaw = params.get('typeScores') ?? '{}'
  const typeScores: Record<string, number> = (() => {
    try {
      const raw = JSON.parse(typeScoresRaw)
      return Object.fromEntries(
        Object.entries(raw)
          .filter(([, v]) => v !== '' && !isNaN(Number(v)))
          .map(([k, v]) => [k, Number(v)])
      )
    } catch { return {} }
  })()

  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  const grade =
    pct >= 95 ? 'A+' : pct >= 85 ? 'A' : pct >= 75 ? 'B+' : pct >= 65 ? 'B' : pct >= 55 ? 'C' : 'D'
  const cefr = getCefr(pct)

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const strengthBullets = toBullets(strengths)
  const commentBullets  = toBullets(comment)
  const nextStepsBullets = toBullets(nextSteps)

  // 상세분석 fallback — typeScores 기반 자동 문구
  const autoVocab    = typeScores['어휘']    != null
    ? `어휘 영역 ${typeScores['어휘']}점 달성. 다양한 어휘를 문맥 속에서 정확히 이해하고 활용하는 능력이 우수합니다.`
    : ''
  const autoGrammar  = typeScores['어법']    != null
    ? `어법 영역 ${typeScores['어법']}점 달성. 핵심 문법 포인트에 대한 이해도가 높으며, 지속적인 복습으로 완성도를 높여가세요.`
    : ''
  const autoReading  = typeScores['독해']    != null || typeScores['지문요약'] != null
    ? `독해 ${typeScores['독해'] ?? '-'}점 · 지문요약 ${typeScores['지문요약'] ?? '-'}점. 지문 흐름 파악과 핵심 내용 요약 능력을 꾸준히 키워가세요.`
    : ''

  const displayVocab   = vocabAnalysis   || autoVocab   || '어휘 데이터가 없습니다.'
  const displayGrammar = grammarAnalysis || autoGrammar || '어법 데이터가 없습니다.'
  const displayReading = readingAnalysis || autoReading || '독해 데이터가 없습니다.'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
        * { font-family: 'Noto Sans KR', sans-serif; box-sizing: border-box; }
        @page { size: A4; margin: 0; }
        @media print {
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page { box-shadow: none !important; }
        }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      {/* 인쇄 버튼 */}
      <div className="no-print mb-4 flex justify-center gap-3 pt-6">
        <button
          onClick={() => window.print()}
          className="rounded bg-blue-800 px-6 py-2 text-sm font-medium text-white hover:bg-blue-900"
        >
          🖨️ 인쇄
        </button>
        <button
          onClick={() => downloadPdf(studentName || '학생성취도보고서')}
          className="rounded bg-gray-700 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          📄 PDF 저장
        </button>
      </div>

      {/* A4 Page */}
      <div
        className="print-area page mx-auto bg-white shadow-lg"
        style={{ width: '210mm', minHeight: '297mm', display: 'flex', flexDirection: 'column' }}
      >
        {/* ── HEADER ── */}
        <div style={{ background: '#1a2744', color: '#fff', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

            {/* 로고 영역 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '160px' }}>
              <div style={{
                width: 44, height: 44, background: '#2a3d6e', borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, flexShrink: 0
              }}>🏫</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#a0b4d6' }}>BOSTON&apos;S ENGLISH</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>보스턴영어학원</div>
                <div style={{ fontSize: 9, color: '#7a9bcc', marginTop: 2 }}>A HIGHER STANDARD · A BRIGHTER YOU</div>
              </div>
            </div>

            {/* 가운데 타이틀 */}
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2, color: '#fff' }}>학생 성취도 보고서</div>
              <div style={{ fontSize: 10, color: '#a0b4d6', marginTop: 2, letterSpacing: 1 }}>Student Achievement Report</div>
              <div style={{ fontSize: 10, color: '#7a9bcc', marginTop: 1 }}>보스턴영어학원</div>
            </div>

            {/* 우측: 발행일 + 점수 */}
            <div style={{ textAlign: 'right', minWidth: '160px' }}>
              <div style={{ fontSize: 10, color: '#a0b4d6', marginBottom: 6 }}>
                <div>발행일: {today}</div>
                <div style={{ fontSize: 9, color: '#7a9bcc', marginTop: 2 }}>MORE THAN ENGLISH · A BRIGHTER YOU</div>
              </div>
              {/* 점수 박스 */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10,
                background: '#243358', border: '1px solid #3a5080', borderRadius: 8,
                padding: '6px 14px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#a0b4d6', letterSpacing: 1 }}>최종 점수</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                    {score}<span style={{ fontSize: 11, fontWeight: 400, color: '#7a9bcc' }}>/{maxScore}</span>
                  </div>
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 900,
                  color: pct >= 85 ? '#4ade80' : pct >= 65 ? '#facc15' : '#f87171',
                  borderLeft: '1px solid #3a5080', paddingLeft: 10
                }}>{grade}</div>
              </div>
            </div>

          </div>
        </div>

        {/* ── 학생 정보 스트립 ── */}
        <div style={{ background: '#f0f4f9', borderBottom: '1px solid #d4dce8', padding: '8px 20px' }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {[
              { label: '이름', value: studentName || '-' },
              { label: '학년', value: studentGrade || '-' },
              { label: '기간', value: examTitle || '-' },
              { label: '담당 교사', value: teacher },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                paddingRight: 20, marginRight: 20,
                borderRight: i < 3 ? '1px solid #c5d0e0' : 'none'
              }}>
                <span style={{ fontSize: 10, color: '#7a8fa6', fontWeight: 500 }}>{item.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1a2744' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 메인 콘텐츠 ── */}
        <div style={{ flex: 1, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── 3단 상단 섹션 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>

            {/* 현재 성취도 목표 */}
            <div style={{ background: '#1a2744', color: '#fff', borderRadius: 8, padding: '14px 14px', minHeight: 160 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>현재 성취도 목표</div>
              <div style={{ fontSize: 9, color: '#a0b4d6', marginBottom: 10, letterSpacing: 0.5 }}>Current Achievement Summary</div>
              {/* CEFR 배지 */}
              <div style={{
                display: 'inline-block', background: '#c9a227', color: '#fff',
                borderRadius: 4, padding: '3px 10px', fontSize: 11, fontWeight: 700, marginBottom: 10
              }}>
                CEFR: {cefr.level} ({cefr.label})
              </div>
              <div style={{ fontSize: 10, color: '#c0d0e8', lineHeight: 1.6 }}>
                현재 학생은 <strong style={{ color: '#fff' }}>{cefr.level} ({cefr.label})</strong> 수준으로,
                일상적인 주제의 영어 지문을 이해하고 핵심 내용을 파악하는 능력을 갖추고 있습니다.
                꾸준한 학습을 통해 다음 단계를 목표로 합니다.
              </div>
            </div>

            {/* 강점 */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 14px', minHeight: 160 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>📊</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1a2744' }}>강점</span>
              </div>
              <div style={{ borderBottom: '2px solid #1a2744', marginBottom: 10 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {strengthBullets.length > 0
                  ? strengthBullets.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, color: '#334155' }}>
                        <span style={{ color: '#c9a227', fontWeight: 700, flexShrink: 0 }}>★</span>
                        <span style={{ lineHeight: 1.5 }}>{s}</span>
                      </div>
                    ))
                  : <span style={{ fontSize: 10, color: '#94a3b8' }}>강점 내용이 없습니다.</span>
                }
              </div>
            </div>

            {/* 보완이 필요한 부분 */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 14px', minHeight: 160 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 14 }}>📌</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1a2744' }}>보완이 필요한 부분</span>
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 8, letterSpacing: 0.4 }}>Priority Issues</div>
              <div style={{ borderBottom: '2px solid #1a2744', marginBottom: 10 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {commentBullets.length > 0
                  ? commentBullets.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, color: '#334155' }}>
                        <span style={{ color: '#e05252', fontWeight: 700, flexShrink: 0 }}>▸</span>
                        <span style={{ lineHeight: 1.5 }}>{s}</span>
                      </div>
                    ))
                  : <span style={{ fontSize: 10, color: '#94a3b8' }}>보완 내용이 없습니다.</span>
                }
              </div>
            </div>

          </div>

          {/* ── 상세 분석 ── */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: '#1a2744', color: '#fff', padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              상세 분석 <span style={{ fontWeight: 400, fontSize: 9, color: '#a0b4d6', marginLeft: 4 }}>Detailed Analysis</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#fff' }}>
              {[
                { num: '01', title: '어휘력', sub: 'Vocabulary', text: displayVocab },
                { num: '02', title: '이해', sub: 'Grammar', text: displayGrammar },
                { num: '03', title: '독해 & 요약', sub: 'Reading & Summary', text: displayReading },
              ].map((col, i) => (
                <div key={i} style={{
                  padding: '12px 14px',
                  borderRight: i < 2 ? '1px solid #e2e8f0' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: '#dbe5f4', lineHeight: 1 }}>{col.num}</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1a2744' }}>{col.title}</div>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{col.sub}</div>
                    </div>
                  </div>
                  <div style={{ height: 1, background: '#e2e8f0', marginBottom: 8 }} />
                  <p style={{ fontSize: 10, color: '#475569', lineHeight: 1.7, margin: 0 }}>{col.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── 학습계획 + 교사코멘트 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>

            {/* 학습 계획 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#1a2744', color: '#fff', padding: '7px 14px', fontSize: 11, fontWeight: 700 }}>
                학습 계획 제안 <span style={{ fontWeight: 400, fontSize: 9, color: '#a0b4d6' }}>/ 학습 가이드</span>
              </div>
              <div style={{ padding: '10px 14px', background: '#fff' }}>
                <div style={{ fontSize: 10, color: '#1a2744', fontWeight: 700, marginBottom: 8 }}>다음 학습 계획 제안</div>
                {nextStepsBullets.length > 0
                  ? nextStepsBullets.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6, fontSize: 10, color: '#334155' }}>
                        <div style={{
                          width: 13, height: 13, border: '1.5px solid #1a2744', borderRadius: 2,
                          flexShrink: 0, marginTop: 1
                        }} />
                        <span style={{ lineHeight: 1.5 }}>{s}</span>
                      </div>
                    ))
                  : <span style={{ fontSize: 10, color: '#94a3b8' }}>학습 계획이 없습니다.</span>
                }
              </div>
            </div>

            {/* 교사 코멘트 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#1a2744', color: '#fff', padding: '7px 14px', fontSize: 11, fontWeight: 700 }}>
                담당 교사 코멘트 <span style={{ fontWeight: 400, fontSize: 9, color: '#a0b4d6' }}>Teacher Comment</span>
              </div>
              <div style={{ padding: '10px 14px', background: '#fff', display: 'flex', justifyContent: 'space-between', gap: 10, minHeight: 100 }}>
                <div style={{ flex: 1, fontSize: 10, color: '#334155', lineHeight: 1.7 }}>
                  {comment || nextSteps
                    ? (comment || nextSteps)
                    : <span style={{ color: '#94a3b8' }}>교사 코멘트가 없습니다.</span>
                  }
                </div>
                {/* 서명 */}
                <div style={{ textAlign: 'center', minWidth: 70, borderLeft: '1px solid #e2e8f0', paddingLeft: 10, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div style={{ fontSize: 18, color: '#1a2744', fontFamily: 'cursive', marginBottom: 4, letterSpacing: 1 }}>{teacher}</div>
                  <div style={{ height: 1, width: 60, background: '#1a2744', marginBottom: 4 }} />
                  <div style={{ fontSize: 9, color: '#7a8fa6' }}>담당 교사</div>
                </div>
              </div>
            </div>

          </div>

        </div>{/* end main content */}

        {/* ── FOOTER ── */}
        <div style={{ background: '#f0f4f9', borderTop: '1px solid #d4dce8', padding: '7px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#7a8fa6' }}>
            보스턴영어학원 | 담당 교사: {teacher}
          </span>
          <span style={{ fontSize: 9, color: '#7a8fa6' }}>
            발행일: {today} &nbsp;|&nbsp; <strong>기밀 문서</strong>
          </span>
        </div>

      </div>{/* end page */}
    </>
  )
}

export default function ReportPrintPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-gray-400">로딩 중…</div>}>
      <ReportContent />
    </Suspense>
  )
}
