# data/wordbooks/

지문 단어장(`/materials/wordbooks`)에 미리 뜻을 채워 넣는 JSON 파일을 이 폴더에 둡니다.
파일 하나 = 지문(버전) 하나의 단어장. AI API 는 호출하지 않습니다 (Claude Code 가 직접 씀).

화면에서는 지문의 🔵 `{{v:단어}}` 를 자동으로 모으고 단어은행 뜻을 채우지만, 단어은행에 없는 단어는 뜻이 빈칸입니다.
새 지문을 만들 때 이 파일도 같이 만들어 저장하면 처음부터 뜻이 다 채워진 단어장이 됩니다.

> 새 지문은 이 폴더가 아니라 지문 파일 안에 바로 넣습니다: 4단계 세트 content 파일의 각 난이도 `"wordbook": [...]`,
> 단독 지문 JSON 의 `"wordbook": [...]` (아래 `words` 와 같은 형식). 저장 스크립트가 단어장도 같이 저장합니다.
> 이 폴더는 **이미 DB 에 있는 지문**에 단어장만 따로 넣을 때 씁니다.

## JSON 형식

```json
{
  "title": "My Family Trip to Hanoi",
  "variant_level": "school",
  "words": [
    { "word": "capital", "surface": "capital", "pos": "명", "meaning": "수도", "sentence": "Hanoi is the capital of Vietnam." },
    { "word": "motorbike", "surface": "motorbikes", "pos": "명", "meaning": "오토바이", "sentence": "There were thousands of motorbikes on the streets." }
  ]
}
```

- 지문 찾기: `passage_id` 가 있으면 그것, 없으면 `title` (+ 4단계 세트면 `variant_level`: school / academy / advanced / prestudy) 이 정확히 같은 지문.
- `word` = 단어장 표제어(원형), `surface` = 지문에 나온 모양(예문에서 굵게), `pos` = 명·동·형·부·전·접 …, `sentence` = 지문 속 문장 그대로.
- 단어 순서 = 지문에 나온 순서, 지문의 🔵 단어와 같은 목록으로.
- 저장: `npm run add-wordbook -- data/wordbooks/파일이름.json` (먼저 `--dry-run` 으로 확인 가능)
- 화면에서 고쳐 저장한 단어장이 이미 있으면 멈춥니다. 바꿔 쓰려면 `--replace` (선생님이 고친 내용이 사라지므로 확인 후에만).
- 저장 표: `passage_wordbooks` (`passage-wordbooks-migration.sql`).
