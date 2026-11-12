# data/passages/

`scripts/add-passage.ts`로 저장할 지문 JSON 파일을 이 폴더에 둡니다.
파일 하나 = 지문 하나 (문제 20개 + 서술형 5개 포함).

## JSON 형식

```json
{
  "title": "지문 제목",
  "level": "중2",
  "topic": "환경",
  "body": "지문 원문 (마크업 없음)",
  "tagged_body": "지문 원문에 {{v:단어}} {{g:구문|설명}} {{t:구문}} 마크업을 섞어 넣은 버전",
  "tags": {
    "vocab": ["단어1", "단어2"],
    "grammar": ["관계대명사", "현재완료"],
    "topic": ["환경", "재활용"]
  },
  "questions": [
    { "type": "mc", "q": "...", "choices": ["...", "...", "...", "...", "..."], "answer": "...", "explanation": "..." },
    { "type": "blank", "q": "...", "answer": "...", "explanation": "..." },
    { "type": "tf", "q": "...", "answer": true, "explanation": "..." },
    { "type": "match", "pairs": [{ "word": "단어", "meaning": "뜻" }] }
  ],
  "essays": [
    { "q": "...", "wordLimit": 80, "sampleAnswer": "...", "rubric": "..." }
  ]
}
```

- `questions`는 mc 11개 + blank 5개 + tf 3개 + match 1개, 총 20개를 한 배열에 순서대로 담습니다
  (blank·tf 대신 전부 객관식이면 mc 19개 + match 1개).
- **순서배열(order) 문제는 만들지 않습니다** (2026-11-12 향미님 요청 — 문제 질이 낮음). 예전에 순서배열이던
  **19번 자리도 객관식(mc)** 으로, 어법(밑줄 친 부분 중 어법상 틀린 것)·어휘(문맥상 낱말 쓰임)·내용 일치·
  주제/제목·지칭 대상 등 **답을 고르는** 문제로 만듭니다. 같은 지문의 다른 mc 와 유형이 겹치지 않게 고릅니다.
  (`check-passage-questions`·`add-passage` 가 order 가 있으면 막습니다. 이미 DB 에 있는 예전 순서배열 문제는 그대로 둡니다.)
- `essays`는 5개.
- 문항 영구 ID(`qid`): 문제·서술형마다 `"qid": "<UUID>"`가 있어야 저장됩니다. 직접 만들지 말고
  JSON을 다 쓴 뒤 `npm run assign-qids -- data/passages/파일이름.json`을 실행하면 없는 곳에만 붙습니다
  (이미 있는 qid는 절대 바뀌지 않음). qid는 문제를 수정·삭제·순서변경해도 그 문제의 사용이력을 이어주는 ID입니다.
  - ⚠️ 이미 DB에 저장된 지문의 파일에는 실행하지 않습니다 (DB 쪽 qid와 달라짐).
- 지문 단어장: `"wordbook": [{ "word", "surface", "pos", "meaning", "sentence" }, …]` 칸에 🔵 단어 전부를 넣으면 저장 때 단어장도 같이 저장됩니다
  (형식: `data/wordbooks/README.md`). 4단계 세트 content 파일은 난이도마다 `wordbook` 이 있어야 검사를 통과합니다.
- 저장: `npm run add-passage -- data/passages/파일이름.json`
- 4단계 세트 content 파일도 같습니다: `npm run assign-qids -- data/passage-sets/파일이름.content.json`
  → `check-passage-questions` → `add-passage-set-questions`
