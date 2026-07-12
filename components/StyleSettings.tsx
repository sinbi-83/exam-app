"use client";

import { STYLE_AXES, STYLE_PRESETS, StyleParams } from "@/config/stylePresets";

interface StyleSettingsProps {
  values: StyleParams;
  activePresetName: string | null;
  onChangeAxis: (axisKey: keyof StyleParams, value: number) => void;
  onSelectPreset: (presetName: string) => void;
}

export default function StyleSettings({
  values,
  activePresetName,
  onChangeAxis,
  onSelectPreset,
}: StyleSettingsProps) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h2 className="text-lg font-semibold mb-3">2. 출제 스타일 설정</h2>

      <div className="flex flex-wrap gap-2 mb-5">
        {STYLE_PRESETS.map((preset) => {
          const isActive = preset.name === activePresetName;
          return (
            <button
              key={preset.name}
              type="button"
              onClick={() => onSelectPreset(preset.name)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                isActive
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {STYLE_AXES.map((axis) => (
          <div key={axis.key}>
            <div className="flex justify-between text-sm mb-1">
              <label htmlFor={axis.key} className="font-medium text-gray-700">
                {axis.label}
              </label>
              <span className="text-gray-500">
                {values[axis.key]}
                {axis.unit ?? ""}
              </span>
            </div>
            <input
              id={axis.key}
              type="range"
              min={axis.min}
              max={axis.max}
              value={values[axis.key]}
              onChange={(e) => onChangeAxis(axis.key, Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
