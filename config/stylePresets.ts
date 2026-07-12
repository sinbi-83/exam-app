// 7개 출제 성향 축과, 출판사별 프리셋 값을 한 곳에서 관리합니다.
// 프리셋을 추가/수정할 때는 STYLE_PRESETS 배열만 건드리면 됩니다.

export type StyleAxisKey =
  | "textbookFocus"
  | "sentenceStructure"
  | "examPattern"
  | "vocabWeight"
  | "inferenceDifficulty"
  | "writtenAnswerRatio"
  | "distractorComplexity";

export interface StyleAxisDef {
  key: StyleAxisKey;
  label: string;
  min: number;
  max: number; // writtenAnswerRatio만 0-100(%), 나머지는 0-10
  unit?: string;
}

export const STYLE_AXES: StyleAxisDef[] = [
  { key: "textbookFocus", label: "교과서 밀착도", min: 0, max: 10 },
  { key: "sentenceStructure", label: "문장구조 분석 비중", min: 0, max: 10 },
  { key: "examPattern", label: "시험 유형성 / 기출 유사성", min: 0, max: 10 },
  { key: "vocabWeight", label: "어휘 비중", min: 0, max: 10 },
  { key: "inferenceDifficulty", label: "추론 난이도", min: 0, max: 10 },
  { key: "writtenAnswerRatio", label: "서술형 비중", min: 0, max: 100, unit: "%" },
  { key: "distractorComplexity", label: "오답 함정 정교함", min: 0, max: 10 },
];

export type StyleParams = Record<StyleAxisKey, number>;

export interface StylePresetDef {
  name: string; // 버튼에 표시될 이름
  values: StyleParams;
}

// 순서: textbookFocus, sentenceStructure, examPattern, vocabWeight,
//       inferenceDifficulty, writtenAnswerRatio, distractorComplexity
function makePreset(
  name: string,
  values: [number, number, number, number, number, number, number]
): StylePresetDef {
  const [
    textbookFocus,
    sentenceStructure,
    examPattern,
    vocabWeight,
    inferenceDifficulty,
    writtenAnswerRatio,
    distractorComplexity,
  ] = values;
  return {
    name,
    values: {
      textbookFocus,
      sentenceStructure,
      examPattern,
      vocabWeight,
      inferenceDifficulty,
      writtenAnswerRatio,
      distractorComplexity,
    },
  };
}

export const STYLE_PRESETS: StylePresetDef[] = [
  makePreset("YBM", [8, 3, 3, 6, 2, 10, 2]),
  makePreset("자이스토리", [4, 4, 9, 5, 7, 5, 8]),
  makePreset("능률", [6, 3, 4, 8, 3, 10, 3]),
  makePreset("천재", [9, 5, 5, 5, 3, 30, 3]),
  makePreset("천일문", [2, 10, 3, 4, 5, 20, 2]),
  makePreset("메가스터디", [3, 5, 8, 6, 9, 5, 9]),
  makePreset("쎄듀", [3, 8, 7, 6, 8, 10, 8]),
];

export function getPresetByName(name: string): StylePresetDef | undefined {
  return STYLE_PRESETS.find((p) => p.name === name);
}
