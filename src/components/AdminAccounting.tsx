import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Check,
  Download,
  Edit3,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteInstructorSession,
  getTimeMs,
  saveInstructorSession,
} from '../services/firestoreService';
import {
  Artisan,
  Course,
  Enrollment,
  InstructorAttendanceStatus,
  InstructorSessionRecord,
} from '../types/atelier';
import { calculateTimeRangeDisplay, formatDateWithWeekday } from '../utils/scheduleUtils';

interface AdminAccountingProps {
  courses: Course[];
  artisans: Artisan[];
  enrollments: Enrollment[];
  instructorSessions: InstructorSessionRecord[];
  initialArtisanFilter?: string;
  onSessionsRefresh: () => Promise<void>;
}

const ATTENDANCE_LABELS: Record<InstructorAttendanceStatus, string> = {
  present: '出席授課',
  leave: '導師請假',
  substitute: '安排代課',
  cancelled: '該堂停課',
};

function getEnrollmentMonthKey(e: Enrollment): string {
  if (e.paymentStatus === 'refunded' && e.refundedAt && /^\d{4}-\d{2}/.test(e.refundedAt)) {
    return e.refundedAt.slice(0, 7);
  }
  const ms = getTimeMs(e.createdAt);
  if (ms > 0) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const AdminAccounting: React.FC<AdminAccountingProps> = ({
  courses,
  artisans,
  enrollments,
  instructorSessions,
  initialArtisanFilter = 'all',
  onSessionsRefresh,
}) => {
  const defaultMonth = useMemo(() => {
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (instructorSessions.some((s) => s.monthKey === cur)) return cur;
    if (instructorSessions[0]?.monthKey) return instructorSessions[0].monthKey;
    return cur;
  }, [instructorSessions]);

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [artisanFilter, setArtisanFilter] = useState<string>(initialArtisanFilter);
  const [attendanceFilter, setAttendanceFilter] = useState<string>('all');
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');

  const [editingRecord, setEditingRecord] = useState<Partial<InstructorSessionRecord> | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  useEffect(() => {
    if (initialArtisanFilter && initialArtisanFilter !== 'all') {
      setArtisanFilter(initialArtisanFilter);
    }
  }, [initialArtisanFilter]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    instructorSessions.forEach((s) => s.monthKey && set.add(s.monthKey));
    courses.forEach((c) => (c.sessionDates || []).forEach((d) => d.length >= 7 && set.add(d.slice(0, 7))));
    enrollments.forEach((e) => set.add(getEnrollmentMonthKey(e)));
    return Array.from(set).sort().reverse();
  }, [instructorSessions, courses, enrollments]);

  const monthEnrollments = useMemo(
    () =>
      enrollments.filter((e) =>
        selectedMonth === 'all' ? true : getEnrollmentMonthKey(e) === selectedMonth
      ),
    [enrollments, selectedMonth]
  );

  const monthSessions = useMemo(
    () =>
      instructorSessions.filter((s) => {
        if (selectedMonth !== 'all' && s.monthKey !== selectedMonth) return false;
        if (artisanFilter !== 'all' && s.artisanName !== artisanFilter) return false;
        if (attendanceFilter !== 'all' && s.attendanceStatus !== attendanceFilter) return false;
        return true;
      }),
    [instructorSessions, selectedMonth, artisanFilter, attendanceFilter]
  );

  // Financial Summary (HKD)
  const paidEnrollments = monthEnrollments.filter((e) => e.paymentStatus === 'paid');
  const refundedEnrollments = monthEnrollments.filter((e) => e.paymentStatus === 'refunded');
  const totalIncomeHKD = paidEnrollments.reduce((acc, e) => acc + (e.totalAmount || 0), 0);
  const totalRefundHKD = refundedEnrollments.reduce(
    (acc, e) => acc + (e.refundAmount ?? e.totalAmount ?? 0),
    0
  );

  const allMonthSessionsForTotals = useMemo(
    () =>
      instructorSessions.filter((s) =>
        selectedMonth === 'all' ? true : s.monthKey === selectedMonth
      ),
    [instructorSessions, selectedMonth]
  );

  const totalInstructorPayHKD = allMonthSessionsForTotals
    .filter((s) => s.attendanceStatus !== 'cancelled')
    .reduce((acc, s) => acc + (s.payAmount || 0), 0);
  const paidInstructorPayHKD = allMonthSessionsForTotals
    .filter((s) => s.attendanceStatus !== 'cancelled' && s.payStatus === 'paid')
    .reduce((acc, s) => acc + (s.payAmount || 0), 0);
  const unpaidInstructorPayHKD = totalInstructorPayHKD - paidInstructorPayHKD;

  const netMonthlyBalance = totalIncomeHKD - totalRefundHKD - totalInstructorPayHKD;

  // Per-instructor monthly rollup
  const instructorRollup = useMemo(() => {
    const names = Array.from(
      new Set([
        ...artisans.map((a) => a.name),
        ...allMonthSessionsForTotals.map((s) => s.artisanName),
      ].filter(Boolean))
    );
    return names.map((name) => {
      const rows = allMonthSessionsForTotals.filter((s) => s.artisanName === name);
      const presentCount = rows.filter((r) => r.attendanceStatus === 'present').length;
      const leaveCount = rows.filter((r) => r.attendanceStatus === 'leave').length;
      const subCount = rows.filter((r) => r.attendanceStatus === 'substitute').length;
      const totalPay = rows
        .filter((r) => r.attendanceStatus !== 'cancelled')
        .reduce((sum, r) => sum + (r.payAmount || 0), 0);
      const paidPay = rows
        .filter((r) => r.attendanceStatus !== 'cancelled' && r.payStatus === 'paid')
        .reduce((sum, r) => sum + (r.payAmount || 0), 0);
      const linkedCoursesCount = courses.filter((c) => c.artisanName === name).length;
      return {
        name,
        totalClasses: rows.length,
        presentCount,
        leaveCount,
        subCount,
        totalPay,
        paidPay,
        unpaidPay: totalPay - paidPay,
        linkedCoursesCount,
      };
    });
  }, [artisans, allMonthSessionsForTotals, courses]);

  // Course revenue lookup in selected month
  const courseFinanceMap = useMemo(() => {
    const map: Record<string, { income: number; refund: number; students: number }> = {};
    monthEnrollments.forEach((e) => {
      if (!map[e.courseId]) {
        map[e.courseId] = { income: 0, refund: 0, students: 0 };
      }
      if (e.paymentStatus === 'paid') {
        map[e.courseId].income += e.totalAmount || 0;
        map[e.courseId].students += e.seats || 0;
      } else if (e.paymentStatus === 'refunded') {
        map[e.courseId].refund += e.refundAmount ?? e.totalAmount ?? 0;
      }
    });
    return map;
  }, [monthEnrollments]);

  const handleImportScheduledSessionsForMonth = async () => {
    const targetMonth = selectedMonth === 'all' ? defaultMonth : selectedMonth;
    setImporting(true);
    setImportNotice('');
    try {
      let createdCount = 0;
      for (const c of courses) {
        const dates = c.sessionDates || [];
        for (const d of dates) {
          if (!d.startsWith(targetMonth)) continue;
          const exists = instructorSessions.some(
            (s) => s.courseId === c.id && s.sessionDate === d
          );
          if (exists) continue;
          const artisan = artisans.find(
            (a) => a.id === c.artisanId || a.name === c.artisanName
          );
          const pay =
            c.instructorPayPerSession && c.instructorPayPerSession > 0
              ? c.instructorPayPerSession
              : artisan?.defaultSessionPay || 0;
          await saveInstructorSession({
            artisanId: c.artisanId || artisan?.id || '',
            artisanName: c.artisanName || artisan?.name || '未指定職人',
            courseId: c.id,
            courseTitle: c.title,
            sessionDate: d,
            monthKey: targetMonth,
            startTime: c.startTime || '14:00',
            endTime: c.endTime || '17:00',
            durationText:
              calculateTimeRangeDisplay(c.startTime, c.endTime).fullDisplay || c.duration,
            attendanceStatus: 'present',
            substituteName: '',
            payAmount: pay,
            payStatus: 'unpaid',
            note: '從課程日曆匯入',
          });
          createdCount += 1;
        }
      }
      await onSessionsRefresh();
      setImportNotice(
        createdCount > 0
          ? `已成功從課程開課日曆匯入 ${targetMonth} 共 ${createdCount} 堂課堂記錄！`
          : `${targetMonth} 課程日曆中的所有排定堂次均已存在記錄，無重複匯入。`
      );
    } finally {
      setImporting(false);
    }
  };

  const handleQuickTogglePayStatus = async (rec: InstructorSessionRecord) => {
    await saveInstructorSession({
      ...rec,
      payStatus: rec.payStatus === 'paid' ? 'unpaid' : 'paid',
    });
    await onSessionsRefresh();
  };

  const handleQuickUpdateAttendance = async (
    rec: InstructorSessionRecord,
    nextStatus: InstructorAttendanceStatus
  ) => {
    const nextPay =
      nextStatus === 'leave' || nextStatus === 'cancelled' ? 0 : rec.payAmount;
    await saveInstructorSession({
      ...rec,
      attendanceStatus: nextStatus,
      payAmount: nextPay,
    });
    await onSessionsRefresh();
  };

  const handleExportCsv = () => {
    const labelMonth = selectedMonth === 'all' ? '全部月份' : selectedMonth;
    const rows: string[][] = [
      ['月份', '項目類型', '日期/時間', '課程名稱', '授課職人/學員', '狀態', '代課導師/備註', '收入(HK$)', '退款(HK$)', '職人薪金(HK$)'],
      [
        labelMonth,
        '月結彙總',
        '-',
        '全部課程彙總',
        '-',
        '結算完成',
        `淨結餘 HK$ ${netMonthlyBalance.toLocaleString()}`,
        String(totalIncomeHKD),
        String(totalRefundHKD),
        String(totalInstructorPayHKD),
      ],
    ];

    monthSessions.forEach((s) => {
      rows.push([
        s.monthKey,
        '課堂記錄',
        `${s.sessionDate} ${s.startTime}-${s.endTime}`,
        s.courseTitle,
        s.artisanName,
        `${ATTENDANCE_LABELS[s.attendanceStatus]} / ${s.payStatus === 'paid' ? '已發放' : '待發放'}`,
        s.substituteName ? `代課：${s.substituteName} ${s.note}` : s.note,
        '0',
        '0',
        String(s.attendanceStatus === 'cancelled' ? 0 : s.payAmount),
      ]);
    });

    monthEnrollments
      .filter((e) => e.paymentStatus === 'paid' || e.paymentStatus === 'refunded')
      .forEach((e) => {
        rows.push([
          getEnrollmentMonthKey(e),
          e.paymentStatus === 'refunded' ? '學員退款' : '學員報名收入',
          e.sessionDate,
          e.courseTitle,
          `${e.memberName} (${e.memberPhone})`,
          e.paymentStatus === 'refunded' ? '已退款' : '已收款',
          e.refundReason || e.adminNote || '',
          e.paymentStatus === 'paid' ? String(e.totalAmount) : '0',
          e.paymentStatus === 'refunded' ? String(e.refundAmount ?? e.totalAmount) : '0',
          '0',
        ]);
      });

    const csvContent =
      '\uFEFF' +
      rows
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `會計結算與課堂記錄_${labelMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif text-[#1b1c1c]">會計結算、課堂記錄與導師薪金管理</h2>
          <p className="text-sm text-[#51443d]">
            按月結算課堂報名收入、學員退款、授課職人薪金及出席／請假記錄（全站以港幣 HKD 結算）。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={importing}
            onClick={() => void handleImportScheduledSessionsForMonth()}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg border border-[#e0d8d3] bg-white text-xs font-medium text-[#73594c] hover:bg-[#e8ded8]/50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <CalendarPlus className="w-4 h-4" />
            {importing ? '匯入中...' : '從課程日曆匯入本月課堂'}
          </button>
          <button
            type="button"
            onClick={() => {
              const firstCourse = courses[0];
              const firstArtisan =
                artisans.find((a) => a.name === firstCourse?.artisanName) || artisans[0];
              const fallbackMonth = selectedMonth === 'all' ? defaultMonth : selectedMonth;
              setEditingRecord({
                artisanId: firstArtisan?.id || firstCourse?.artisanId || '',
                artisanName: firstArtisan?.name || firstCourse?.artisanName || '',
                courseId: firstCourse?.id || '',
                courseTitle: firstCourse?.title || '',
                sessionDate: `${fallbackMonth}-01`,
                monthKey: fallbackMonth,
                startTime: firstCourse?.startTime || '14:00',
                endTime: firstCourse?.endTime || '17:00',
                durationText:
                  calculateTimeRangeDisplay(
                    firstCourse?.startTime || '14:00',
                    firstCourse?.endTime || '17:00'
                  ).fullDisplay || '',
                attendanceStatus: 'present',
                substituteName: '',
                payAmount:
                  firstCourse?.instructorPayPerSession ??
                  firstArtisan?.defaultSessionPay ??
                  1000,
                payStatus: 'unpaid',
                note: '',
              });
            }}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            新增課堂／請假／薪金記錄
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg border border-[#e0d8d3] bg-[#fcf9f8] text-xs font-medium text-[#51443d] hover:bg-[#e8ded8]/50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            匯出 CSV 月結表
          </button>
        </div>
      </div>

      {importNotice && (
        <div className="bg-[#e8ded8]/60 border border-[#8c5e43]/40 rounded-lg px-4 py-2.5 text-xs text-[#70472d]">
          {importNotice}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-[#e0d8d3] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[#51443d]">結算月份</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] text-xs text-[#1b1c1c] tabular-nums"
          >
            <option value="all">全部月份累計</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m} 月份結算
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[#51443d]">篩選授課職人</span>
          <select
            value={artisanFilter}
            onChange={(e) => setArtisanFilter(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] text-xs text-[#1b1c1c]"
          >
            <option value="all">全部授課職人</option>
            {Array.from(
              new Set([
                ...artisans.map((a) => a.name),
                ...instructorSessions.map((s) => s.artisanName),
              ].filter(Boolean))
            ).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[#51443d]">篩選導師出勤狀態</span>
          <select
            value={attendanceFilter}
            onChange={(e) => setAttendanceFilter(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] text-xs text-[#1b1c1c]"
          >
            <option value="all">全部出勤／請假狀態</option>
            <option value="present">出席授課</option>
            <option value="leave">導師請假</option>
            <option value="substitute">安排代課</option>
            <option value="cancelled">該堂停課</option>
          </select>
        </label>
      </div>

      {/* 4 Monthly Accounting KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-[#e0d8d3] rounded-lg p-6 shadow-warm space-y-1.5">
          <p className="text-xs text-[#73594c]">課堂已收費總收入</p>
          <p className="text-3xl font-serif text-[#70472d] tabular-nums">
            HK$ {totalIncomeHKD.toLocaleString()}
          </p>
          <p className="text-xs text-[#51443d] tabular-nums">
            共 {paidEnrollments.length} 筆已確認入帳訂單
          </p>
        </div>

        <div className="bg-white border border-[#e0d8d3] rounded-lg p-6 shadow-warm space-y-1.5">
          <p className="text-xs text-[#73594c]">本月退款支出總額</p>
          <p className="text-3xl font-serif text-[#ba1a1a] tabular-nums">
            - HK$ {totalRefundHKD.toLocaleString()}
          </p>
          <p className="text-xs text-[#51443d] tabular-nums">
            共 {refundedEnrollments.length} 筆退款紀錄
          </p>
        </div>

        <div className="bg-white border border-[#e0d8d3] rounded-lg p-6 shadow-warm space-y-1.5">
          <p className="text-xs text-[#73594c]">職人課酬薪金總計</p>
          <p className="text-3xl font-serif text-[#1b1c1c] tabular-nums">
            - HK$ {totalInstructorPayHKD.toLocaleString()}
          </p>
          <p className="text-xs text-[#51443d] tabular-nums">
            已發放 HK$ {paidInstructorPayHKD.toLocaleString()} · 待發放 HK${' '}
            {unpaidInstructorPayHKD.toLocaleString()}
          </p>
        </div>

        <div className="bg-[#f6f3f2] border border-[#8c5e43]/40 rounded-lg p-6 shadow-warm space-y-1.5">
          <p className="text-xs text-[#73594c]">本期會計淨結餘（實收 - 退款 - 課酬）</p>
          <p
            className={`text-3xl font-serif tabular-nums ${
              netMonthlyBalance >= 0 ? 'text-[#70472d]' : 'text-[#ba1a1a]'
            }`}
          >
            HK$ {netMonthlyBalance.toLocaleString()}
          </p>
          <p className="text-xs text-[#51443d] tabular-nums">
            統計範圍：{selectedMonth === 'all' ? '全部月份' : `${selectedMonth} 月份`}
          </p>
        </div>
      </div>

      {/* Instructor Salary & Attendance Rollup */}
      <div className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden shadow-warm">
        <div className="px-6 py-4 border-b border-[#e0d8d3] flex items-center justify-between">
          <h3 className="text-base font-serif text-[#1b1c1c]">
            授課職人課酬與出勤統計表（{selectedMonth === 'all' ? '全部月份' : selectedMonth}）
          </h3>
          <span className="text-xs text-[#73594c]">點擊職人列可篩選該導師之課堂明細</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#f6f3f2] text-xs text-[#51443d] border-b border-[#e0d8d3]">
              <tr>
                <th className="px-5 py-3 font-medium">授課職人</th>
                <th className="px-4 py-3 font-medium tabular-nums">關聯課程</th>
                <th className="px-4 py-3 font-medium tabular-nums">登記堂數</th>
                <th className="px-4 py-3 font-medium tabular-nums">出席 / 請假 / 代課</th>
                <th className="px-4 py-3 font-medium tabular-nums">應付課酬 (HK$)</th>
                <th className="px-5 py-3 font-medium tabular-nums">已發放 / 待發放</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0d8d3]">
              {instructorRollup.map((row) => (
                <tr
                  key={row.name}
                  onClick={() =>
                    setArtisanFilter(artisanFilter === row.name ? 'all' : row.name)
                  }
                  className={`cursor-pointer transition-colors ${
                    artisanFilter === row.name ? 'bg-[#e8ded8]/40' : 'hover:bg-[#fcf9f8]'
                  }`}
                >
                  <td className="px-5 py-3.5 font-medium text-[#1b1c1c]">{row.name}</td>
                  <td className="px-4 py-3.5 text-xs text-[#51443d] tabular-nums">
                    {row.linkedCoursesCount} 門課程
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[#1b1c1c] tabular-nums">
                    {row.totalClasses} 堂
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[#51443d] tabular-nums">
                    出席 {row.presentCount} · 請假 {row.leaveCount} · 代課 {row.subCount}
                  </td>
                  <td className="px-4 py-3.5 font-serif text-[#70472d] tabular-nums">
                    HK$ {row.totalPay.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-xs tabular-nums">
                    <span className="text-[#70472d]">已付 HK$ {row.paidPay.toLocaleString()}</span>
                    <span className="mx-1.5 text-[#73594c]">/</span>
                    <span className={row.unpaidPay > 0 ? 'text-[#b0704c] font-medium' : 'text-[#51443d]'}>
                      待付 HK$ {row.unpaidPay.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Every Class Session Record */}
      <div className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden shadow-warm">
        <div className="px-6 py-4 border-b border-[#e0d8d3] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-serif text-[#1b1c1c]">
            每月課堂出席、請假與課酬逐堂記錄（共 {monthSessions.length} 筆）
          </h3>
          <span className="text-xs text-[#73594c]">
            可直接於列上切換「出席 / 請假」與「已發放 / 待發放」
          </span>
        </div>

        {monthSessions.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#51443d] space-y-2">
            <p>目前篩選條件下尚無課堂記錄。</p>
            <p className="text-xs text-[#73594c]">
              您可點擊右上角「從課程日曆匯入本月課堂」自動建立，或點擊「新增課堂／請假／薪金記錄」手動新增。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#f6f3f2] text-xs text-[#51443d] border-b border-[#e0d8d3]">
                <tr>
                  <th className="px-5 py-3 font-medium">上課日期與時段</th>
                  <th className="px-4 py-3 font-medium">課程名稱（當期收支）</th>
                  <th className="px-4 py-3 font-medium">授課職人</th>
                  <th className="px-4 py-3 font-medium">出勤／請假</th>
                  <th className="px-4 py-3 font-medium tabular-nums">本堂課酬 (HK$)</th>
                  <th className="px-4 py-3 font-medium">發放狀態</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0d8d3]">
                {monthSessions.map((rec) => {
                  const courseFin = courseFinanceMap[rec.courseId];
                  return (
                    <tr key={rec.id} className="hover:bg-[#fcf9f8]">
                      <td className="px-5 py-3.5 tabular-nums">
                        <p className="font-medium text-[#1b1c1c]">
                          {formatDateWithWeekday(rec.sessionDate)}
                        </p>
                        <p className="text-xs text-[#73594c]">
                          {rec.durationText || `${rec.startTime}-${rec.endTime}`}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-[#1b1c1c]">{rec.courseTitle}</p>
                        {courseFin ? (
                          <p className="text-[11px] text-[#73594c] tabular-nums">
                            同期報名實收 HK$ {courseFin.income.toLocaleString()}
                            {courseFin.refund > 0
                              ? ` · 退款 HK$ ${courseFin.refund.toLocaleString()}`
                              : ''}
                          </p>
                        ) : (
                          rec.note && (
                            <p className="text-[11px] text-[#73594c] whitespace-pre-line">
                              {rec.note}
                            </p>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#1b1c1c]">
                        <p className="font-medium">{rec.artisanName}</p>
                        {rec.substituteName && (
                          <p className="text-[#b0704c]">代課：{rec.substituteName}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <select
                          value={rec.attendanceStatus}
                          onChange={(e) =>
                            void handleQuickUpdateAttendance(
                              rec,
                              e.target.value as InstructorAttendanceStatus
                            )
                          }
                          className={`h-8 px-2 rounded border text-xs cursor-pointer ${
                            rec.attendanceStatus === 'present'
                              ? 'border-[#e0d8d3] bg-[#fcf9f8] text-[#70472d]'
                              : rec.attendanceStatus === 'leave'
                              ? 'border-[#ba1a1a]/30 bg-[#ffdad6]/40 text-[#93000a]'
                              : 'border-[#8c5e43]/40 bg-[#e8ded8]/50 text-[#1b1c1c]'
                          }`}
                        >
                          <option value="present">出席授課</option>
                          <option value="leave">導師請假（不支薪）</option>
                          <option value="substitute">安排代課</option>
                          <option value="cancelled">該堂停課</option>
                        </select>
                      </td>
                      <td className="px-4 py-3.5 font-serif text-[#70472d] tabular-nums">
                        HK$ {(rec.attendanceStatus === 'cancelled' ? 0 : rec.payAmount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => void handleQuickTogglePayStatus(rec)}
                          className={`inline-flex items-center gap-1 px-2.5 h-7 rounded border text-xs font-medium cursor-pointer ${
                            rec.payStatus === 'paid'
                              ? 'border-[#8c5e43]/40 bg-[#e8ded8]/60 text-[#70472d]'
                              : 'border-[#e0d8d3] bg-white text-[#b0704c]'
                          }`}
                        >
                          {rec.payStatus === 'paid' && <Check className="w-3 h-3" />}
                          {rec.payStatus === 'paid' ? '已發放' : '待發放'}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-1">
                        <button
                          type="button"
                          onClick={() => setEditingRecord(rec)}
                          className="p-1.5 rounded border border-[#e0d8d3] text-[#73594c] hover:bg-[#f6f3f2] cursor-pointer"
                          title="編輯記錄"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteInstructorSession(rec.id);
                            await onSessionsRefresh();
                          }}
                          className="p-1.5 rounded text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                          title="刪除記錄"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Monthly Student Income & Refund Ledger */}
      <div className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden shadow-warm">
        <div className="px-6 py-4 border-b border-[#e0d8d3]">
          <h3 className="text-base font-serif text-[#1b1c1c]">
            本月學員入帳與退款明細（港幣 HKD）
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#f6f3f2] text-xs text-[#51443d] border-b border-[#e0d8d3]">
              <tr>
                <th className="px-5 py-3 font-medium">訂單編號</th>
                <th className="px-4 py-3 font-medium">學員</th>
                <th className="px-4 py-3 font-medium">課程名稱</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium tabular-nums">入帳收入 (HK$)</th>
                <th className="px-5 py-3 font-medium tabular-nums">退款金額 (HK$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0d8d3]">
              {monthEnrollments.filter(
                (e) => e.paymentStatus === 'paid' || e.paymentStatus === 'refunded'
              ).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-[#73594c]">
                    此月份尚無已入帳或退款之學員訂單紀錄。
                  </td>
                </tr>
              ) : (
                monthEnrollments
                  .filter((e) => e.paymentStatus === 'paid' || e.paymentStatus === 'refunded')
                  .map((e) => (
                    <tr key={e.id} className="hover:bg-[#fcf9f8]">
                      <td className="px-5 py-3 text-xs font-medium text-[#73594c] tabular-nums">
                        {e.enrollmentCode}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#1b1c1c]">
                        {e.memberName} ({e.memberPhone})
                      </td>
                      <td className="px-4 py-3 text-xs text-[#1b1c1c]">{e.courseTitle}</td>
                      <td className="px-4 py-3 text-xs">
                        {e.paymentStatus === 'refunded' ? (
                          <span className="text-[#ba1a1a] font-medium">
                            已退款{e.refundReason ? `（${e.refundReason}）` : ''}
                          </span>
                        ) : (
                          <span className="text-[#70472d]">已確認收款</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-serif text-[#70472d] tabular-nums">
                        {e.paymentStatus === 'paid'
                          ? `HK$ ${e.totalAmount.toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs font-serif text-[#ba1a1a] tabular-nums">
                        {e.paymentStatus === 'refunded'
                          ? `- HK$ ${(e.refundAmount ?? e.totalAmount).toLocaleString()}`
                          : '—'}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Instructor Session Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#e0d8d3] rounded-lg max-w-xl w-full max-h-[90vh] flex flex-col shadow-warm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0d8d3]">
              <h3 className="text-lg font-serif text-[#1b1c1c]">
                {editingRecord.id ? '編輯課堂與導師薪金記錄' : '新增課堂與導師薪金記錄'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5 text-[#51443d]" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[#51443d]">對應體驗課程 *</span>
                  <select
                    value={editingRecord.courseId || ''}
                    onChange={(e) => {
                      const c = courses.find((x) => x.id === e.target.value);
                      if (c) {
                        const art = artisans.find(
                          (a) => a.id === c.artisanId || a.name === c.artisanName
                        );
                        setEditingRecord({
                          ...editingRecord,
                          courseId: c.id,
                          courseTitle: c.title,
                          artisanId: c.artisanId || art?.id || '',
                          artisanName: c.artisanName || art?.name || editingRecord.artisanName || '',
                          startTime: c.startTime || editingRecord.startTime || '14:00',
                          endTime: c.endTime || editingRecord.endTime || '17:00',
                          durationText:
                            calculateTimeRangeDisplay(
                              c.startTime || '14:00',
                              c.endTime || '17:00'
                            ).fullDisplay || c.duration,
                          payAmount:
                            c.instructorPayPerSession ??
                            art?.defaultSessionPay ??
                            editingRecord.payAmount ??
                            0,
                        });
                      } else {
                        setEditingRecord({ ...editingRecord, courseId: '', courseTitle: '' });
                      }
                    }}
                    className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm bg-white"
                  >
                    <option value="">請選擇課程...</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[#51443d]">授課職人導師 *</span>
                  <select
                    value={editingRecord.artisanName || ''}
                    onChange={(e) => {
                      const art = artisans.find((a) => a.name === e.target.value);
                      setEditingRecord({
                        ...editingRecord,
                        artisanId: art?.id || '',
                        artisanName: e.target.value,
                        payAmount:
                          editingRecord.payAmount || art?.defaultSessionPay || 0,
                      });
                    }}
                    className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm bg-white"
                  >
                    <option value="">請選擇授課職人...</option>
                    {artisans.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[#51443d]">上課日期 *</span>
                  <input
                    type="date"
                    value={editingRecord.sessionDate || ''}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        sessionDate: e.target.value,
                        monthKey: e.target.value.slice(0, 7),
                      })
                    }
                    className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-medium text-[#51443d]">開課時間</span>
                    <input
                      type="time"
                      value={editingRecord.startTime || '14:00'}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        const calc = calculateTimeRangeDisplay(
                          nextStart,
                          editingRecord.endTime || '17:00'
                        );
                        setEditingRecord({
                          ...editingRecord,
                          startTime: nextStart,
                          durationText: calc.isValid ? calc.fullDisplay : editingRecord.durationText,
                        });
                      }}
                      className="w-full h-11 px-2.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-medium text-[#51443d]">下課時間</span>
                    <input
                      type="time"
                      value={editingRecord.endTime || '17:00'}
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        const calc = calculateTimeRangeDisplay(
                          editingRecord.startTime || '14:00',
                          nextEnd
                        );
                        setEditingRecord({
                          ...editingRecord,
                          endTime: nextEnd,
                          durationText: calc.isValid ? calc.fullDisplay : editingRecord.durationText,
                        });
                      }}
                      className="w-full h-11 px-2.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums"
                    />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[#51443d]">導師出勤／請假狀態</span>
                  <select
                    value={editingRecord.attendanceStatus || 'present'}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        attendanceStatus: e.target.value as InstructorAttendanceStatus,
                      })
                    }
                    className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm bg-white"
                  >
                    <option value="present">出席授課</option>
                    <option value="leave">導師請假</option>
                    <option value="substitute">安排代課</option>
                    <option value="cancelled">該堂停課</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[#51443d]">
                    代課導師姓名（請假／代課時填寫）
                  </span>
                  <input
                    type="text"
                    value={editingRecord.substituteName || ''}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, substituteName: e.target.value })
                    }
                    placeholder="例如：陳清和（代課）"
                    className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[#51443d]">
                    本堂導師薪金（港幣 HK$） *
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={editingRecord.payAmount ?? 0}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, payAmount: Number(e.target.value) })
                    }
                    className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[#51443d]">薪金發放狀態</span>
                  <select
                    value={editingRecord.payStatus || 'unpaid'}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        payStatus: e.target.value as 'unpaid' | 'paid',
                      })
                    }
                    className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm bg-white"
                  >
                    <option value="unpaid">待發放</option>
                    <option value="paid">已發放</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[#51443d]">課堂備註（課綱進度／請假事由等）</span>
                <textarea
                  rows={2}
                  value={editingRecord.note || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, note: e.target.value })}
                  placeholder="輸入備註事項..."
                  className="w-full p-3 rounded-lg border border-[#e0d8d3] text-sm"
                />
              </label>
            </div>

            <div className="px-6 py-4 border-t border-[#e0d8d3] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingRecord}
                onClick={async () => {
                  if (!editingRecord.sessionDate || !editingRecord.artisanName) return;
                  setSavingRecord(true);
                  try {
                    const calc = calculateTimeRangeDisplay(
                      editingRecord.startTime || '14:00',
                      editingRecord.endTime || '17:00'
                    );
                    await saveInstructorSession({
                      id: editingRecord.id,
                      artisanId: editingRecord.artisanId || '',
                      artisanName: editingRecord.artisanName || '未指定導師',
                      courseId: editingRecord.courseId || '',
                      courseTitle: editingRecord.courseTitle || '自訂課堂',
                      sessionDate: editingRecord.sessionDate,
                      monthKey: editingRecord.sessionDate.slice(0, 7),
                      startTime: editingRecord.startTime || '14:00',
                      endTime: editingRecord.endTime || '17:00',
                      durationText: calc.isValid
                        ? calc.fullDisplay
                        : editingRecord.durationText || '',
                      attendanceStatus: editingRecord.attendanceStatus || 'present',
                      substituteName: editingRecord.substituteName || '',
                      payAmount: Number(editingRecord.payAmount ?? 0),
                      payStatus: editingRecord.payStatus || 'unpaid',
                      note: editingRecord.note || '',
                      createdAt: editingRecord.createdAt,
                    });
                    setEditingRecord(null);
                    await onSessionsRefresh();
                  } finally {
                    setSavingRecord(false);
                  }
                }}
                className="px-6 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                {savingRecord ? '儲存中...' : '儲存課堂記錄'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
