export interface TimeRangeResult {
  minutes: number;
  durationLabel: string;
  fullDisplay: string;
  isValid: boolean;
}

export function calculateTimeRangeDisplay(
  startTime?: string,
  endTime?: string
): TimeRangeResult {
  if (!startTime || !endTime) {
    return { minutes: 0, durationLabel: '', fullDisplay: '', isValid: false };
  }
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (
    Number.isNaN(sh) ||
    Number.isNaN(sm) ||
    Number.isNaN(eh) ||
    Number.isNaN(em)
  ) {
    return { minutes: 0, durationLabel: '', fullDisplay: '', isValid: false };
  }

  const startTotal = sh * 60 + sm;
  const endTotal = eh * 60 + em;
  const diff = endTotal - startTotal;

  if (diff <= 0) {
    return {
      minutes: 0,
      durationLabel: '',
      fullDisplay: `${startTime}-${endTime} (請確認結束時間晚於開始時間)`,
      isValid: false,
    };
  }

  const hours = Math.floor(diff / 60);
  const mins = diff % 60;

  let durationLabel = '';
  if (hours > 0 && mins > 0) {
    durationLabel = `${hours} 小時 ${mins}分鐘`;
  } else if (hours > 0) {
    durationLabel = `${hours} 小時`;
  } else {
    durationLabel = `${mins}分鐘`;
  }

  return {
    minutes: diff,
    durationLabel,
    fullDisplay: `${startTime}-${endTime} (${durationLabel})`,
    isValid: true,
  };
}

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

export function formatDateWithWeekday(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = WEEKDAY_ZH[dt.getDay()] ?? '';
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}(${wd})`;
}

export function buildScheduleText(params: {
  sessionDates?: string[];
  totalSessions?: number;
  startTime?: string;
  endTime?: string;
  fallbackText?: string;
}): string {
  const dates = [...(params.sessionDates || [])].filter(Boolean).sort();
  const timeInfo = calculateTimeRangeDisplay(params.startTime, params.endTime);
  const count = params.totalSessions && params.totalSessions > 0 ? params.totalSessions : dates.length || 1;

  if (dates.length === 0) {
    if (timeInfo.isValid) {
      return `共 ${count} 堂 · ${timeInfo.fullDisplay}`;
    }
    return params.fallbackText || '';
  }

  const dateText = dates.map((d) => {
    const [, m, day] = d.split('-');
    return `${Number(m)}/${Number(day)}`;
  }).join('、');

  const parts = [`共 ${count} 堂`, `日期：${dateText}`];
  if (timeInfo.isValid) {
    parts.push(timeInfo.fullDisplay);
  }
  return parts.join(' · ').slice(0, 160);
}
