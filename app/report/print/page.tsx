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

function getCefr(pct: number): { level: string; label: string; labelKo: string } {
  if (pct >= 95) return { level: 'C2', label: 'Mastery',            labelKo: '최상급' }
  if (pct >= 85) return { level: 'C1', label: 'Advanced',           labelKo: '상급' }
  if (pct >= 75) return { level: 'B2', label: 'Upper Intermediate', labelKo: '중상급' }
  if (pct >= 60) return { level: 'B1', label: 'Lower Intermediate', labelKo: '중급' }
  if (pct >= 45) return { level: 'A2', label: 'Elementary',         labelKo: '기초' }
  return            { level: 'A1', label: 'Beginner',            labelKo: '입문' }
}

function toBullets(text: string): string[] {
  return text
    .split(/\n|•|-/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// 점수 백분율 바 컬러
function barColor(pct: number) {
  if (pct >= 80) return '#4a7c59'
  if (pct >= 60) return '#c9a227'
  return '#b94040'
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

  const strengthBullets  = toBullets(strengths)
  const commentBullets   = toBullets(comment)
  const nextStepsBullets = toBullets(nextSteps)

  // 상세분석 fallback — typeScores 기반 자동 문구
  const autoVocab   = typeScores['어휘'] != null
    ? `어휘 영역 ${typeScores['어휘']}점을 달성하였습니다. 다양한 어휘를 문맥 속에서 정확히 이해하고 활용하는 능력이 우수하며, 지속적인 독서와 어휘 확장 학습을 통해 더욱 발전할 수 있습니다.`
    : null
  const autoGrammar = typeScores['어법'] != null
    ? `어법 영역 ${typeScores['어법']}점을 달성하였습니다. 핵심 문법 포인트에 대한 이해도가 높으며, 심화 어법 문제에 대한 꾸준한 연습을 통해 완성도를 높여가기 바랍니다.`
    : null
  const autoReading = (typeScores['독해'] != null || typeScores['지문요약'] != null)
    ? `독해 ${typeScores['독해'] ?? '-'}점, 지문요약 ${typeScores['지문요약'] ?? '-'}점을 달성하였습니다. 지문 흐름을 파악하고 핵심 내용을 요약하는 능력을 꾸준히 키워나가기 바랍니다.`
    : null

  const displayVocab   = vocabAnalysis   || autoVocab   || '어휘 데이터를 기반으로 한 분석 정보가 없습니다.'
  const displayGrammar = grammarAnalysis || autoGrammar || '어법 데이터를 기반으로 한 분석 정보가 없습니다.'
  const displayReading = readingAnalysis || autoReading || '독해 데이터를 기반으로 한 분석 정보가 없습니다.'

  // 영역별 점수 표시 (최대 100점 기준으로 바 표시)
  const typeEntries = Object.entries(typeScores)

  // 색상 팔레트 (아이보리/크림/골드 베이스)
  const IVORY   = '#f9f6ef'
  const CREAM   = '#f2ede0'
  const GOLD    = '#c9a227'
  const DARKBLUE = '#1a2744'
  const TEXT    = '#3a3226'
  const SUBTEXT = '#7a6e5a'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Nanum+Pen+Script&display=swap');
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
          style={{ background: DARKBLUE }}
          className="rounded px-6 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          🖨️ 인쇄
        </button>
        <button
          onClick={() => downloadPdf(studentName || '학생성취도보고서')}
          style={{ background: GOLD }}
          className="rounded px-6 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          📄 PDF 저장
        </button>
      </div>

      {/* ── A4 Page ── */}
      <div
        className="print-area page mx-auto shadow-lg"
        style={{
          width: '210mm',
          minHeight: '297mm',
          background: IVORY,
          display: 'flex',
          flexDirection: 'column',
        }}
      >

        {/* ══ HEADER ══ */}
        <div style={{ background: DARKBLUE, padding: '0 0 0 0' }}>
          {/* 상단 골드 라인 */}
          <div style={{ height: 3, background: GOLD }} />
          <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

            {/* 로고 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42, height: 42,
                border: `2px solid ${GOLD}`,
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>🏫</div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: GOLD, fontWeight: 700 }}>BOSTON&apos;S ENGLISH</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>보스턴영어학원</div>
                <div style={{ fontSize: 8.5, color: '#a0b4d6', marginTop: 1, letterSpacing: 0.5 }}>A HIGHER STANDARD · A BRIGHTER YOU</div>
              </div>
            </div>

            {/* 타이틀 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', letterSpacing: 3 }}>학생 성취도 보고서</div>
              <div style={{ fontSize: 9.5, color: '#a0b4d6', letterSpacing: 1.5, marginTop: 2 }}>Student Achievement Report</div>
            </div>

            {/* 점수 + 등급 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 8.5, color: '#a0b4d6', letterSpacing: 0.5 }}>발행일: {today}</div>
                <div style={{ fontSize: 8, color: '#7a9bcc', marginTop: 1 }}>기밀 문서 · CONFIDENTIAL</div>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.08)',
                border: `1.5px solid ${GOLD}`,
                borderRadius: 8,
                padding: '6px 14px',
                textAlign: 'center',
                minWidth: 80,
              }}>
                <div style={{ fontSize: 8, color: '#a0b4d6', letterSpacing: 1, marginBottom: 2 }}>SCORE</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                  {score}
                  <span style={{ fontSize: 10, fontWeight: 400, color: '#a0b4d6' }}>/{maxScore}</span>
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 900, marginTop: 2,
                  color: pct >= 85 ? '#4ade80' : pct >= 65 ? GOLD : '#f87171',
                }}>{grade}</div>
              </div>
            </div>

          </div>
          <div style={{ height: 1, background: 'rgba(201,162,39,0.3)' }} />
        </div>

        {/* ══ 학생 정보 스트립 ══ */}
        <div style={{ background: CREAM, borderBottom: `1px solid #ddd5c0`, padding: '9px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {[
              { label: '학생명', value: studentName || '-' },
              { label: '학년', value: studentGrade || '-' },
              { label: '시험 / 기간', value: examTitle || '-' },
              { label: '시험일', value: examDate || '-' },
              { label: '담당 교사', value: teacher || '-' },
            ].map((item, i, arr) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                paddingRight: i < arr.length - 1 ? 20 : 0,
                marginRight: i < arr.length - 1 ? 20 : 0,
                borderRight: i < arr.length - 1 ? '1px solid #c5b99a' : 'none',
              }}>
                <span style={{ fontSize: 9, color: SUBTEXT, fontWeight: 600, letterSpacing: 0.3 }}>{item.label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: DARKBLUE }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ══ 메인 콘텐츠 ══ */}
        <div style={{ flex: 1, padding: '14px 24px', display: 'flex', flexDirection: 'column', gap: 11 }}>

          {/* ── 상단 3단 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>

            {/* 성취도 요약 */}
            <div style={{
              background: DARKBLUE,
              borderRadius: 8,
              padding: '14px',
              display: 'flex', flexDirection: 'column', gap: 8,
              minHeight: 155,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>현재 성취도 요약</div>
                <div style={{ fontSize: 8.5, color: '#a0b4d6', marginTop: 1, letterSpacing: 0.5 }}>Achievement Summary</div>
              </div>
              {/* CEFR 배지 */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  background: GOLD, color: '#fff',
                  borderRadius: 4, padding: '3px 10px',
                  fontSize: 12, fontWeight: 900, letterSpacing: 0.5,
                }}>
                  {cefr.level}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{cefr.label}</div>
                  <div style={{ fontSize: 8.5, color: '#a0b4d6' }}>{cefr.labelKo}</div>
                </div>
              </div>
              {/* 점수 바 */}
              <div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: GOLD, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 8.5, color: '#a0b4d6', marginTop: 3 }}>{pct}% 달성</div>
              </div>
              <p style={{ fontSize: 9.5, color: '#c0d0e8', lineHeight: 1.65, margin: 0, flex: 1 }}>
                현재 <strong style={{ color: '#fff' }}>{cefr.level} ({cefr.label})</strong> 수준으로,
                꾸준한 학습을 통해 다음 단계를 목표로 합니다.
              </p>
            </div>

            {/* 강점 */}
            <div style={{
              background: '#fff',
              border: `1px solid #ddd5c0`,
              borderRadius: 8, padding: '14px',
              minHeight: 155,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 13, color: GOLD }}>★</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: DARKBLUE }}>강점</span>
              </div>
              <div style={{ fontSize: 8.5, color: SUBTEXT, marginBottom: 8, letterSpacing: 0.3 }}>Strengths</div>
              <div style={{ height: 1.5, background: GOLD, marginBottom: 10, opacity: 0.5 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {strengthBullets.length > 0
                  ? strengthBullets.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, fontSize: 9.5, color: TEXT, alignItems: 'flex-start' }}>
                        <span style={{ color: GOLD, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✦</span>
                        <span style={{ lineHeight: 1.6 }}>{s}</span>
                      </div>
                    ))
                  : <span style={{ fontSize: 9.5, color: '#b0a898' }}>강점 내용이 없습니다.</span>
                }
              </div>
            </div>

            {/* 보완 필요 */}
            <div style={{
              background: '#fff',
              border: `1px solid #ddd5c0`,
              borderRadius: 8, padding: '14px',
              minHeight: 155,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 13, color: '#b94040' }}>▸</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: DARKBLUE }}>보완이 필요한 부분</span>
              </div>
              <div style={{ fontSize: 8.5, color: SUBTEXT, marginBottom: 8, letterSpacing: 0.3 }}>Priority Issues</div>
              <div style={{ height: 1.5, background: '#b94040', marginBottom: 10, opacity: 0.4 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {commentBullets.length > 0
                  ? commentBullets.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, fontSize: 9.5, color: TEXT, alignItems: 'flex-start' }}>
                        <span style={{ color: '#b94040', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>▸</span>
                        <span style={{ lineHeight: 1.6 }}>{s}</span>
                      </div>
                    ))
                  : <span style={{ fontSize: 9.5, color: '#b0a898' }}>보완 내용이 없습니다.</span>
                }
              </div>
            </div>

          </div>

          {/* ── 영역별 점수 바 (있을 때만) ── */}
          {typeEntries.length > 0 && (
            <div style={{
              background: '#fff', border: `1px solid #ddd5c0`,
              borderRadius: 8, overflow: 'hidden',
            }}>
              <div style={{ background: CREAM, borderBottom: `1px solid #ddd5c0`, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 14, background: GOLD, borderRadius: 2 }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: DARKBLUE }}>영역별 점수</span>
                <span style={{ fontSize: 8.5, color: SUBTEXT }}>Score by Category</span>
              </div>
              <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: `repeat(${Math.min(typeEntries.length, 5)}, 1fr)`, gap: 8 }}>
                {typeEntries.map(([k, v]) => {
                  const barPct = Math.min(100, v)
                  return (
                    <div key={k}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 9, color: SUBTEXT, fontWeight: 600 }}>{k}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: DARKBLUE }}>{v}점</span>
                      </div>
                      <div style={{ height: 5, background: '#ede8dd', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: barColor(barPct), borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── 상세 분석 ── */}
          <div style={{ border: `1px solid #ddd5c0`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: CREAM, borderBottom: `1px solid #ddd5c0`, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 14, background: GOLD, borderRadius: 2 }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: DARKBLUE }}>상세 분석</span>
              <span style={{ fontSize: 8.5, color: SUBTEXT }}>Detailed Analysis</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#fff' }}>
              {[
                { num: '01', title: '어휘력', sub: 'Vocabulary', text: displayVocab },
                { num: '02', title: '이해 / 어법', sub: 'Grammar & Comprehension', text: displayGrammar },
                { num: '03', title: '독해 & 요약', sub: 'Reading & Summary', text: displayReading },
              ].map((col, i) => (
                <div key={i} style={{
                  padding: '12px 14px',
                  borderRight: i < 2 ? `1px solid #ede8dd` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: '#ddd5c0', lineHeight: 1 }}>{col.num}</span>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: DARKBLUE }}>{col.title}</div>
                      <div style={{ fontSize: 8.5, color: SUBTEXT }}>{col.sub}</div>
                    </div>
                  </div>
                  <div style={{ height: 1, background: '#ede8dd', marginBottom: 8 }} />
                  <p style={{ fontSize: 9.5, color: TEXT, lineHeight: 1.75, margin: 0 }}>{col.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── 학습 계획 + 교사 코멘트 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>

            {/* 학습 계획 */}
            <div style={{ border: `1px solid #ddd5c0`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: CREAM, borderBottom: `1px solid #ddd5c0`, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 14, background: GOLD, borderRadius: 2 }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: DARKBLUE }}>다음 학습 계획</span>
                <span style={{ fontSize: 8.5, color: SUBTEXT }}>Study Plan</span>
              </div>
              <div style={{ padding: '10px 14px', background: '#fff' }}>
                {nextStepsBullets.length > 0
                  ? nextStepsBullets.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, fontSize: 9.5, color: TEXT, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 13, height: 13, border: `1.5px solid ${GOLD}`,
                          borderRadius: 2, flexShrink: 0, marginTop: 1,
                        }} />
                        <span style={{ lineHeight: 1.6 }}>{s}</span>
                      </div>
                    ))
                  : <span style={{ fontSize: 9.5, color: '#b0a898' }}>학습 계획이 없습니다.</span>
                }
              </div>
            </div>

            {/* 교사 코멘트 */}
            <div style={{ border: `1px solid #ddd5c0`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: CREAM, borderBottom: `1px solid #ddd5c0`, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 14, background: GOLD, borderRadius: 2 }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: DARKBLUE }}>담당 교사 코멘트</span>
                <span style={{ fontSize: 8.5, color: SUBTEXT }}>Teacher&apos;s Comment</span>
              </div>
              <div style={{ padding: '10px 14px', background: '#fff', display: 'flex', justifyContent: 'space-between', gap: 12, minHeight: 90 }}>
                <div style={{ flex: 1, fontSize: 9.5, color: TEXT, lineHeight: 1.75 }}>
                  {comment
                    ? comment
                    : <span style={{ color: '#b0a898' }}>교사 코멘트가 없습니다.</span>
                  }
                </div>
                {/* 서명 */}
                <div style={{
                  textAlign: 'center', minWidth: 72,
                  borderLeft: `1px solid #ede8dd`, paddingLeft: 12,
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center',
                }}>
                  <div style={{
                    fontSize: 22, color: DARKBLUE,
                    fontFamily: "'Nanum Pen Script', cursive",
                    marginBottom: 4, letterSpacing: 1,
                    lineHeight: 1.1,
                  }}>{teacher}</div>
                  <div style={{ height: 1, width: 60, background: DARKBLUE, marginBottom: 4, opacity: 0.3 }} />
                  <div style={{ fontSize: 8.5, color: SUBTEXT }}>담당 교사</div>
                </div>
              </div>
            </div>

          </div>

        </div>{/* end main content */}

        {/* ══ FOOTER ══ */}
        <div style={{ borderTop: `1px solid #ddd5c0`, padding: '7px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: CREAM }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 2, height: 12, background: GOLD, borderRadius: 1 }} />
            <span style={{ fontSize: 8.5, color: SUBTEXT }}>보스턴영어학원 · BOSTON&apos;S ENGLISH</span>
            <span style={{ fontSize: 8.5, color: '#c0b9a8' }}>|</span>
            <span style={{ fontSize: 8.5, color: SUBTEXT }}>담당: {teacher}</span>
          </div>
          <span style={{ fontSize: 8.5, color: SUBTEXT }}>
            발행일: {today} &nbsp;·&nbsp; <strong style={{ color: DARKBLUE }}>기밀 문서</strong>
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
