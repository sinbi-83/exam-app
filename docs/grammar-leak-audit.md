# 어법 문제 정답 노출 검사

- 만든 날: 2026-09-29 · `node scripts/grammar-leak-audit.ts` (읽기 전용, DB 변경 없음)
- 검사한 어법 문항: **193개** (어법 객관식 171 · 서술형 어법고쳐쓰기 22)
- **정답 노출 의심: 4개** (어법 객관식 2 · 서술형 2)
- 보기 오류(정답 없음·중복·부족, 노출과 별개): 0개
- 이미 만든 시험 snapshot 중 어법 객관식 13개 → 노출 의심 13개 (시험 2개). **snapshot 은 바꾸지 않았다** — 새 시험부터 안전장치가 적용된다.

## 원인

예전 AI 어법 객관식은 지문 속 **올바른 표현(= 정답)** 을 `targetText` 로 골라, 코드가 문제 문장을
`밑줄 친 "정답"의 쓰임이 어법상 가장 적절한 것은?` 으로 만들었다 (`app/api/save-question-set/route.ts`).
그래서 문제 문장과 지문의 밑줄 자리에 정답이 그대로 보인다 — 개별 문항 실수가 아니라 **형식 자체의 문제**라 예전 어법 객관식이 전부 걸린다.
서술형 어법고쳐쓰기는 대부분 틀린 문장을 주지만, 일부는 문장에 틀린 곳이 없거나(모범답안과 같음) 지시문이 고칠 답을 알려 준다.

## 유형별 건수

| 유형 | 건수 |
|---|---|
| 밑줄 친 대상이 곧 정답 | 2 |
| 고쳐 쓸 문장에 틀린 곳이 없음 (문장 = 모범답안) | 2 |
| 지시문이 고친 답을 알려 줌 | 2 |

## 유형별 예시

### 밑줄 친 대상이 곧 정답
- 문항 `0f03ab86-44e3-47c2-93e2-a8f44d8ee470`
  - 문제: 밑줄 친 "her"의 쓰임이 어법상 가장 적절한 것은?
  - 보기: they / him / hers / her / she
  - 정답: her

### 고쳐 쓸 문장에 틀린 곳이 없음 (문장 = 모범답안)
- 문항 `2cd3c6cd-f280-4f81-be7f-11ea9dbb58b2`
  - 문제: 다음 문장에는 어법상 틀린 부분이 한 군데 있습니다. 틀린 부분을 찾아 올바르게 고쳐 문장 전체를 다시 쓰시오. "Had people understood this earlier, many relationships might have been saved from unnecessary pain." 위 문장에서 'might have been saved'를 'might be saved'로 바꾼 아래 문장을 고쳐 쓰시오. "Had people understood this earlier, many relationships might be saved from unnecessary pain."
  - 보기: (없음)
  - 정답: Had people understood this earlier, many relationships might have been saved from unnecessary pain.

### 지시문이 고친 답을 알려 줌
- 문항 `2cd3c6cd-f280-4f81-be7f-11ea9dbb58b2`
  - 문제: 다음 문장에는 어법상 틀린 부분이 한 군데 있습니다. 틀린 부분을 찾아 올바르게 고쳐 문장 전체를 다시 쓰시오. "Had people understood this earlier, many relationships might have been saved from unnecessary pain." 위 문장에서 'might have been saved'를 'might be saved'로 바꾼 아래 문장을 고쳐 쓰시오. "Had people understood this earlier, many relationships might be saved from unnecessary pain."
  - 보기: (없음)
  - 정답: Had people understood this earlier, many relationships might have been saved from unnecessary pain.

## 수정안

- `docs/grammar-leak-fix-proposal.csv` — 의심 4개 중 자동 수정안 0개, 나머지는 "수동 수정 필요".
- 어법 객관식 → **(가) 빈칸형**: 원래 문장에서 정답 자리를 빈칸으로 (보기·정답은 그대로). 시험지에서는 같은 지문의 그 자리도 빈칸으로 가려진다.
- **향미 선생님 승인 전까지 DB 에 적용하지 않는다.** 승인할 줄의 첫 칸에 `O` 를 쓴 뒤 `node scripts/apply-grammar-leak-fix.ts docs/grammar-leak-fix-proposal.csv` (미리보기) → `--apply` (백업 후 적용, 승인 O 줄만, 현재 문항이 CSV 와 같을 때만).
- 이미 만든 시험 snapshot 은 수정안을 적용해도 바뀌지 않는다.

## 안전장치 (코드, 데이터 변경 없음)

- 문제은행 목록(세트별 개수)·세트 상세·문항 검색에 **"정답 노출 의심"** 배지.
- 혼합 시험 후보에서 의심 문항 제외 (몇 개 뺐는지 화면에 표시).
- AI 어법 문제 생성: 허용 형식 (가) 빈칸형 · (나) 밑줄 ①~⑤ 중 틀린 것 찾기 두 가지만. 생성 직후 검증에서 걸리면 다시 만들고, 끝까지 걸리는 어법 문항은 버린다.
- 시험지 인쇄: 빈칸형 어법 문항의 정답이 같은 시험지 지문에 그대로 보이지 않게 지문 쪽 그 자리도 빈칸으로 (화면·인쇄만).
- 참고: 문항 검색(`/materials/questions/search`)에는 배지를 넣지 않았다 — 검색 API 가 `type`·`question` 으로 돌려주는데 화면은 `question_type`·`question_text` 를 읽어서 지금 검색 자체가 오류로 끝난다 (예전부터 있던 문제, 이번 범위 밖).
