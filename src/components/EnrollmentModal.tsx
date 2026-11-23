import React, { useRef, useState } from 'react';
import { CheckCircle2, CreditCard, Landmark, Upload, X } from 'lucide-react';
import { ensureAnonymousSession, formatFrontAuthError } from '../lib/firebase';
import {
  createEnrollmentAndNotify,
  loginMemberWithPhonePin,
  registerMemberWithPhonePin,
  uploadMediaAsset,
} from '../services/firestoreService';
import {
  Course,
  Enrollment,
  isFieldVisible,
  Member,
  PaymentMethod,
  SiteContent,
} from '../types/atelier';
import { calculateTimeRangeDisplay, formatDateWithWeekday } from '../utils/scheduleUtils';

interface EnrollmentModalProps {
  course: Course;
  siteContent: SiteContent;
  activeMember: Member | null;
  firebaseReady: boolean;
  onMemberAuthenticated: (member: Member) => void;
  onClose: () => void;
  onSuccessGoToMemberCenter: (enrollment: Enrollment) => void;
}

export const EnrollmentModal: React.FC<EnrollmentModalProps> = ({
  course,
  siteContent,
  activeMember,
  firebaseReady,
  onMemberAuthenticated,
  onClose,
  onSuccessGoToMemberCenter,
}) => {
  // Inline Phone+PIN quick auth if not logged in
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Enrollment state
  const [seats, setSeats] = useState(1);
  const [sessionDate, setSessionDate] = useState((course.scheduleText || '').slice(0, 160));
  const [studentNote, setStudentNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online_card');

  // Simulated card fields
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // Bank transfer fields
  const [transferLastFive, setTransferLastFive] = useState('');
  const [receiptMediaId, setReceiptMediaId] = useState('');
  const [receiptTitle, setReceiptTitle] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [completedEnrollment, setCompletedEnrollment] = useState<Enrollment | null>(null);

  const maxAvailable = Math.max(1, course.maxSeats - course.enrolledCount);
  const totalAmount = course.price * seats;

  const ensureFirebaseSession = async () => {
    await ensureAnonymousSession();
  };

  const handleMemberAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      await ensureFirebaseSession();
      const member =
        authMode === 'register'
          ? await registerMemberWithPhonePin({ phone, pin, name, email })
          : await loginMemberWithPhonePin(phone, pin);
      onMemberAuthenticated(member);
    } catch (err) {
      setAuthError(formatFrontAuthError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitError('');
    setUploadingReceipt(true);
    try {
      await ensureFirebaseSession();
      const asset = await uploadMediaAsset(file, 'receipt', false, `匯款憑證_${course.title}`);
      setReceiptMediaId(asset.id);
      setReceiptTitle(file.name);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '上傳憑證失敗');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleConfirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMember) return;
    setSubmitError('');

    if (paymentMethod === 'online_card') {
      const cleanCard = cardNumber.replace(/\s+/g, '');
      if (!cardName.trim() || cleanCard.length < 12 || !cardExpiry.trim() || cardCvc.trim().length < 3) {
        setSubmitError('請完整填寫模擬信用卡結帳資訊（卡號需至少 12 碼）');
        return;
      }
    }

    setSubmitting(true);
    try {
      await ensureFirebaseSession();
      const created = await createEnrollmentAndNotify({
        member: activeMember,
        course,
        sessionDate: sessionDate.slice(0, 160),
        seats,
        paymentMethod,
        cardLastFour: paymentMethod === 'online_card' ? cardNumber.replace(/\s+/g, '').slice(-4) : '',
        transferLastFive: paymentMethod === 'bank_transfer' ? transferLastFive : '',
        receiptMediaId: paymentMethod === 'bank_transfer' ? receiptMediaId : '',
        studentNote,
      });
      setCompletedEnrollment(created);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '報名建立失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
      <div className="bg-white border border-[#e0d8d3] rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col shadow-warm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0d8d3]">
          <div>
            <p className="text-xs text-[#73594c]">課程體驗預約報名</p>
            {isFieldVisible(course.fieldVisibility, 'title') && (
              <h2 className="text-lg font-serif text-[#1b1c1c]">{course.title}</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#f6f3f2] text-[#51443d] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {completedEnrollment ? (
            <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-7 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-[#b0704c] mx-auto" />
              <h3 className="text-2xl font-serif text-[#1b1c1c]">
                {completedEnrollment.paymentStatus === 'paid'
                  ? '報名與線上付款成功'
                  : '課程報名預約已送出'}
              </h3>
              <p className="text-sm text-[#51443d]">
                訂單編號：<strong className="text-[#70472d] tabular-nums">{completedEnrollment.enrollmentCode}</strong>
                <br />
                應付金額（港幣）：<strong className="tabular-nums">HK$ {completedEnrollment.totalAmount.toLocaleString()}</strong>
              </p>
              <p className="text-xs text-[#73594c] max-w-md mx-auto leading-relaxed">
                {completedEnrollment.paymentStatus === 'paid'
                  ? '我們已同步發送報名成功通知至您的會員中心，您隨時可以查詢報名詳情。'
                  : '您可於會員中心查詢匯款帳號資訊、補填帳號後五碼或查看管理員核帳後的同步通知。'}
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onSuccessGoToMemberCenter(completedEnrollment)}
                  className="px-6 h-11 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer"
                >
                  前往會員中心查詢報名詳情
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 h-11 rounded-lg border border-[#e0d8d3] bg-white text-[#73594c] text-sm font-medium hover:bg-[#e8ded8]/50 cursor-pointer"
                >
                  繼續瀏覽課程
                </button>
              </div>
            </div>
          ) : !activeMember ? (
            <div className="space-y-5">
              <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-4 text-sm text-[#51443d]">
                請先以<strong>手提電話號碼＋6 位數數字 PIN 碼</strong>快速加入或登入會員，即可保留報名名額並隨時查詢繳費與通知進度。
              </div>

              <div className="flex gap-2 p-1 bg-[#f6f3f2] rounded-lg border border-[#e0d8d3]">
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className={`flex-1 h-9 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-white text-[#1b1c1c] shadow-sm'
                      : 'text-[#51443d]'
                  }`}
                >
                  新學員加入會員
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`flex-1 h-9 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    authMode === 'login' ? 'bg-white text-[#1b1c1c] shadow-sm' : 'text-[#51443d]'
                  }`}
                >
                  已有會員登入
                </button>
              </div>

              <form onSubmit={handleMemberAuth} className="space-y-4">
                {authMode === 'register' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[#51443d]">學員姓名 *</span>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="請輸入真實姓名"
                        className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[#51443d]">聯絡 Email（選填）</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                      />
                    </label>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#51443d]">手提電話號碼 *</span>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0912345678"
                      className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tabular-nums"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#51443d]">6 位數數字 PIN 碼 *</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="請輸入 6 位數字"
                      className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tracking-[0.2em] tabular-nums"
                    />
                  </label>
                </div>

                {authError && <p className="text-xs text-[#ba1a1a]">{authError}</p>}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full h-11 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {authLoading
                    ? '驗證登入中...'
                    : authMode === 'register'
                    ? '加入會員並繼續報名'
                    : '登入並繼續報名'}
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleConfirmEnrollment} className="space-y-6">
              {/* Member Info Summary */}
              <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-4 flex items-center justify-between text-sm">
                <div>
                  <span className="text-[#73594c]">報名學員：</span>
                  <strong className="text-[#1b1c1c]">{activeMember.name}</strong>
                  <span className="ml-2 text-xs text-[#51443d] tabular-nums">
                    ({activeMember.phone})
                  </span>
                </div>
                <span className="text-xs text-[#b0704c] font-medium">已登入會員</span>
              </div>

              {(() => {
                const sortedDates = [...(course.sessionDates || [])].filter(Boolean).sort();
                const calc = calculateTimeRangeDisplay(course.startTime, course.endTime);
                const timeText = calc.isValid ? calc.fullDisplay : course.duration;
                if (!timeText && sortedDates.length === 0) return null;
                return (
                  <div className="bg-[#fcf9f8] border border-[#e0d8d3] rounded-lg p-4 space-y-1.5 text-xs text-[#51443d]">
                    {timeText && (
                      <p className="tabular-nums">
                        <span className="text-[#73594c]">開課時段：</span>
                        <strong className="text-[#1b1c1c]">{timeText}</strong>
                      </p>
                    )}
                    {sortedDates.length > 0 && (
                      <p className="tabular-nums leading-relaxed">
                        <span className="text-[#73594c]">
                          已安排上課日期（共 {course.totalSessions || sortedDates.length} 堂）：
                        </span>
                        {sortedDates.map((d, idx) => `第 ${idx + 1} 堂 ${formatDateWithWeekday(d)}`).join('、')}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#51443d]">預約開課梯次</span>
                  <input
                    type="text"
                    maxLength={160}
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value.slice(0, 160))}
                    className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#51443d]">報名人數</span>
                  <select
                    value={seats}
                    onChange={(e) => setSeats(Number(e.target.value))}
                    className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tabular-nums"
                  >
                    {Array.from({ length: Math.min(4, maxAvailable) }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} 位學員（HK$ {(course.price * n).toLocaleString()}）
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Dual-Track Payment Selector */}
              <div className="space-y-3">
                <span className="block text-xs font-medium text-[#51443d]">選擇繳費方式 *</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('online_card')}
                    className={`p-4 rounded-lg border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      paymentMethod === 'online_card'
                        ? 'border-[#8c5e43] bg-[#e8ded8]/40'
                        : 'border-[#e0d8d3] bg-white hover:border-[#8c5e43]/60'
                    }`}
                  >
                    <CreditCard className="w-5 h-5 text-[#8c5e43] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[#1b1c1c]">線上模擬即時付款</p>
                      <p className="text-xs text-[#51443d]">模擬港幣 (HKD) 信用卡授權，立即完成報名</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('bank_transfer')}
                    className={`p-4 rounded-lg border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      paymentMethod === 'bank_transfer'
                        ? 'border-[#8c5e43] bg-[#e8ded8]/40'
                        : 'border-[#e0d8d3] bg-white hover:border-[#8c5e43]/60'
                    }`}
                  >
                    <Landmark className="w-5 h-5 text-[#8c5e43] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[#1b1c1c]">銀行轉帳匯款</p>
                      <p className="text-xs text-[#51443d]">填後五碼或截圖，管理員核對通知</p>
                    </div>
                  </button>
                </div>
              </div>

              {paymentMethod === 'online_card' ? (
                <div className="bg-[#fcf9f8] border border-[#e0d8d3] rounded-lg p-5 space-y-4">
                  <p className="text-xs font-medium text-[#73594c]">
                    線上模擬即時付款資訊（以港幣 HKD 結算，本區為安全模擬結帳環境，請勿填寫真實銀行密碼）
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="block text-xs font-medium text-[#51443d]">持卡人姓名 *</span>
                      <input
                        type="text"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        placeholder="持卡人姓名"
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="block text-xs font-medium text-[#51443d]">模擬信用卡卡號 *</span>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/[^\d\s]/g, '').slice(0, 19))}
                        placeholder="例如 4242 4242 4242 4242"
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tabular-nums"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="block text-xs font-medium text-[#51443d]">有效期限 (MM/YY) *</span>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tabular-nums"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="block text-xs font-medium text-[#51443d]">安全碼 (CVC) *</span>
                      <input
                        type="text"
                        maxLength={4}
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="3 至 4 位數字"
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tabular-nums"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="bg-[#fcf9f8] border border-[#e0d8d3] rounded-lg p-5 space-y-4">
                  <div className="space-y-1 text-sm text-[#51443d]">
                    <p className="font-medium text-[#1b1c1c]">工坊港幣匯款帳戶資訊</p>
                    {(isFieldVisible(siteContent.paymentConfig.fieldVisibility, 'bankName') ||
                      isFieldVisible(siteContent.paymentConfig.fieldVisibility, 'bankCode')) && (
                      <p>
                        {isFieldVisible(siteContent.paymentConfig.fieldVisibility, 'bankName') &&
                          `銀行：${siteContent.paymentConfig.bankName}`}
                        {isFieldVisible(siteContent.paymentConfig.fieldVisibility, 'bankCode') && (
                          <>
                            {isFieldVisible(siteContent.paymentConfig.fieldVisibility, 'bankName')
                              ? '（代碼 '
                              : '銀行代碼：'}
                            <span className="tabular-nums">
                              {siteContent.paymentConfig.bankCode}
                            </span>
                            {isFieldVisible(siteContent.paymentConfig.fieldVisibility, 'bankName')
                              ? '）'
                              : ''}
                          </>
                        )}
                      </p>
                    )}
                    {isFieldVisible(siteContent.paymentConfig.fieldVisibility, 'accountNumber') && (
                      <p className="tabular-nums">
                        帳號：<strong>{siteContent.paymentConfig.accountNumber}</strong>
                      </p>
                    )}
                    {isFieldVisible(siteContent.paymentConfig.fieldVisibility, 'accountName') && (
                      <p>戶名：{siteContent.paymentConfig.accountName}</p>
                    )}
                    {isFieldVisible(siteContent.paymentConfig.fieldVisibility, 'transferNotice') &&
                      siteContent.paymentConfig.transferNotice && (
                        <p className="text-xs text-[#73594c] pt-1 leading-relaxed whitespace-pre-line">
                          {siteContent.paymentConfig.transferNotice}
                        </p>
                      )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#e0d8d3]">
                    <label className="block space-y-1">
                      <span className="text-xs text-[#51443d]">匯款帳號後五碼（若尚未匯款可留空稍後補填）</span>
                      <input
                        type="text"
                        maxLength={5}
                        value={transferLastFive}
                        onChange={(e) =>
                          setTransferLastFive(e.target.value.replace(/\D/g, '').slice(0, 5))
                        }
                        placeholder="例如：83920"
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tabular-nums"
                      />
                    </label>
                    <div className="space-y-1">
                      <span className="block text-xs text-[#51443d]">上傳匯款憑證截圖（選填）</span>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={uploadingReceipt}
                        onClick={() => fileRef.current?.click()}
                        className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] bg-white text-xs font-medium text-[#73594c] hover:bg-[#e8ded8]/50 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        {uploadingReceipt
                          ? '上傳資料庫中...'
                          : receiptTitle
                          ? `已上傳：${receiptTitle}`
                          : '選擇電腦圖片憑證'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#51443d]">備註事項（如飲食過敏茶點、左撇子工具需求等）</span>
                <textarea
                  rows={2}
                  value={studentNote}
                  onChange={(e) => setStudentNote(e.target.value)}
                  placeholder="選填..."
                  className="w-full p-3 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                />
              </label>

              {submitError && <p className="text-xs text-[#ba1a1a]">{submitError}</p>}

              <div className="pt-4 border-t border-[#e0d8d3] flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-[#51443d] block">合計應付金額（港幣 HKD）</span>
                  <span className="text-2xl font-serif text-[#70472d] tabular-nums">
                    HK$ {totalAmount.toLocaleString()}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-8 h-12 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting
                    ? '送出處理中...'
                    : paymentMethod === 'online_card'
                    ? '確認模擬付款並完成報名'
                    : '確認送出報名預約'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
