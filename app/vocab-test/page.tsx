'use client'

import { useState } from 'react'

interface WordPair {
  en: string
  ko: string
}

export default function VocabTestPage() {
  const [title, setTitle] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [words, setWords] = useState<WordPair[]>([])
  const [parsed, setParsed] = useState(false)
  const [testType, setTestType] = useState<'en_to_ko' | 'ko_to_en' | 'mixed'>('mixed')

  function parseWords() {
    const lines = rawInput.split('\n').filter((l) => l.trim())
    const pairs: WordPair[] = []
    for (const line of lines) {
      // 지원 형식: "apple - 사과", "apple: 사과", "apple 사과", "apple = 사과"
      const match = line.match(/^(.+?)[\s\-:=]+(.+)$/)
      if (match) {
        const en = match[1].trim()
        const ko = match[2].trim()
        if (en && ko) pairs.push({ en, ko })
      }
    }
    setWords(pairs)
    setParsed(true)
  }

  function removeWord(i: number) {
    setWords((prev) => prev.filter((_, idx) => idx !== i))
  }

  function openPrint() {
    const data = encodeURIComponent(JSON.stringify(words))
    const t = encodeURIComponent(title || '단어 테스트')
    const type = encodeURIComponent(testType)
    window.open(`/vocab-test/print?title=${t}&type=${type}&data=${data}`, '_blank')
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">단어 테스트 생성</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 왼쪽: 입력 */}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">테스트 제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 중1 Unit 3 단어 테스트"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              단어 입력
            </label>
            <p className="mb-2 text-xs text-gray-400">
              한 줄에 하나씩 입력하세요. (영어 - 한국어, 영어: 한국어, 영어 한국어)
            </p>
            <textarea
              value={rawInput}
              onChange={(e) => { setRawInput(e.target.value); setParsed(false) }}
              rows={12}
              placeholder={"apple - 사과\nbeautiful - 아름다운\nrun - 달리다\nschool: 학교\nhappy 행복한"}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <button
            onClick={parseWords}
            disabled={!rawInput.trim()}
            className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            단어 파싱
          </button>
        </div>

        {/* 오른쪽: 미리보기 + 설정 */}
        <div className="space-y-4">
          {parsed && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">문제 유형</label>
                <div className="flex gap-2">
                  {[
                    { value: 'en_to_ko', label: '영→한' },
                    { value: 'ko_to_en', label: '한→영' },
                    { value: 'mixed', label: '혼합' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTestType(opt.value as typeof testType)}
                      className={`rounded-full border px-4 py-1 text-sm ${
                        testType === opt.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">파싱된 단어 ({words.length}개)</p>
                </div>
                {words.length === 0 ? (
                  <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-500">
                    파싱된 단어가 없습니다. 형식을 확인해주세요.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded border border-gray-200 bg-gray-50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-100 text-xs text-gray-500">
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">영어</th>
                          <th className="px-3 py-2 text-left">한국어</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {words.map((w, i) => (
                          <tr key={i} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-1.5 text-gray-800">{w.en}</td>
                            <td className="px-3 py-1.5 text-gray-600">{w.ko}</td>
                            <td className="px-3 py-1.5">
                              <button
                                onClick={() => removeWord(i)}
                                className="text-xs text-gray-400 hover:text-red-500"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <button
                onClick={openPrint}
                disabled={words.length === 0}
                className="w-full rounded bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
              >
                🖨️ 테스트지 출력
              </button>
            </>
          )}

          {!parsed && (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
              단어를 입력하고 파싱 버튼을 누르세요
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
