"use client";

import { useState } from "react";
import Link from "next/link";
import PassageInput from "@/components/PassageInput";
import StyleSettings from "@/components/StyleSettings";
import QuestionConfig from "@/components/QuestionConfig";
import ResultView from "@/components/ResultView";
import { STYLE_PRESETS, StyleParams, getPresetByName } from "@/config/stylePresets";
import { GradeLevel, QuestionConfigItem } from "@/config/questionTypes";
import { ExamGenerationResult, GenerateResponse } from "@/types/exam";
import { saveExamSheet } from "@/lib/examSheets";

const DEFAULT_STYLE: StyleParams = STYLE_PRESETS[0].values; // YBM을 기본값으로 시작

export default function HomePage() {
  const [passage, setPassage] = useState("");
  const [styleParams, setStyleParams] = useState<StyleParams>(DEFAULT_STYLE);
  const [activePresetName, setActivePresetName] = useState<string | null>(
    STYLE_PRESETS[0].name
  );
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>("중2");
  const [questionConfig, setQuestionConfig] = useState<QuestionConfigItem[]>([
    { type: "blank", count: 3 },
  ]);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ExamGenerationResult | null>(null);

  const handleSelectPreset = (name: string) => {
    const preset = getPresetByName(name);
    if (!preset) return;
    setStyleParams(preset.values);
    setActivePresetName(name);
  };

  const handleChangeAxis = (axisKey: keyof StyleParams, value: number) => {
    setStyleParams((prev) => ({ ...prev, [axisKey]: value }));
    setActivePresetName(null); // 직접 조정하면 프리셋 선택 해제 (수동 조정 중임을 표시)
  };

  const handleToggleType = (typeKey: string, checked: boolean) => {
    setQuestionConfig((prev) => {
      if (checked) {
        if (prev.some((c) => c.type === typeKey)) return prev;
        return [...prev, { type: typeKey as QuestionConfigItem["type"], count: 3 }];
      }
      return prev.filter((c) => c.type !== typeKey);
    });
  };

  const handleChangeCount = (typeKey: string, count: number) => {
    setQuestionConfig((prev) =>
      prev.map((c) => (c.type === typeKey ? { ...c, count } : c))
    );
  };

  const handleGenerate = async () => {
    setErrorMessage(null);
    setResult(null);

    if (!passage.trim()) {
      setErrorMessage("지문을 먼저 입력해주세요.");
      return;
    }
    if (questionConfig.length === 0) {
      setErrorMessage("문제 유형을 하나 이상 선택해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passage,
          stylePresetName: activePresetName,
          styleParams,
          gradeLevel,
          questionConfig,
        }),
      });

      const json: GenerateResponse = await res.json();

      if (!json.ok) {
        setErrorMessage(json.message);
        return;
      }

      setResult(json.data);

      // 생성 성공 시 자동으로 히스토리에 저장 (실패해도 화면 결과는 유지)
      await saveExamSheet({
        stylePresetName: activePresetName,
        styleParams,
        gradeLevel,
        questionConfig,
        result: json.data,
      });
    } catch (err) {
      setErrorMessage("네트워크 오류가 발생했습니다. 연결을 확인하고 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="space-y-5">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-bold">AI 영어 시험문제 출제 프로그램</h1>
        <Link
          href="/history"
          className="text-sm text-indigo-600 underline underline-offset-2"
        >
          지난 문제지 보기
        </Link>
      </div>

      <PassageInput value={passage} onChange={setPassage} />

      <StyleSettings
        values={styleParams}
        activePresetName={activePresetName}
        onChangeAxis={handleChangeAxis}
        onSelectPreset={handleSelectPreset}
      />

      <QuestionConfig
        config={questionConfig}
        gradeLevel={gradeLevel}
        onToggleType={handleToggleType}
        onChangeCount={handleChangeCount}
        onChangeGrade={setGradeLevel}
      />

      <div className="no-print">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "문제 생성 중..." : "문제 생성"}
        </button>
        {errorMessage && (
          <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
        )}
      </div>

      {result && <ResultView result={result} />}
    </main>
  );
}
