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
    { "type": "order", "items": ["문장A", "문장B", "문장C"], "answer": ["문장B", "문장A", "문장C"] },
    { "type": "match", "pairs": [{ "word": "단어", "meaning": "뜻" }] }
  ],
  "essays": [
    { "q": "...", "wordLimit": 80, "sampleAnswer": "...", "rubric": "..." }
  ]
}
```

- `questions`는 보통 mc 10개 + blank 5개 + tf 3개 + order 1개 + match 1개, 총 20개를 한 배열에 순서대로 담습니다.
- `essays`는 5개.
- 저장: `npm run add-passage -- data/passages/파일이름.json`
