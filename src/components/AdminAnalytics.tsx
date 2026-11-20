import React, { useMemo } from 'react';
import { BarChart3, Clock, CreditCard, FileText, Users } from 'lucide-react';
import { ContactSubmission, Course, Enrollment, Member } from '../types/atelier';
import { getTimeMs } from '../services/firestoreService';

interface AdminAnalyticsProps {
  courses: Course[];
  members: Member[];
  enrollments: Enrollment[];
  submissions: ContactSubmission[];
}

export const AdminAnalytics: React.FC<AdminAnalyticsProps> = ({
  courses,
  members,
  enrollments,
  submissions,
}) => {
  const stats = useMemo(() => {
    const paidEnrollments = enrollments.filter((e) => e.paymentStatus === 'paid');
    const pendingVerify = enrollments.filter(
      (e) => e.paymentStatus === 'awaiting_verification' || e.paymentStatus === 'pending_payment'
    );
    const totalRevenue = paidEnrollments.reduce((acc, e) => acc + (e.totalAmount || 0), 0);
    const totalSeatsBooked = enrollments
      .filter((e) => e.paymentStatus !== 'cancelled')
      .reduce((acc, e) => acc + (e.seats || 1), 0);
    const openForms = submissions.filter((s) => s.status !== 'resolved').length;

    // Category distribution
    const catMap = new Map<string, { count: number; revenue: number }>();
    enrollments
      .filter((e) => e.paymentStatus !== 'cancelled')
      .forEach((e) => {
        const key = e.courseCategory || '其他工藝';
        const prev = catMap.get(key) || { count: 0, revenue: 0 };
        catMap.set(key, {
          count: prev.count + 1,
          revenue: prev.revenue + (e.paymentStatus === 'paid' ? e.totalAmount : 0),
        });
      });

    // Monthly revenue trend (last 6 months)
    const now = new Date();
    const months: { key: string; label: string; revenue: number; orders: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: `${d.getMonth() + 1}月`,
        revenue: 0,
        orders: 0,
      });
    }

    enrollments.forEach((e) => {
      if (e.paymentStatus === 'cancelled') return;
      const ms = getTimeMs(e.createdAt) || Date.now();
      const d = new Date(ms);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const slot = months.find((m) => m.key === key);
      if (slot) {
        slot.orders += 1;
        if (e.paymentStatus === 'paid') {
          slot.revenue += e.totalAmount || 0;
        }
      }
    });

    const maxMonthRev = Math.max(1, ...months.map((m) => m.revenue));

    return {
      totalRevenue,
      paidCount: paidEnrollments.length,
      pendingCount: pendingVerify.length,
      totalSeatsBooked,
      openForms,
      categories: Array.from(catMap.entries()).map(([name, val]) => ({ name, ...val })),
      months,
      maxMonthRev,
    };
  }, [enrollments, submissions]);

  const paymentBreakdown = [
    {
      label: '線上模擬即時付款',
      count: enrollments.filter((e) => e.paymentMethod === 'online_card').length,
    },
    {
      label: '銀行轉帳匯款',
      count: enrollments.filter((e) => e.paymentMethod === 'bank_transfer').length,
    },
  ];
  const totalMethodCount = Math.max(1, paymentBreakdown[0].count + paymentBreakdown[1].count);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-serif text-[#1b1c1c]">工坊營運數據分析儀表板</h2>
        <p className="text-sm text-[#51443d]">
          即時彙整課程報名營收、待核帳筆數、會員成長與各工藝體驗熱度。
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#73594c]">
            <span>已入帳總營收（港幣）</span>
            <CreditCard className="w-4 h-4 text-[#8c5e43]" />
          </div>
          <p className="text-2xl font-serif text-[#1b1c1c] tabular-nums">
            HK$ {stats.totalRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-[#51443d] tabular-nums">
            已確認收款 {stats.paidCount} 筆訂單
          </p>
        </div>

        <div className="bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#73594c]">
            <span>待確認／待匯款</span>
            <Clock className="w-4 h-4 text-[#b0704c]" />
          </div>
          <p className="text-2xl font-serif text-[#b0704c] tabular-nums">
            {stats.pendingCount} 筆
          </p>
          <p className="text-xs text-[#51443d] tabular-nums">
            累積報名 {stats.totalSeatsBooked} 人次
          </p>
        </div>

        <div className="bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#73594c]">
            <span>註冊學員會員</span>
            <Users className="w-4 h-4 text-[#8c5e43]" />
          </div>
          <p className="text-2xl font-serif text-[#1b1c1c] tabular-nums">
            {members.length} 位
          </p>
          <p className="text-xs text-[#51443d] tabular-nums">
            上架課程共 {courses.filter((c) => c.isVisible).length} 門
          </p>
        </div>

        <div className="bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#73594c]">
            <span>待處理預約表單</span>
            <FileText className="w-4 h-4 text-[#8c5e43]" />
          </div>
          <p className="text-2xl font-serif text-[#1b1c1c] tabular-nums">
            {stats.openForms} 件
          </p>
          <p className="text-xs text-[#51443d] tabular-nums">
            累計表單 {submissions.length} 筆
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Monthly Revenue Bar Visualization */}
        <div className="lg:col-span-7 bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-serif text-[#1b1c1c]">近六個月已確認營收趨勢</h3>
              <p className="text-xs text-[#51443d]">依據資料庫即時報名與收款紀錄繪製</p>
            </div>
            <BarChart3 className="w-5 h-5 text-[#8c5e43]" />
          </div>

          <div className="h-56 flex items-end gap-4 pt-6 border-b border-[#e0d8d3] pb-2">
            {stats.months.map((m) => {
              const heightPct = Math.max(6, Math.round((m.revenue / stats.maxMonthRev) * 100));
              return (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-[11px] text-[#73594c] tabular-nums">
                    {m.revenue > 0 ? `HK$${(m.revenue / 1000).toFixed(1)}k` : 'HK$0'}
                  </span>
                  <div className="w-full max-w-[44px] bg-[#f6f3f2] rounded-t-md h-36 flex items-end overflow-hidden border border-[#e0d8d3]">
                    <div
                      className="w-full bg-[#8c5e43] transition-all duration-300"
                      style={{ height: `${m.revenue > 0 ? heightPct : 4}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-[#51443d] tabular-nums">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category & Payment Breakdown */}
        <div className="lg:col-span-5 bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-6">
          <div>
            <h3 className="text-lg font-serif text-[#1b1c1c]">工藝分類報名佔比</h3>
            <p className="text-xs text-[#51443d]">各工藝門類累積報名筆數與已入帳金額</p>
          </div>

          {stats.categories.length === 0 ? (
            <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-6 text-center text-xs text-[#51443d]">
              尚無課程報名紀錄，當學員完成第一筆報名後將顯示分佈圖表。
            </div>
          ) : (
            <div className="space-y-4">
              {stats.categories.map((cat) => {
                const maxCat = Math.max(1, ...stats.categories.map((c) => c.count));
                const pct = Math.round((cat.count / maxCat) * 100);
                return (
                  <div key={cat.name} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#1b1c1c]">{cat.name}</span>
                      <span className="text-[#51443d] tabular-nums">
                        {cat.count} 筆 · HK$ {cat.revenue.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[#e8ded8] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#b0704c]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-4 border-t border-[#e0d8d3] space-y-3">
            <h4 className="text-sm font-medium text-[#1b1c1c]">雙軌繳費方式比例</h4>
            {paymentBreakdown.map((item) => {
              const pct = Math.round((item.count / totalMethodCount) * 100);
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs text-[#51443d]">
                    <span>{item.label}</span>
                    <span className="tabular-nums">
                      {item.count} 筆 ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#f6f3f2] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#73594c]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Course Capacity Table */}
      <div className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e0d8d3]">
          <h3 className="text-lg font-serif text-[#1b1c1c]">各體驗課程招生率一覽</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#f6f3f2] text-xs text-[#51443d] border-b border-[#e0d8d3]">
              <tr>
                <th className="px-6 py-3 font-medium">課程名稱</th>
                <th className="px-4 py-3 font-medium">工藝類別</th>
                <th className="px-4 py-3 font-medium text-right">單價 (HK$)</th>
                <th className="px-4 py-3 font-medium text-right">已報名／名額</th>
                <th className="px-6 py-3 font-medium">前台狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0d8d3]">
              {courses.map((c) => {
                const coursePaidSeats = enrollments
                  .filter((e) => e.courseId === c.id && e.paymentStatus !== 'cancelled')
                  .reduce((sum, e) => sum + (e.seats || 1), c.enrolledCount);
                return (
                  <tr key={c.id} className="hover:bg-[#fcf9f8]">
                    <td className="px-6 py-3.5 font-medium text-[#1b1c1c]">{c.title}</td>
                    <td className="px-4 py-3.5 text-[#51443d]">{c.category}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[#70472d]">
                      HK$ {c.price.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-[#51443d]">
                      {coursePaidSeats} / {c.maxSeats}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-[#73594c]">
                      {c.isVisible ? '公開顯示中' : '已隱藏'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
