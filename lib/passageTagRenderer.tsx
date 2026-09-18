// tagged_body 마크업을 색상이 있는 화면 요소로 바꿔주는 렌더러.
//   🔵 어휘: {{v:단어}}        → 파란색 밑줄
//   🔴 어법: {{g:구문|설명}}   → 빨간색, 마우스 올리면 설명(title)
//   💚 주제: {{t:구문}}        → 초록색

import React from 'react'

const TAG_REGEX = /\{\{(v|g|t):([^|}]+)(?:\|([^}]+))?\}\}/g

export function TaggedBody({ text }: { text: string }) {
  if (!text) return null

  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0
  const regex = new RegExp(TAG_REGEX)
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const [full, kind, content, extra] = match

    if (match.index > lastIndex) {
      nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    }

    if (kind === 'v') {
      nodes.push(
        <span
          key={key++}
          className="text-blue-600 underline decoration-blue-400 decoration-2 underline-offset-2 font-medium"
        >
          {content}
        </span>
      )
    } else if (kind === 'g') {
      nodes.push(
        <span
          key={key++}
          className="text-red-600 font-medium cursor-help border-b border-dotted border-red-400"
          title={extra ?? ''}
        >
          {content}
        </span>
      )
    } else if (kind === 't') {
      nodes.push(
        <span key={key++} className="text-green-600 font-medium">
          {content}
        </span>
      )
    }

    lastIndex = match.index + full.length
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  }

  return <>{nodes}</>
}

// 태그 마크업을 제거하고 순수 텍스트만 남긴다 (인쇄 시 "태그 숨김" 옵션용).
export function stripTagMarkup(text: string): string {
  if (!text) return ''
  return text.replace(/\{\{(v|g|t):([^|}]+)(?:\|[^}]+)?\}\}/g, '$2')
}
