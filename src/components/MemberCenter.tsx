import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, FileText, LogOut, ShieldCheck, Upload, User } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  fetchEnrollmentsByMember,
  fetchNotificationsByMember,
  formatDateTime,
  loginMemberWithPhonePin,
  markNotificationRead,
  registerMemberWithPhonePin,
  submitStudentTransferProof,
  updateOwnMemberProfile,
  uploadMediaAsset,
} from '../services/firestoreService';
import {
  Enrollment,
  Member,
  MemberNotification,
  PaymentStatus,
  SiteContent,
} from '../types/atelier';
import { MediaImage } from './MediaImage';

interface MemberCenterProps {
  activeMember: Member | null;
  siteContent: SiteContent;
  firebaseReady: boolean;
  onMemberLogin: (member: Member) => void;
  onMemberLogout: () => void;
  onNotificationsChange: (unreadCount: number) => void;
  onOpenAdmin: () => void;
}

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending_payment: '待匯款繳費',
  awaiting_verification: '已提交資料・待管理員核對',
  paid: '繳費成功・名額已確認',
  needs_revision: '需重新確認匯款資訊',
  cancelled: '已取消',
  refunded: '已辦理退款',
};

export const MemberCenter: React.FC<MemberCenterProps> = ({
  activeMember,
  siteContent,
  firebaseReady,
  onMemberLogin,
  onMemberLogout,
  onNotificationsChange,
  onOpenAdmin,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState<'enrollments' | 'notifications' | 'profile'>('enrollments');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);

  // Proof submission
  const [proofLastFive, setProofLastFive] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [proofMediaId, setProofMediaId] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofSaving, setProofSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile edit
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [newPin, setNewPin] = useState('');
  const [profileMsg, setProfileMsg] = useState('');

  const loadMemberData = async (member: Member) => {
    setLoadingData(true);
    try {
      const [enrs, notifs] = await Promise.all([
        fetchEnrollmentsByMember(member.id),
        fetchNotificationsByMember(member.id),
      ]);
      setEnrollments(enrs);
      setNotifications(notifs);
      onNotificationsChange(notifs.filter((n) => !n.isRead).length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (activeMember) {
      setProfileName(activeMember.name);
      setProfileEmail(activeMember.email || '');
      void loadMemberData(activeMember);
    } else {
      setEnrollments([]);
      setNotifications([]);
      onNotificationsChange(0);
    }
  }, [activeMember?.id]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (!auth.currentUser) {
        await signInWithPopup(auth, googleProvider);
      }
      const member =
        authTab === 'register'
          ? await registerMemberWithPhonePin({ phone, pin, name, email })
          : await loginMemberWithPhonePin(phone, pin);
      onMemberLogin(member);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUploadProofImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    try {
      const asset = await uploadMediaAsset(file, 'receipt', false, `補件匯款截圖`);
      setProofMediaId(asset.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '圖片上傳失敗');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSaveTransferProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment || !activeMember) return;
    if (!proofLastFive.trim() && !proofMediaId) return;
    setProofSaving(true);
    try {
      await submitStudentTransferProof(
        selectedEnrollment.id,
        proofLastFive,
        proofMediaId || selectedEnrollment.receiptMediaId,
        proofNote
      );
      await loadMemberData(activeMember);
      setSelectedEnrollment(null);
      setProofLastFive('');
      setProofNote('');
      setProofMediaId('');
    } finally {
      setProofSaving(false);
    }
  };

  const handleMarkRead = async (notif: MemberNotification) => {
    if (notif.isRead || !activeMember) return;
    await markNotificationRead(notif.id);
    const updated = notifications.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n));
    setNotifications(updated);
    onNotificationsChange(updated.filter((n) => !n.isRead).length);
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMember) return;
    setProfileMsg('');
    try {
      const updated = await updateOwnMemberProfile(activeMember, {
        name: profileName,
        email: profileEmail,
        newPin: newPin || undefined,
      });
      onMemberLogin(updated);
      setNewPin('');
      setProfileMsg('會員資料已更新並儲存至雲端資料庫');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : '更新失敗');
    }
  };

  if (!activeMember) {
    return (
      <div className="max-w-[1280px] mx-auto px-5 md:px-12 py-14 md:py-20">
        <div className="max-w-lg mx-auto bg-white border border-[#e0d8d3] rounded-lg p-8 shadow-warm space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl md:text-3xl font-serif text-[#1b1c1c]">學員會員中心</h1>
            <p className="text-sm text-[#51443d]">
              使用您的手提電話號碼與 6 位數數字 PIN 碼登入，即可查詢課程報名詳情、補傳匯款資訊與接收同步通知。
            </p>
          </div>

          <div className="flex gap-2 p-1 bg-[#f6f3f2] rounded-lg border border-[#e0d8d3]">
            <button
              type="button"
              onClick={() => {
                setAuthTab('login');
                setAuthError('');
              }}
              className={`flex-1 h-10 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                authTab === 'login' ? 'bg-white text-[#1b1c1c] shadow-sm' : 'text-[#51443d]'
              }`}
            >
              會員登入
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('register');
                setAuthError('');
              }}
              className={`flex-1 h-10 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                authTab === 'register' ? 'bg-white text-[#1b1c1c] shadow-sm' : 'text-[#51443d]'
              }`}
            >
              加入新會員
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authTab === 'register' && (
              <>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#51443d]">學員姓名 *</span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="請輸入您的稱呼或真實姓名"
                    className="w-full h-12 px-4 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#51443d]">聯絡 Email（選填）</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full h-12 px-4 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                  />
                </label>
              </>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#51443d]">手提電話號碼 *</span>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0912345678"
                className="w-full h-12 px-4 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tabular-nums"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#51443d]">6 位數數字 PIN 碼 *</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="輸入 6 位數字"
                className="w-full h-12 px-4 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tracking-[0.25em] tabular-nums"
              />
            </label>

            {authError && <p className="text-xs text-[#ba1a1a]">{authError}</p>}

            {!firebaseReady && (
              <p className="text-xs text-[#73594c] bg-[#f6f3f2] p-3 rounded-lg border border-[#e0d8d3]">
                首次登入將先開啟一次安全瀏覽器驗證，確保您的個人報名與 PIN 碼資料受雲端加密保護。
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full h-12 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer disabled:opacity-50"
            >
              {authLoading ? '驗證處理中...' : authTab === 'login' ? '登入會員中心' : '建立會員帳號'}
            </button>
          </form>

          <div className="pt-4 border-t border-[#e0d8d3] text-center">
            <button
              type="button"
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#73594c] hover:text-[#70472d] cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              工坊管理員？前往後台 CMS 與管理系統
            </button>
          </div>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-[1280px] mx-auto px-5 md:px-12 py-12 md:py-16 space-y-8">
      <div className="bg-white border border-[#e0d8d3] rounded-lg p-6 md:p-8 shadow-warm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-[#73594c]">學員會員中心</p>
          <h1 className="text-2xl md:text-3xl font-serif text-[#1b1c1c]">
            歡迎回來，{activeMember.name}
          </h1>
          <p className="text-xs text-[#51443d] tabular-nums">
            帳號電話：{activeMember.phone}
            {activeMember.email ? ` · ${activeMember.email}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void loadMemberData(activeMember)}
            className="px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs font-medium text-[#73594c] hover:bg-[#e8ded8]/50 cursor-pointer whitespace-nowrap shrink-0"
          >
            同步最新狀態
          </button>
          <button
            type="button"
            onClick={onMemberLogout}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs font-medium text-[#51443d] hover:bg-[#f6f3f2] cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            登出
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('enrollments')}
          className={`inline-flex items-center gap-2 px-5 h-10 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            tab === 'enrollments'
              ? 'bg-[#8c5e43] text-white'
              : 'bg-white border border-[#e0d8d3] text-[#73594c] hover:bg-[#e8ded8]/50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          報名詳細資料 ({enrollments.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`inline-flex items-center gap-2 px-5 h-10 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            tab === 'notifications'
              ? 'bg-[#8c5e43] text-white'
              : 'bg-white border border-[#e0d8d3] text-[#73594c] hover:bg-[#e8ded8]/50'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          工坊通知訊息 {unreadCount > 0 ? `(${unreadCount} 未讀)` : ''}
        </button>
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`inline-flex items-center gap-2 px-5 h-10 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            tab === 'profile'
              ? 'bg-[#8c5e43] text-white'
              : 'bg-white border border-[#e0d8d3] text-[#73594c] hover:bg-[#e8ded8]/50'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          個人資料與 PIN 碼
        </button>
      </div>

      {loadingData ? (
        <div className="bg-white border border-[#e0d8d3] rounded-lg p-12 text-center text-sm text-[#51443d]">
          正在讀取您的報名與通知資料...
        </div>
      ) : tab === 'enrollments' ? (
        <div className="space-y-5">
          {enrollments.length === 0 ? (
            <div className="bg-white border border-[#e0d8d3] rounded-lg p-12 text-center text-sm text-[#51443d]">
              您目前尚未報名任何體驗課程，歡迎前往「課程總覽」探索預約。
            </div>
          ) : (
            enrollments.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-[#e0d8d3] rounded-lg p-6 shadow-warm space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#e0d8d3] pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#73594c]">
                      <span className="tabular-nums font-medium">{item.enrollmentCode}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.courseCategory}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                    <h3 className="text-xl font-serif text-[#1b1c1c]">{item.courseTitle}</h3>
                  </div>

                  <span
                    className={`inline-flex items-center px-4 h-8 rounded-full text-xs font-medium whitespace-nowrap shrink-0 ${
                      item.paymentStatus === 'paid'
                        ? 'bg-[#e8ded8] text-[#70472d]'
                        : item.paymentStatus === 'needs_revision' || item.paymentStatus === 'refunded'
                        ? 'bg-[#ffdad6] text-[#93000a]'
                        : 'bg-[#f6f3f2] text-[#b0704c] border border-[#e0d8d3]'
                    }`}
                  >
                    {STATUS_LABEL[item.paymentStatus]}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-[#51443d]">
                  <div>
                    <p className="text-xs text-[#73594c]">預約時段與名額</p>
                    <p>{item.sessionDate}</p>
                    <p className="tabular-nums">報名人數：{item.seats} 位</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#73594c]">繳費方式與金額（港幣）</p>
                    <p>
                      {item.paymentMethod === 'online_card' ? '線上模擬即時付款' : '銀行轉帳匯款'}
                      {item.cardLastFour ? `（卡號末四碼 ${item.cardLastFour}）` : ''}
                      {item.transferLastFive ? `（帳號後五碼 ${item.transferLastFive}）` : ''}
                    </p>
                    <p className="text-base font-serif text-[#70472d] tabular-nums">
                      HK$ {item.totalAmount.toLocaleString()}
                    </p>
                    {item.paymentStatus === 'refunded' && (
                      <p className="text-xs text-[#93000a] tabular-nums mt-0.5">
                        已退回金額：HK$ {(item.refundAmount ?? item.totalAmount).toLocaleString()}
                        {item.refundReason ? `（${item.refundReason}）` : ''}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-[#73594c]">工坊核帳與備註</p>
                    <p>{item.adminNote || (item.verifiedBy ? `由 ${item.verifiedBy} 核對確認` : '尚無管理員備註')}</p>
                  </div>
                </div>

                {item.receiptMediaId && (
                  <div className="pt-2">
                    <p className="text-xs text-[#73594c] mb-1.5">已上傳匯款憑證：</p>
                    <div className="w-40 h-28 rounded-lg overflow-hidden border border-[#e0d8d3] bg-[#fcf9f8] flex items-center justify-center">
                      <MediaImage
                        src={`media://${item.receiptMediaId}`}
                        alt="匯款憑證"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {item.paymentMethod === 'bank_transfer' &&
                  (item.paymentStatus === 'pending_payment' ||
                    item.paymentStatus === 'needs_revision') && (
                    <div className="pt-3 border-t border-[#e0d8d3] flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-[#73594c]">
                        匯款帳號：{siteContent.paymentConfig.bankName}（
                        {siteContent.paymentConfig.bankCode}）{' '}
                        <span className="tabular-nums">
                          {siteContent.paymentConfig.accountNumber}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEnrollment(item);
                          setProofLastFive(item.transferLastFive || '');
                          setProofNote(item.studentNote || '');
                        }}
                        className="px-4 h-9 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
                      >
                        提交／更新轉帳後五碼與截圖
                      </button>
                    </div>
                  )}
              </div>
            ))
          )}
        </div>
      ) : tab === 'notifications' ? (
        <div className="space-y-4">
          {notifications.length === 0 ? (
            <div className="bg-white border border-[#e0d8d3] rounded-lg p-12 text-center text-sm text-[#51443d]">
              目前尚未收到工坊通知訊息。
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  n.isRead
                    ? 'bg-white border-[#e0d8d3]'
                    : 'bg-[#fcf9f8] border-[#8c5e43] shadow-warm'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-[#73594c]">
                    <span>{n.isRead ? '已讀通知' : '最新同步通知'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatDateTime(n.createdAt)}</span>
                  </div>
                  <h4 className="text-base font-serif text-[#1b1c1c]">{n.title}</h4>
                  <p className="text-sm text-[#51443d]">{n.message}</p>
                </div>
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => void handleMarkRead(n)}
                    className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-[#e8ded8] text-[#70472d] text-xs font-medium hover:bg-[#e0d8d3] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    標記已讀
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <form
          onSubmit={handleProfileSave}
          className="bg-white border border-[#e0d8d3] rounded-lg p-7 max-w-xl space-y-5 shadow-warm"
        >
          <h2 className="text-xl font-serif text-[#1b1c1c]">編輯會員資料</h2>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#51443d]">手提電話號碼（帳號識別）</span>
            <input
              type="text"
              disabled
              value={activeMember.phone}
              className="w-full h-11 px-3.5 rounded-lg bg-[#f6f3f2] border border-[#e0d8d3] text-sm text-[#51443d] tabular-nums"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#51443d]">學員姓名 *</span>
            <input
              type="text"
              required
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#51443d]">聯絡 Email</span>
            <input
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#51443d]">更換 6 位數數字 PIN 碼（若不更換請留空）</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="輸入新 6 位數 PIN 碼"
              className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tabular-nums"
            />
          </label>
          {profileMsg && <p className="text-xs text-[#70472d]">{profileMsg}</p>}
          <button
            type="submit"
            className="px-6 h-11 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] cursor-pointer"
          >
            儲存資料變更
          </button>
        </form>
      )}

      {/* Bank Transfer Proof Modal */}
      {selectedEnrollment && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTransferProof}
            className="bg-white border border-[#e0d8d3] rounded-lg max-w-md w-full p-6 space-y-4 shadow-warm"
          >
            <h3 className="text-lg font-serif text-[#1b1c1c]">
              提交轉帳對帳資料（{selectedEnrollment.enrollmentCode}）
            </h3>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#51443d]">匯款帳號後五碼 *</span>
              <input
                type="text"
                maxLength={5}
                required
                value={proofLastFive}
                onChange={(e) => setProofLastFive(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="例如：12345"
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums"
              />
            </label>
            <div className="space-y-1">
              <span className="block text-xs font-medium text-[#51443d]">上傳匯款憑證截圖</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleUploadProofImage}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingProof}
                onClick={() => fileRef.current?.click()}
                className="w-full h-11 px-4 rounded-lg border border-[#e0d8d3] text-xs font-medium text-[#73594c] hover:bg-[#f6f3f2] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                {uploadingProof
                  ? '上傳資料庫中...'
                  : proofMediaId
                  ? '已成功上傳截圖'
                  : '選擇電腦圖片檔案'}
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#51443d]">補充備註</span>
              <input
                type="text"
                value={proofNote}
                onChange={(e) => setProofNote(e.target.value)}
                placeholder="例如：已於今日下午三點完成轉帳"
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedEnrollment(null)}
                className="px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs font-medium text-[#51443d] cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={proofSaving}
                className="px-5 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
              >
                {proofSaving ? '送出中...' : '送出待管理員確認'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
