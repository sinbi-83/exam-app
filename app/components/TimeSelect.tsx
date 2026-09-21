'use client'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface TimeSelectProps {
  value: string // 'HH:MM' 또는 빈 문자열
  onChange: (value: string) => void
}

export default function TimeSelect({ value, onChange }: TimeSelectProps) {
  const [hour, minute] = value ? value.split(':') : ['', '']

  function handleHourChange(h: string) {
    onChange(h ? `${h}:${minute || '00'}` : '')
  }

  function handleMinuteChange(m: string) {
    onChange(hour ? `${hour}:${m}` : (m ? `00:${m}` : ''))
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={hour}
        onChange={(e) => handleHourChange(e.target.value)}
        className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-gray-400">:</span>
      <select
        value={minute}
        onChange={(e) => handleMinuteChange(e.target.value)}
        className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
      >
        <option value="">--</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )
}
