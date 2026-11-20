import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatDateWithWeekday } from '../utils/scheduleUtils';

interface CalendarMultiDatePickerProps {
  totalSessions: number;
  selectedDates: string[];
  onTotalSessionsChange: (count: number) => void;
  onDatesChange: (dates: string[]) => void;
}

const WEEKDAY_HEADERS = ['日', '一', '二', '三', '四', '五', '六'];

export const CalendarMultiDatePicker: React.FC<CalendarMultiDatePickerProps> = ({
  totalSessions,
  selectedDates,
  onTotalSessionsChange,
  onDatesChange,
}) => {
  const initialDate = useMemo(() => {
    const first = selectedDates[0];
    if (first && /^\d{4}-\d{2}-\d{2}$/.test(first)) {
      const [y, m] = first.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()); // 0-indexed
  const [limitHint, setLimitHint] = useState('');

  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }, []);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const toggleDate = (iso: string) => {
    setLimitHint('');
    if (selectedDates.includes(iso)) {
      onDatesChange(selectedDates.filter((d) => d !== iso));
      return;
    }
    if (selectedDates.length >= totalSessions) {
      setLimitHint(`已達設定總堂數（${totalSessions} 堂），請先取消已選日期或增加總堂數。`);
      return;
    }
    onDatesChange([...selectedDates, iso].sort());
  };

  const remainingToPick = Math.max(0, totalSessions - selectedDates.length);

  return (
    <div className="bg-[#fcf9f8] border border-[#e0d8d3] rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[#51443d]">課程總堂數 *</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={totalSessions}
              onChange={(e) => {
                const next = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                setLimitHint('');
                onTotalSessionsChange(next);
              }}
              className="w-24 h-10 px-3 rounded-lg bg-white border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
            />
            <span className="text-xs text-[#51443d]">堂（於下方月曆選滿 {totalSessions} 個上課日子）</span>
          </div>
        </label>

        <div
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border tabular-nums ${
            selectedDates.length === totalSessions
              ? 'bg-[#e8ded8]/60 border-[#8c5e43]/40 text-[#70472d]'
              : 'bg-white border-[#e0d8d3] text-[#73594c]'
          }`}
        >
          {selectedDates.length === totalSessions
            ? `已選齊 ${selectedDates.length} / ${totalSessions} 堂上課日子`
            : remainingToPick > 0
            ? `已選 ${selectedDates.length} / ${totalSessions} 堂（尚需選 ${remainingToPick} 天）`
            : `已選 ${selectedDates.length} 天（超出設定堂數 ${totalSessions} 堂）`}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border border-[#e0d8d3] rounded-lg p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goPrevMonth}
            className="w-8 h-8 rounded-lg border border-[#e0d8d3] flex items-center justify-center text-[#51443d] hover:bg-[#f6f3f2] cursor-pointer"
            aria-label="上個月"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-serif font-medium text-[#1b1c1c] tabular-nums flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-[#8c5e43]" />
            {viewYear} 年 {viewMonth + 1} 月
          </span>
          <button
            type="button"
            onClick={goNextMonth}
            className="w-8 h-8 rounded-lg border border-[#e0d8d3] flex items-center justify-center text-[#51443d] hover:bg-[#f6f3f2] cursor-pointer"
            aria-label="下個月"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAY_HEADERS.map((w) => (
            <div key={w} className="text-[11px] font-medium text-[#73594c] py-1">
              {w}
            </div>
          ))}
          {Array.from({ length: firstDayOffset }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-9" />
          ))}
          {Array.from({ length: daysInMonth }, (_, idx) => {
            const day = idx + 1;
            const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(
              day
            ).padStart(2, '0')}`;
            const selectedIdx = selectedDates.indexOf(iso);
            const isSelected = selectedIdx >= 0;
            const isToday = iso === todayIso;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => toggleDate(iso)}
                className={`h-9 rounded-lg text-xs font-medium tabular-nums relative flex items-center justify-center transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#8c5e43] text-white'
                    : isToday
                    ? 'border border-[#8c5e43] text-[#70472d] bg-[#fcf9f8] hover:bg-[#e8ded8]/60'
                    : 'text-[#1b1c1c] hover:bg-[#f6f3f2]'
                }`}
                title={isSelected ? `第 ${selectedIdx + 1} 堂 (${iso}) - 點擊取消` : `選擇 ${iso}`}
              >
                <span>{day}</span>
                {isSelected && (
                  <span className="absolute top-0.5 right-1 text-[9px] leading-none opacity-85">
                    {selectedIdx + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {limitHint && <p className="text-xs text-[#ba1a1a]">{limitHint}</p>}

      {/* Selected Dates Summary List */}
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-[#51443d]">已選上課日期詳細清單（共 {selectedDates.length} 日）</span>
        {selectedDates.length === 0 ? (
          <p className="text-xs text-[#73594c]">尚未於月曆選取任何上課日子。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedDates.map((iso, index) => (
              <span
                key={iso}
                className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-white border border-[#e0d8d3] text-xs text-[#1b1c1c] tabular-nums"
              >
                <span className="text-[#8c5e43] font-medium">第 {index + 1} 堂</span>
                <span>{formatDateWithWeekday(iso)}</span>
                <button
                  type="button"
                  onClick={() => toggleDate(iso)}
                  className="w-4 h-4 rounded hover:bg-[#ffdad6]/60 text-[#73594c] hover:text-[#93000a] flex items-center justify-center cursor-pointer"
                  aria-label={`移除 ${iso}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
