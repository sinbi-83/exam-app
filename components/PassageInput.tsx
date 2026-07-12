"use client";

interface PassageInputProps {
  value: string;
  onChange: (value: string) => void;
}

// 오늘은 텍스트 입력만 구현. 나중에 이미지 업로드(OCR)를 추가할 때는
// 이 컴포넌트 옆에 <ImagePassageInput /> 같은 별도 컴포넌트를 만들어
// 탭이나 버튼으로 전환하는 방식으로 확장하면 됩니다.
export default function PassageInput({ value, onChange }: PassageInputProps) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">1. 지문 입력</h2>
        <span className="text-sm text-gray-500">{value.length}자</span>
      </div>
      <textarea
        className="w-full h-56 border border-gray-300 rounded-lg p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
        placeholder="여기에 영어 지문을 붙여넣으세요..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </section>
  );
}
