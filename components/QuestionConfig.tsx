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

export default function QuestionConfig({
  config,
  gradeLevel,
  onToggleType,
  onChangeCount,
  onChangeGrade,
}: QuestionConfigProps) {
  const totalCount = config.reduce((sum, c) => sum + c.count, 0);

  const isChecked = (typeKey: string) => config.some((c) => c.type === typeKey);
  const getCount = (typeKey: string) =>
    config.find((c) => c.type === typeKey)?.count ?? 1;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h2 className="text-lg font-semibold mb-3">3. 문제 구성 설정</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">학년</label>
        <select
          value={gradeLevel}
          onChange={(e) => onChangeGrade(e.target.value as GradeLevel)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {GRADE_LEVELS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {QUESTION_TYPES.map((type) => {
          const checked = isChecked(type.key);
          return (
            <div
              key={type.key}
              className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggleType(type.key, e.target.checked)}
                  className="accent-indigo-600"
                />
                {type.label}
              </label>
              {checked && (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={getCount(type.key)}
                  onChange={(e) => onChangeCount(type.key, Number(e.target.value))}
                  className="w-16 border border-gray-300 rounded-md px-2 py-1 text-sm text-center"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-right text-sm font-medium text-gray-700">
        총 문항 수: <span className="text-indigo-600">{totalCount}문항</span>
      </div>
    </section>
  );
}
