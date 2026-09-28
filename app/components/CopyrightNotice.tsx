// 단어은행·문제은행 화면의 카피라이트 문구 (문구는 config/copyright.ts).
// 넓은 화면(xl 이상): 버튼 줄 오른쪽 빈 공간에 오른쪽 정렬 → <CopyrightInline />
// 그보다 좁으면: 목록 아래로 내려간다 (폰에서는 가운데 정렬) → <CopyrightBelow />
// 두 개를 같이 넣어 두면 화면 너비에 따라 하나만 보인다.

import { copyrightNotice, type CopyrightTarget } from '@/config/copyright'

export function CopyrightInline({ target }: { target: CopyrightTarget }) {
  return <span className="ml-auto hidden text-right text-xs text-gray-400 xl:block">{copyrightNotice(target)}</span>
}

export function CopyrightBelow({ target }: { target: CopyrightTarget }) {
  return <p className="mt-3 text-center text-xs text-gray-400 sm:text-right xl:hidden">{copyrightNotice(target)}</p>
}
