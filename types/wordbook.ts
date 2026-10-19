// 지문 단어장 (passage_wordbooks 표, passage-wordbooks-migration.sql). AI API 를 호출하지 않는다.

// 단어장 한 줄
export interface WordbookWord {
  word: string; // 단어장에 보이는 표제어 (단어은행과 맞으면 원형, 예: motorbike)
  surface: string; // 지문에 나온 모양 (예문 굵게 표시용, 예: motorbikes). 직접 추가한 단어는 word 와 같다
  pos: string; // 품사 짧은 이름 (명·동·형 …). 없으면 ''
  meaning: string; // 뜻. 비어 있을 수 있다 (선생님이 채움)
  sentence: string; // 지문 속 예문. 없으면 ''
}

// 뜻이 어디서 왔는지 (화면 표시용, 저장하지 않는다)
export type WordbookMeaningOrigin = "bank" | "none";

export interface WordbookDraftWord extends WordbookWord {
  origin: WordbookMeaningOrigin;
}

export interface PassageWordbookRecord {
  id: string;
  user_id: string;
  passage_id: string;
  words: WordbookWord[];
  created_at: string;
  updated_at: string;
}

// 단어 테스트지 출제 방향
export type WordbookTestDirection = "en_ko" | "ko_en" | "mixed";
