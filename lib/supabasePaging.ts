// Supabase(PostgREST)는 요청 한 번에 최대 1,000행만 돌려준다 (.limit 을 더 크게 줘도 서버 설정이 우선).
// 단어은행처럼 1,000행을 넘는 표는 여러 번 나눠 읽어야 한다. 순서가 흔들리면 줄이 빠지거나 겹치므로
// page() 안의 조회에는 반드시 유일한 정렬(예: .order('id'))을 넣는다.
// 이 파일은 다른 모듈을 런타임 import 하지 않는다 (앱과 scripts/ 에서 그대로 쓰기 위해).

export const SUPABASE_PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

export async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: all, error }
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) return { data: all, error: null }
  }
}

// id 목록을 잘라서 처리할 때 (URL 길이 제한 때문에 .in() 에 한 번에 너무 많이 넣지 않는다)
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
