"use client";

import {
  GRADE_LEVELS,
  GradeLevel,
  QUESTION_TYPES,
  QuestionConfigItem,
} from "@/config/questionTypes";

interface QuestionConfigProps {
  config: QuestionConfigItem[];
  gradeLevel: GradeLevel;
  onToggleType: (typeKey: string, checked: boolean) => void;
  onChangeCount: (typeKey: string, count: number) => void;
  onChangeGrade: (grade: GradeLevel) => void;
}

const MC_TYPES = QUESTION_TYPES.filter((t) => !t.isWrittenAnswer);
const WRITTEN_TYPES = QUESTION_TYPES.filter((t) => t.isWrittenAnswer);

export default function QuestionConfig({
  config,
  gradeLevel,
  onToggleType,
  onChangeCount,
  onChangeGrade,
}: QuestionConfigProps) {
  const isChecked = (typeKey: string) => config.some((c) => c.type === typeKey);
  const getCount = (typeKey: string) =>
    config.find((c) => c.type === typeKey)?.count ?? 1;

  const writtenCount = config
    .filter((c) => WRITTEN_TYPES.some((t) => t.key === c.type))
    .reduce((sum, c) => sum + c.count, 0);

  const selectedMcCount = config.filter((c) =>
    MC_TYPES.some((t) => t.key === c.type)
  ).length;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h2 className="text-lg font-semibold mb-3">3. 문제 구성 설정</h2>

      {/* 학년 선택 */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">학년</label>
        <select
          value={gradeLevel}
          onChange={(e) => onChangeGrade(e.target.value as GradeLevel)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {GRADE_LEVELS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {/* 객관식 유형 선택 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">객관식 유형 선택</p>
          <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
            🔒 총 20문항 고정 (AI 자동 배분)
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          포함할 유형에 체크하면 AI가 20문항 안에서 다양하게 배분합니다.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {MC_TYPES.map((type) => {
            const checked = isChecked(type.key);
            return (
              <label
                key={type.key}
                className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                  checked
                    ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggleType(type.key, e.target.checked)}
                  className="accent-indigo-600 shrink-0"
                />
                {type.label}
              </label>
            );
          })}
        </div>
        {selectedMcCount === 0 && (
          <p className="mt-2 text-xs text-amber-600">⚠️ 객관식 유형을 하나 이상 선택해주세요.</p>
        )}
      </div>

      {/* 구분선 */}
      <div className="border-t border-dashed border-gray-200 my-4" />

      {/* 서술형 */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">서술형 (선택)</p>
        {WRITTEN_TYPES.map((type) => {
          const checked = isChecked(type.key);
          return (
            <div
              key={type.key}
              className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2"
            >
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggleType(type.key, e.target.checked)}
                  className="accent-indigo-600"
                />
                {type.label}
              </label>
              {checked && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={getCount(type.key)}
                    onChange={(e) => onChangeCount(type.key, Number(e.target.value))}
                    className="w-16 border border-gray-300 rounded-md px-2 py-1 text-sm text-center"
                  />
                  <span className="text-xs text-gray-400">문항</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 합계 */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-sm">
        <span className="text-gray-500">객관식 <span className="font-semibold text-indigo-600">20문항</span> + 서술형 <span className="font-semibold text-indigo-600">{writtenCount}문항</span></span>
        <span className="font-semibold text-gray-700">총 {20 + writtenCount}문항</span>
      </div>
    </section>
  );
}
