import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calculator,
  Calendar,
  CheckCircle2,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LogOut,
  Plus,
  Shield,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
  User,
} from 'firebase/auth';
import {
  auth,
  formatAdminAuthError,
  registerAdminWithEmailPassword,
  sendAdminPasswordSetupEmail,
  signInAdminWithEmailPassword,
  SUPER_ADMIN_EMAIL,
} from '../lib/firebase';
import {
  adminUpsertMember,
  adminVerifyEnrollmentPayment,
  changeOwnAdminPin,
  deleteAdminUser,
  deleteArtisan,
  deleteContactSubmission,
  deleteCourse,
  deleteEnrollment,
  deleteGalleryWork,
  deleteMediaAsset,
  deleteMember,
  duplicateCourse,
  fetchAllAdminUsers,
  fetchAllContactSubmissions,
  fetchAllEnrollments,
  fetchAllMediaAssetsForAdmin,
  fetchAllMembers,
  fetchArtisans,
  fetchCmsRevisions,
  fetchCourses,
  fetchGalleryWorks,
  fetchInstructorSessions,
  formatDateTime,
  loginAdminWithPhonePin,
  saveAdminUser,
  saveArtisan,
  saveCourse,
  saveGalleryWork,
  seedDatabaseIfEmpty,
  updateContactSubmission,
  uploadMediaAsset,
} from '../services/firestoreService';
import {
  AdminPermissions,
  AdminUser,
  Artisan,
  CmsRevision,
  ContactSubmission,
  Course,
  CourseStatus,
  Enrollment,
  FieldVisibilityMap,
  GalleryWork,
  InstructorSessionRecord,
  isFieldVisible,
  MediaAsset,
  Member,
  PaymentStatus,
  SiteContent,
} from '../types/atelier';
import { buildScheduleText, calculateTimeRangeDisplay } from '../utils/scheduleUtils';
import { AdminAccounting } from './AdminAccounting';
import { AdminAnalytics } from './AdminAnalytics';
import { AdminCmsEditor } from './AdminCmsEditor';
import { CalendarMultiDatePicker } from './CalendarMultiDatePicker';
import {
  FieldLabelHeader,
  NumberFieldWithVisibility,
  OptionOrCustomField,
  TextAreaFieldWithVisibility,
  TextFieldWithVisibility,
} from './FormControls';
import { MediaImage } from './MediaImage';
import { MediaPickerButton } from './MediaPickerButton';

const COURSE_CATEGORY_OPTIONS = ['陶藝拉坯', '木工車枳', '侘寂茶道', '金工鍛造', '天然染織', '綜合工藝'];
const COURSE_LEVEL_OPTIONS = ['初學入門', '基礎體驗', '進階實作', '全齡親子', '職人專修'];
const COURSE_LOCATION_OPTIONS = ['將軍澳工坊本館', '線上同步直播課程', '企業／機構外展包場'];
const COURSE_SCHEDULE_OPTIONS = [
  '預約制私人／包班時段',
  '每週六小班實作（詳見開課日期）',
  '每週日小班實作（詳見開課日期）',
  '平日夜間療癒班（詳見開課日期）',
];
const COURSE_MATERIALS_OPTIONS = [
  '含天然陶土、礦物釉藥、窯燒費、工作圍裙與茶點',
  '含嚴選實木料、手工工具使用、蜂蠟護木油與茶點',
  '含全套體驗材料、工具借用與專屬茶點',
];
const ARTISAN_SPECIALTY_OPTIONS = [
  '赤陶手拉坯・礦物釉藥',
  '實木車枳・傳統木作',
  '侘寂茶道・器皿美學',
  '手工金工・鍛造工藝',
];
const GALLERY_YEAR_OPTIONS = ['2026', '2025', '2024', '2023'];
const ADMIN_ROLE_OPTIONS = ['工坊總監（全模組）', '課程與 CMS 編輯員', '財務對帳專員', '客服與會員專員'];

const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  recruiting: '招生中',
  ongoing: '開課中',
  completed: '已完結',
};

type AdminTab =
  | 'analytics'
  | 'cms'
  | 'media'
  | 'courses'
  | 'payments'
  | 'accounting'
  | 'members'
  | 'forms'
  | 'admins';

interface AdminConsoleProps {
  siteContent: SiteContent;
  onSiteContentChange: (content: SiteContent) => void;
  onCatalogRefresh: () => Promise<void>;
  onExitToStorefront: () => void;
}

const DEFAULT_PERMS: AdminPermissions = {
  cms: true,
  media: true,
  courses: true,
  members: false,
  payments: false,
  accounting: false,
  forms: true,
  analytics: false,
  admins: false,
};

const PERMISSION_LABELS: { key: keyof AdminPermissions; label: string }[] = [
  { key: 'analytics', label: '數據分析儀表板' },
  { key: 'cms', label: '全站 CMS 編輯與版本控制' },
  { key: 'media', label: '資料庫圖片媒體庫' },
  { key: 'courses', label: '課程／職人／藝廊管理' },
  { key: 'payments', label: '報名與繳費核對通知' },
  { key: 'accounting', label: '會計結算與導師課酬記錄' },
  { key: 'members', label: '會員資料管理' },
  { key: 'forms', label: '表單資料管理' },
  { key: 'admins', label: '多管理員與權限設定' },
];

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  siteContent,
  onSiteContentChange,
  onCatalogRefresh,
  onExitToStorefront,
}) => {
  const [activeAdmin, setActiveAdmin] = useState<AdminUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(() => auth.currentUser);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [emailAuthMode, setEmailAuthMode] = useState<'signin' | 'register'>('signin');
  const [, setEmailVerifyRefreshCount] = useState(0);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsub();
  }, []);

  const [tab, setTab] = useState<AdminTab>('analytics');
  const [loadingAll, setLoadingAll] = useState(false);

  // Admin datasets
  const [revisions, setRevisions] = useState<CmsRevision[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [galleryWorks, setGalleryWorks] = useState<GalleryWork[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [instructorSessions, setInstructorSessions] = useState<InstructorSessionRecord[]>([]);

  // Sub-modals & forms
  const [catalogSubTab, setCatalogSubTab] = useState<'courses' | 'artisans' | 'gallery'>('courses');
  const [editingCourse, setEditingCourse] = useState<Partial<Course> | null>(null);
  const [editingArtisan, setEditingArtisan] = useState<Partial<Artisan> | null>(null);
  const [editingGallery, setEditingGallery] = useState<Partial<GalleryWork> | null>(null);

  // Course Filters
  const [courseStatusFilter, setCourseStatusFilter] = useState<string>('all');
  const [courseArtisanFilter, setCourseArtisanFilter] = useState<string>('all');
  const [courseLevelFilter, setCourseLevelFilter] = useState<string>('all');
  const [courseSearch, setCourseSearch] = useState<string>('');
  const [accountingArtisanFilter, setAccountingArtisanFilter] = useState<string>('all');

  const [editingMember, setEditingMember] = useState<{
    id?: string;
    ownerUid?: string;
    phone: string;
    name: string;
    email: string;
    newPin: string;
    existingPinHash?: string;
    notes: string;
    status: 'active' | 'suspended';
    createdAt?: unknown;
  } | null>(null);

  const [verifyingEnrollment, setVerifyingEnrollment] = useState<Enrollment | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundReason, setRefundReason] = useState<string>('');

  const [editingAdmin, setEditingAdmin] = useState<{
    id?: string;
    phone: string;
    name: string;
    roleTitle: string;
    boundEmail: string;
    newPin: string;
    existingPinHash?: string;
    isSuperAdmin: boolean;
    isActive: boolean;
    permissions: AdminPermissions;
    createdAt?: unknown;
  } | null>(null);

  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [memberSearch, setMemberSearch] = useState('');
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [showOwnPinModal, setShowOwnPinModal] = useState(false);
  const [ownCurrentPin, setOwnCurrentPin] = useState('');
  const [ownNewPin, setOwnNewPin] = useState('');
  const [ownConfirmPin, setOwnConfirmPin] = useState('');
  const [ownPinSaving, setOwnPinSaving] = useState(false);
  const [ownPinError, setOwnPinError] = useState('');
  const [ownPinSuccess, setOwnPinSuccess] = useState('');

  const hasPermission = (key: keyof AdminPermissions) => {
    if (!activeAdmin) return false;
    if (activeAdmin.isSuperAdmin) return true;
    if (key === 'accounting') {
      return Boolean(activeAdmin.permissions?.accounting ?? activeAdmin.permissions?.payments);
    }
    return Boolean(activeAdmin.permissions?.[key]);
  };

  const loadAllAdminData = async () => {
    setLoadingAll(true);
    try {
      const [revs, media, crs, arts, gal, mems, enrs, subs, admins, sessions] = await Promise.all([
        fetchCmsRevisions(),
        fetchAllMediaAssetsForAdmin(),
        fetchCourses(),
        fetchArtisans(),
        fetchGalleryWorks(),
        fetchAllMembers(),
        fetchAllEnrollments(),
        fetchAllContactSubmissions(),
        fetchAllAdminUsers(),
        fetchInstructorSessions(),
      ]);
      setRevisions(revs);
      setMediaAssets(media);
      setCourses(crs);
      setArtisans(arts);
      setGalleryWorks(gal);
      setMembers(mems);
      setEnrollments(enrs);
      setSubmissions(subs);
      setAdminUsers(admins);
      setInstructorSessions(sessions);
    } catch (err) {
      console.error('Failed to load admin datasets:', err);
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => {
    if (activeAdmin) {
      void loadAllAdminData();
      // Select first permitted tab automatically
      const order: AdminTab[] = [
        'analytics',
        'cms',
        'payments',
        'accounting',
        'courses',
        'members',
        'forms',
        'media',
        'admins',
      ];
      const firstAllowed = order.find(
        (t) => hasPermission(t)
      );
      if (firstAllowed) setTab(firstAllowed);
    }
  }, [activeAdmin?.id]);

  const handleAdminEmailSignOut = async () => {
    setLoginError('');
    setLoginNotice('');
    await signOut(auth);
    setFirebaseUser(null);
  };

  const handleSendPasswordSetup = async () => {
    setLoginError('');
    setLoginNotice('');
    const targetEmail = adminEmail.trim() || firebaseUser?.email || '';
    if (!targetEmail || !targetEmail.includes('@')) {
      setLoginError('請先輸入要設定或重設密碼的管理員電郵');
      return;
    }
    setLoginLoading(true);
    try {
      await sendAdminPasswordSetupEmail(targetEmail);
      setLoginNotice(
        `已寄出「設定／重設密碼」信件至 ${targetEmail}。請前往信箱點擊連結完成密碼設定後，即可直接在此輸入電郵與密碼登入。`
      );
    } catch (err) {
      setLoginError(formatAdminAuthError(err));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCheckEmailVerification = async () => {
    setLoginError('');
    setLoginNotice('');
    if (!auth.currentUser) return;
    setLoginLoading(true);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      setFirebaseUser(auth.currentUser);
      setEmailVerifyRefreshCount((c) => c + 1);
      if (auth.currentUser.emailVerified) {
        setLoginNotice('管理員電郵驗證成功！現在請輸入手提電話與 6 位數 PIN 碼登入後台。');
      } else {
        setLoginError('系統偵測此電郵尚未完成驗證，請先至信箱點擊驗證連結（亦請檢查垃圾郵件匣）。');
      }
    } catch (err) {
      setLoginError(formatAdminAuthError(err));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setLoginError('');
    setLoginNotice('');
    if (!auth.currentUser) return;
    setLoginLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setLoginNotice(`已重新寄出信箱驗證信至 ${auth.currentUser.email}，請點擊信中連結完成驗證。`);
    } catch (err) {
      setLoginError(formatAdminAuthError(err));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginNotice('');
    setLoginLoading(true);
    try {
      let currentUser = auth.currentUser;
      const isVerifiedAdminEmail = Boolean(
        currentUser && !currentUser.isAnonymous && currentUser.email && currentUser.emailVerified
      );

      if (!isVerifiedAdminEmail) {
        if (currentUser && !currentUser.isAnonymous && currentUser.email && !currentUser.emailVerified) {
          await currentUser.reload();
          await currentUser.getIdToken(true);
          setFirebaseUser(auth.currentUser);
          setEmailVerifyRefreshCount((c) => c + 1);
          if (!auth.currentUser?.emailVerified) {
            setLoginError('請先完成管理員信箱驗證，點擊信中驗證連結後再按「我已完成驗證，重新檢查」。');
            return;
          }
          currentUser = auth.currentUser;
        } else {
          if (!adminEmail.trim() || !adminPassword) {
            setLoginError('請輸入管理員電郵與密碼以進行免彈窗安全驗證');
            return;
          }
          if (emailAuthMode === 'register') {
            const newUser = await registerAdminWithEmailPassword(adminEmail, adminPassword);
            setFirebaseUser(newUser);
            setLoginNotice(
              `已為 ${adminEmail.trim()} 建立帳號並寄出信箱驗證信。請點擊信中驗證連結後，再按「我已完成驗證，重新檢查」。`
            );
            return;
          }
          const signedUser = await signInAdminWithEmailPassword(adminEmail, adminPassword);
          await signedUser.getIdToken(true);
          setFirebaseUser(signedUser);
          if (!signedUser.emailVerified) {
            setLoginError('此管理員帳號尚未完成信箱驗證，請先至信箱點擊驗證連結（或點擊重寄驗證信）。');
            return;
          }
        }
      }

      await seedDatabaseIfEmpty();
      const admin = await loginAdminWithPhonePin(loginPhone, loginPin);
      setActiveAdmin(admin);
      setLoginPin('');
      setAdminPassword('');
    } catch (err) {
      setLoginError(formatAdminAuthError(err));
    } finally {
      setLoginLoading(false);
    }
  };

  const openOwnPinModal = () => {
    setOwnCurrentPin('');
    setOwnNewPin('');
    setOwnConfirmPin('');
    setOwnPinError('');
    setOwnPinSuccess('');
    setShowOwnPinModal(true);
  };

  const handleOwnPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAdmin) return;
    setOwnPinError('');
    setOwnPinSuccess('');

    if (!/^\d{6}$/.test(ownCurrentPin)) {
      setOwnPinError('請輸入目前的 6 位數數字 PIN 碼');
      return;
    }
    if (!/^\d{6}$/.test(ownNewPin)) {
      setOwnPinError('新 PIN 碼必須為 6 位數純數字');
      return;
    }
    if (ownNewPin !== ownConfirmPin) {
      setOwnPinError('兩次輸入的新 PIN 碼不一致，請重新確認');
      return;
    }

    setOwnPinSaving(true);
    try {
      const updatedHash = await changeOwnAdminPin({
        adminId: activeAdmin.id,
        currentPin: ownCurrentPin,
        newPin: ownNewPin,
      });
      setActiveAdmin((prev) => (prev ? { ...prev, pinHash: updatedHash } : prev));
      setAdminUsers((prev) =>
        prev.map((a) => (a.id === activeAdmin.id ? { ...a, pinHash: updatedHash } : a))
      );
      setOwnCurrentPin('');
      setOwnNewPin('');
      setOwnConfirmPin('');
      setOwnPinSuccess('您的 6 位數 PIN 碼已更新成功，下次登入請使用新 PIN 碼。');
    } catch (err) {
      setOwnPinError(formatAdminAuthError(err));
    } finally {
      setOwnPinSaving(false);
    }
  };

  const handleDirectMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    try {
      const asset = await uploadMediaAsset(file, 'cms', true);
      setMediaAssets((prev) => [asset, ...prev]);
    } catch (err) {
      alert(err instanceof Error ? err.message : '圖片上傳失敗');
    } finally {
      setUploadingMedia(false);
      if (mediaFileRef.current) mediaFileRef.current.value = '';
    }
  };

  if (!activeAdmin) {
    const hasVerifiedAdminSession = Boolean(
      firebaseUser && !firebaseUser.isAnonymous && firebaseUser.email && firebaseUser.emailVerified
    );
    const hasUnverifiedEmailSession = Boolean(
      firebaseUser && !firebaseUser.isAnonymous && firebaseUser.email && !firebaseUser.emailVerified
    );

    return (
      <div className="min-h-screen bg-[#fcf9f8] flex items-center justify-center p-5">
        <div className="max-w-md w-full bg-white border border-[#e0d8d3] rounded-lg p-8 shadow-warm space-y-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onExitToStorefront}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#73594c] hover:text-[#70472d] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              返回前台網站
            </button>
            <span className="text-xs text-[#73594c]">管理員安全工作台（免彈窗）</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-serif text-[#1b1c1c]">工坊後台管理系統登入</h1>
            <p className="text-sm text-[#51443d]">
              全程直接於頁面內輸入驗證，不會彈出任何外部視窗。請以授權電郵密碼搭配管理員電話與 6 位數 PIN 碼登入。
            </p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            {hasVerifiedAdminSession ? (
              <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-4 text-xs text-[#51443d] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[#70472d]">步驟 1：管理員電郵安全驗證</span>
                  <span className="font-medium text-[#70472d]">已記住並驗證</span>
                </div>
                <p className="text-[#1b1c1c] break-all">
                  目前驗證電郵：<strong>{firebaseUser?.email}</strong>
                </p>
                <div className="pt-0.5">
                  <button
                    type="button"
                    disabled={loginLoading}
                    onClick={() => void handleAdminEmailSignOut()}
                    className="px-3 h-8 rounded-lg bg-white border border-[#e0d8d3] text-xs text-[#51443d] hover:bg-[#e8ded8]/60 cursor-pointer disabled:opacity-50"
                  >
                    切換其他管理員電郵 / 登出
                  </button>
                </div>
              </div>
            ) : hasUnverifiedEmailSession ? (
              <div className="bg-[#f6f3f2] border border-[#8c5e43]/40 rounded-lg p-4 text-xs text-[#51443d] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[#70472d]">步驟 1：待完成信箱連結驗證</span>
                  <span className="font-medium text-[#b0704c]">待驗證</span>
                </div>
                <p className="text-[#1b1c1c] break-all">
                  已建立帳號：<strong>{firebaseUser?.email}</strong>。請至信箱點擊驗證連結後再按下方按鈕。
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={loginLoading}
                    onClick={() => void handleCheckEmailVerification()}
                    className="px-3 h-8 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer disabled:opacity-50"
                  >
                    我已完成驗證，重新檢查
                  </button>
                  <button
                    type="button"
                    disabled={loginLoading}
                    onClick={() => void handleResendVerification()}
                    className="px-3 h-8 rounded-lg bg-white border border-[#e0d8d3] text-xs text-[#70472d] hover:bg-[#e8ded8]/60 cursor-pointer disabled:opacity-50"
                  >
                    重寄驗證信
                  </button>
                  <button
                    type="button"
                    disabled={loginLoading}
                    onClick={() => void handleAdminEmailSignOut()}
                    className="px-3 h-8 rounded-lg border border-[#e0d8d3] text-xs text-[#51443d] hover:bg-white cursor-pointer disabled:opacity-50"
                  >
                    更換電郵
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#70472d]">
                    步驟 1：管理員電郵與密碼（免彈窗，登入一次即可記住）
                  </span>
                </div>

                <div className="flex gap-1.5 p-1 bg-white rounded-lg border border-[#e0d8d3]">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailAuthMode('signin');
                      setLoginError('');
                      setLoginNotice('');
                    }}
                    className={`flex-1 h-8 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      emailAuthMode === 'signin'
                        ? 'bg-[#8c5e43] text-white'
                        : 'text-[#51443d] hover:bg-[#f6f3f2]'
                    }`}
                  >
                    電郵密碼登入
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailAuthMode('register');
                      setLoginError('');
                      setLoginNotice('');
                    }}
                    className={`flex-1 h-8 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      emailAuthMode === 'register'
                        ? 'bg-[#8c5e43] text-white'
                        : 'text-[#51443d] hover:bg-[#f6f3f2]'
                    }`}
                  >
                    新員工首次啟用密碼
                  </button>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#51443d]">管理員電郵 *</span>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder={SUPER_ADMIN_EMAIL}
                    className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#51443d]">
                    {emailAuthMode === 'register' ? '設定管理員電郵密碼（至少 6 字元）*' : '管理員電郵密碼 *'}
                  </span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="輸入電郵登入密碼"
                    className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#73594c]">
                  <button
                    type="button"
                    disabled={loginLoading}
                    onClick={() => void handleSendPasswordSetup()}
                    className="underline underline-offset-2 text-[#70472d] hover:text-[#1b1c1c] cursor-pointer disabled:opacity-50"
                  >
                    首次設定 / 忘記密碼？寄送設定密碼信至信箱
                  </button>
                </div>
              </div>
            )}

            {emailAuthMode === 'signin' && !hasUnverifiedEmailSession && (
              <div className="space-y-3 pt-1">
                <p className="text-xs font-medium text-[#70472d]">
                  步驟 2：管理員手提電話與 6 位數 PIN 碼
                </p>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#51443d]">管理員手提電話號碼 *</span>
                  <input
                    type="tel"
                    required
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="0900000000"
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
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="輸入 6 位數字"
                    className="w-full h-12 px-4 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tracking-[0.25em] tabular-nums"
                  />
                </label>
              </div>
            )}

            {loginNotice && (
              <div className="p-3 rounded-lg bg-[#e8ded8]/60 border border-[#8c5e43]/40 text-xs text-[#70472d] leading-relaxed">
                {loginNotice}
              </div>
            )}

            {loginError && (
              <div className="p-3 rounded-lg bg-[#ffdad6]/60 border border-[#ba1a1a]/30 text-xs text-[#93000a] leading-relaxed">
                {loginError}
              </div>
            )}

            {!hasUnverifiedEmailSession && (
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full h-12 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer disabled:opacity-50"
              >
                {loginLoading
                  ? '驗證授權中...'
                  : emailAuthMode === 'register' && !hasVerifiedAdminSession
                  ? '建立電郵密碼並寄送驗證信'
                  : '登入後台管理系統'}
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  const navButtons: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: 'analytics', label: '數據分析儀表板', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'cms', label: '全站畫面 CMS', icon: <Layers className="w-4 h-4" /> },
    { key: 'media', label: '圖片媒體庫', icon: <ImageIcon className="w-4 h-4" /> },
    { key: 'courses', label: '課程／職人／藝廊', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'payments', label: '報名與繳費核對', icon: <CreditCard className="w-4 h-4" /> },
    { key: 'accounting', label: '會計結算與導師課酬', icon: <Calculator className="w-4 h-4" /> },
    { key: 'members', label: '會員資料管理', icon: <Users className="w-4 h-4" /> },
    { key: 'forms', label: '聯絡與預約表單', icon: <FileText className="w-4 h-4" /> },
    { key: 'admins', label: '管理員與權限設定', icon: <Shield className="w-4 h-4" /> },
  ];

  const allowedNavButtons = navButtons.filter((b) => hasPermission(b.key));

  const filteredCoursesForAdmin = courses.filter((c) => {
    const status = c.courseStatus || 'recruiting';
    if (courseStatusFilter !== 'all' && status !== courseStatusFilter) return false;
    if (courseArtisanFilter !== 'all' && c.artisanName !== courseArtisanFilter) return false;
    if (courseLevelFilter !== 'all' && c.level !== courseLevelFilter) return false;
    if (courseSearch.trim()) {
      const q = courseSearch.trim().toLowerCase();
      if (
        !c.title.toLowerCase().includes(q) &&
        !c.category.toLowerCase().includes(q) &&
        !c.artisanName.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const filteredEnrollments =
    paymentFilter === 'all'
      ? enrollments
      : enrollments.filter((e) => e.paymentStatus === paymentFilter);

  const filteredMembers = members.filter(
    (m) =>
      !memberSearch.trim() ||
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.phone.includes(memberSearch)
  );

  return (
    <div className="min-h-screen bg-[#fcf9f8] flex flex-col lg:flex-row">
      {/* Left Sidebar */}
      <aside className="lg:w-68 bg-[#f6f3f2] border-b lg:border-b-0 lg:border-r border-[#e0d8d3] p-5 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div className="space-y-1">
            <button
              type="button"
              onClick={onExitToStorefront}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#73594c] hover:text-[#70472d] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回前台網站預覽
            </button>
            <h1 className="text-lg font-serif text-[#1b1c1c] pt-2">工坊管理後台</h1>
            <p className="text-xs text-[#51443d]">
              {activeAdmin.name} · {activeAdmin.roleTitle}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={openOwnPinModal}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[#e0d8d3] bg-white text-xs font-medium text-[#70472d] hover:bg-[#e8ded8]/50 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                修改我的 PIN 碼
              </button>
              <button
                type="button"
                onClick={() => setActiveAdmin(null)}
                className="lg:hidden inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[#e0d8d3] bg-white text-xs font-medium text-[#51443d] hover:bg-[#e8ded8]/50 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                登出
              </button>
            </div>
          </div>

          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto pb-2 lg:pb-0">
            {allowedNavButtons.map((btn) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => setTab(btn.key)}
                className={`flex items-center gap-2.5 px-3.5 h-10 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === btn.key
                    ? 'bg-[#8c5e43] text-white'
                    : 'text-[#51443d] hover:bg-[#e8ded8]/60'
                }`}
              >
                {btn.icon}
                {btn.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="pt-4 mt-6 border-t border-[#e0d8d3] space-y-2 hidden lg:block">
          <button
            type="button"
            onClick={() => void loadAllAdminData()}
            className="w-full h-9 rounded-lg border border-[#e0d8d3] bg-white text-xs font-medium text-[#73594c] hover:bg-[#e8ded8]/40 cursor-pointer"
          >
            {loadingAll ? '同步資料中...' : '重新同步資料庫'}
          </button>
          <button
            type="button"
            onClick={() => setActiveAdmin(null)}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-medium text-[#51443d] hover:bg-[#e8ded8]/50 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            切換管理員 / 登出
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-5 md:p-10 max-w-6xl w-full mx-auto space-y-8">
        {tab === 'analytics' && hasPermission('analytics') && (
          <AdminAnalytics
            courses={courses}
            members={members}
            enrollments={enrollments}
            submissions={submissions}
          />
        )}

        {tab === 'cms' && hasPermission('cms') && (
          <AdminCmsEditor
            siteContent={siteContent}
            revisions={revisions}
            mediaAssets={mediaAssets}
            activeAdmin={activeAdmin}
            onMediaUploaded={(asset) => setMediaAssets((prev) => [asset, ...prev])}
            onSiteContentPublished={onSiteContentChange}
            onRevisionsRefresh={async () => setRevisions(await fetchCmsRevisions())}
          />
        )}

        {tab === 'media' && hasPermission('media') && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-serif text-[#1b1c1c]">資料庫圖片媒體庫</h2>
                <p className="text-sm text-[#51443d]">
                  從電腦上傳的圖片將永久儲存於雲端資料庫中，可於任何前台區塊或課程重複取用。
                </p>
              </div>
              <div>
                <input
                  ref={mediaFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleDirectMediaUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingMedia}
                  onClick={() => mediaFileRef.current?.click()}
                  className="inline-flex items-center gap-2 px-5 h-11 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingMedia ? '上傳壓縮入庫中...' : '上傳電腦圖片至資料庫'}
                </button>
              </div>
            </div>

            {mediaAssets.length === 0 ? (
              <div className="bg-white border border-[#e0d8d3] rounded-lg p-12 text-center text-sm text-[#51443d]">
                資料庫尚無上傳圖片，點擊右上角即可從電腦選取圖片永久保存。
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {mediaAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden shadow-warm flex flex-col justify-between"
                  >
                    <div className="aspect-[4/3] bg-[#fcf9f8] flex items-center justify-center">
                      <img
                        src={asset.dataUrl}
                        alt={asset.title}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <p className="text-sm font-medium text-[#1b1c1c] truncate">{asset.title}</p>
                      <div className="flex items-center justify-between text-xs text-[#73594c]">
                        <span>{asset.category}</span>
                        <span className="tabular-nums">{Math.round(asset.sizeBytes / 1024)} KB</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteMediaAsset(asset.id);
                          setMediaAssets((prev) => prev.filter((m) => m.id !== asset.id));
                        }}
                        className="w-full h-8 rounded-lg border border-[#e0d8d3] text-xs text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                      >
                        從資料庫刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'courses' && hasPermission('courses') && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-serif text-[#1b1c1c]">課程、職人與作品藝廊管理</h2>
                <p className="text-sm text-[#51443d]">
                  支援所有項目的新增、修改、刪除、電腦圖片上傳以及前台可視化（顯示／隱藏）設定。
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (catalogSubTab === 'courses') {
                      const defaultArt = artisans[0];
                      const defaultTime = calculateTimeRangeDisplay('14:00', '17:00');
                      setEditingCourse({
                        title: '',
                        category: '陶藝拉坯',
                        level: '初學入門',
                        startTime: '14:00',
                        endTime: '17:00',
                        duration: defaultTime.fullDisplay,
                        totalSessions: 1,
                        sessionDates: [],
                        courseStatus: 'recruiting',
                        instructorPayPerSession: defaultArt?.defaultSessionPay ?? 1000,
                        price: 680,
                        maxSeats: 6,
                        enrolledCount: 0,
                        scheduleText: buildScheduleText({
                          sessionDates: [],
                          totalSessions: 1,
                          startTime: '14:00',
                          endTime: '17:00',
                        }),
                        location: '將軍澳工坊本館',
                        summary: '',
                        description: '',
                        materialsIncluded: '',
                        imageUrl: '',
                        imageVisible: true,
                        artisanId: defaultArt?.id || '',
                        artisanName: defaultArt?.name || '',
                        isVisible: true,
                        order: courses.length + 1,
                      });
                    } else if (catalogSubTab === 'artisans') {
                      setEditingArtisan({
                        name: '',
                        specialty: '',
                        yearsExperience: 5,
                        phone: '',
                        defaultSessionPay: 1000,
                        quote: '',
                        bio: '',
                        avatarUrl: '',
                        imageVisible: true,
                        isVisible: true,
                        order: artisans.length + 1,
                      });
                    } else {
                      setEditingGallery({
                        title: '',
                        category: '陶藝拉坯',
                        artisanName: artisans[0]?.name || '',
                        year: '2026',
                        story: '',
                        imageUrl: '',
                        imageVisible: true,
                        isVisible: true,
                        order: galleryWorks.length + 1,
                      });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-5 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  新增
                  {catalogSubTab === 'courses'
                    ? '體驗課程'
                    : catalogSubTab === 'artisans'
                    ? '駐店職人'
                    : '藝廊作品'}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              {[
                { k: 'courses', l: `體驗課程 (${courses.length})` },
                { k: 'artisans', l: `駐店職人 (${artisans.length})` },
                { k: 'gallery', l: `作品藝廊 (${galleryWorks.length})` },
              ].map((s) => (
                <button
                  key={s.k}
                  type="button"
                  onClick={() => setCatalogSubTab(s.k as typeof catalogSubTab)}
                  className={`px-4 h-9 rounded-full text-xs font-medium cursor-pointer ${
                    catalogSubTab === s.k
                      ? 'bg-[#8c5e43] text-white'
                      : 'bg-white border border-[#e0d8d3] text-[#73594c]'
                  }`}
                >
                  {s.l}
                </button>
              ))}
            </div>

            {catalogSubTab === 'courses' && (
              <div className="space-y-5">
                {/* Multi-Dimension Course Filters */}
                <div className="bg-white border border-[#e0d8d3] rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-[#51443d] mr-1">開課狀態：</span>
                    {[
                      { k: 'all', l: `全部 (${courses.length})` },
                      {
                        k: 'recruiting',
                        l: `招生中 (${courses.filter((x) => (x.courseStatus || 'recruiting') === 'recruiting').length})`,
                      },
                      {
                        k: 'ongoing',
                        l: `開課中 (${courses.filter((x) => x.courseStatus === 'ongoing').length})`,
                      },
                      {
                        k: 'completed',
                        l: `已完結 (${courses.filter((x) => x.courseStatus === 'completed').length})`,
                      },
                    ].map((st) => (
                      <button
                        key={st.k}
                        type="button"
                        onClick={() => setCourseStatusFilter(st.k)}
                        className={`px-3.5 h-8 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          courseStatusFilter === st.k
                            ? 'bg-[#8c5e43] text-white'
                            : 'bg-[#fcf9f8] border border-[#e0d8d3] text-[#73594c] hover:bg-[#e8ded8]/60'
                        }`}
                      >
                        {st.l}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <label className="block space-y-1">
                      <span className="block text-[11px] font-medium text-[#51443d]">篩選授課職人姓名</span>
                      <select
                        value={courseArtisanFilter}
                        onChange={(e) => setCourseArtisanFilter(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] text-xs text-[#1b1c1c]"
                      >
                        <option value="all">全部授課職人</option>
                        {Array.from(
                          new Set([...artisans.map((a) => a.name), ...courses.map((c) => c.artisanName)].filter(Boolean))
                        ).map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1">
                      <span className="block text-[11px] font-medium text-[#51443d]">篩選適合難度</span>
                      <select
                        value={courseLevelFilter}
                        onChange={(e) => setCourseLevelFilter(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] text-xs text-[#1b1c1c]"
                      >
                        <option value="all">全部難度程度</option>
                        {Array.from(
                          new Set([...COURSE_LEVEL_OPTIONS, ...courses.map((c) => c.level)].filter(Boolean))
                        ).map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1">
                      <span className="block text-[11px] font-medium text-[#51443d]">關鍵字搜尋課程</span>
                      <input
                        type="text"
                        value={courseSearch}
                        onChange={(e) => setCourseSearch(e.target.value)}
                        placeholder="搜尋課程名稱、分類或職人..."
                        className="w-full h-9 px-3 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] text-xs text-[#1b1c1c]"
                      />
                    </label>
                  </div>
                </div>

                {filteredCoursesForAdmin.length === 0 ? (
                  <div className="bg-white border border-[#e0d8d3] rounded-lg p-10 text-center text-sm text-[#51443d]">
                    無符合目前篩選條件的體驗課程，可調整狀態、授課職人或難度條件。
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {filteredCoursesForAdmin.map((c) => {
                      const statusKey = (c.courseStatus || 'recruiting') as CourseStatus;
                      const dateCount = c.sessionDates?.length || c.totalSessions || 1;
                      return (
                        <div
                          key={c.id}
                          className="bg-white border border-[#e0d8d3] rounded-lg p-5 flex gap-4 justify-between"
                        >
                          <div className="flex gap-4 min-w-0">
                            <div className="w-24 h-24 rounded-lg overflow-hidden border border-[#e0d8d3] shrink-0 bg-[#fcf9f8] flex items-center justify-center">
                              <MediaImage src={c.imageUrl} alt={c.title} className="w-full h-full object-contain" />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span
                                  className={`font-medium ${
                                    statusKey === 'recruiting'
                                      ? 'text-[#70472d]'
                                      : statusKey === 'ongoing'
                                      ? 'text-[#b0704c]'
                                      : 'text-[#51443d]/70'
                                  }`}
                                >
                                  {COURSE_STATUS_LABELS[statusKey]}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#73594c]">{c.category}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#73594c]">{c.level}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#51443d]">{c.isVisible ? '前台顯示中' : '已隱藏'}</span>
                              </div>
                              <h3 className="text-base font-serif text-[#1b1c1c] truncate">{c.title}</h3>
                              <p className="text-xs text-[#51443d] tabular-nums">
                                HK$ {c.price.toLocaleString()} · 名額 {c.maxSeats} 人 · {c.duration}
                              </p>
                              <p className="text-xs text-[#73594c] truncate tabular-nums">
                                導師：{c.artisanName || '未指派'} · 共 {dateCount} 堂
                                {c.sessionDates && c.sessionDates.length > 0
                                  ? `（${c.sessionDates.slice(0, 3).map((d) => d.slice(5).replace('-', '/')).join('、')}${
                                      c.sessionDates.length > 3 ? '…' : ''
                                    }）`
                                  : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingCourse(c)}
                              className="px-3 h-7 rounded-lg border border-[#e0d8d3] text-xs font-medium text-[#73594c] hover:bg-[#e8ded8]/50 cursor-pointer"
                            >
                              編輯
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await duplicateCourse(c, courses.length);
                                setCourses(await fetchCourses());
                                await onCatalogRefresh();
                              }}
                              className="inline-flex items-center justify-center gap-1 px-3 h-7 rounded-lg border border-[#e0d8d3] text-xs text-[#70472d] hover:bg-[#fcf9f8] cursor-pointer"
                              title="複製此課程建立新複本"
                            >
                              <Copy className="w-3 h-3" />
                              複製
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await saveCourse({ ...c, isVisible: !c.isVisible });
                                setCourses(await fetchCourses());
                                await onCatalogRefresh();
                              }}
                              className="px-3 h-7 rounded-lg border border-[#e0d8d3] text-xs text-[#51443d] hover:bg-[#f6f3f2] cursor-pointer"
                            >
                              {c.isVisible ? '隱藏' : '顯示'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteCourse(c.id);
                                setCourses(await fetchCourses());
                                await onCatalogRefresh();
                              }}
                              className="px-3 h-7 rounded-lg text-xs text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                            >
                              刪除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {catalogSubTab === 'artisans' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {artisans.map((a) => {
                  const linkedCourses = courses.filter(
                    (c) => c.artisanId === a.id || c.artisanName === a.name
                  );
                  const artSessions = instructorSessions.filter(
                    (s) => s.artisanId === a.id || s.artisanName === a.name
                  );
                  const leaveCount = artSessions.filter((s) => s.attendanceStatus === 'leave').length;
                  const totalPay = artSessions
                    .filter((s) => s.attendanceStatus !== 'cancelled')
                    .reduce((acc, s) => acc + (s.payAmount || 0), 0);

                  return (
                    <div
                      key={a.id}
                      className="bg-white border border-[#e0d8d3] rounded-lg p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="flex gap-4 justify-between">
                        <div className="flex gap-4 min-w-0">
                          <div className="w-20 h-20 rounded-lg overflow-hidden border border-[#e0d8d3] shrink-0 bg-[#fcf9f8] flex items-center justify-center">
                            <MediaImage src={a.avatarUrl} alt={a.name} className="w-full h-full object-contain" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs text-[#73594c]">
                              {a.isVisible ? '顯示中' : '已隱藏'} · 資歷 {a.yearsExperience} 年
                              {a.phone ? ` · ${a.phone}` : ''}
                            </p>
                            <h3 className="text-base font-serif text-[#1b1c1c]">{a.name}</h3>
                            <p className="text-xs text-[#51443d] truncate">{a.specialty}</p>
                            <p className="text-xs text-[#70472d] tabular-nums">
                              每堂預設課酬 HK$ {(a.defaultSessionPay ?? 0).toLocaleString()} · 已登錄{' '}
                              {artSessions.length} 堂（請假 {leaveCount}）· 累計 HK$ {totalPay.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingArtisan(a)}
                            className="px-3 h-8 rounded-lg border border-[#e0d8d3] text-xs text-[#73594c] cursor-pointer"
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteArtisan(a.id);
                              setArtisans(await fetchArtisans());
                              await onCatalogRefresh();
                            }}
                            className="px-3 h-8 rounded-lg text-xs text-[#ba1a1a] cursor-pointer"
                          >
                            刪除
                          </button>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#e0d8d3] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="text-[#51443d] min-w-0">
                          <span className="text-[#73594c]">授課關聯課程（{linkedCourses.length}）：</span>
                          {linkedCourses.length > 0 ? (
                            <span>{linkedCourses.map((c) => c.title).join('、')}</span>
                          ) : (
                            <span className="text-[#73594c]">尚未關聯任何課程</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountingArtisanFilter(a.name);
                            setTab('accounting');
                          }}
                          className="inline-flex items-center gap-1 px-3 h-7 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] text-[#70472d] font-medium hover:bg-[#e8ded8]/60 cursor-pointer shrink-0"
                        >
                          <Calendar className="w-3 h-3" />
                          管理課堂與薪金記錄
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {catalogSubTab === 'gallery' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {galleryWorks.map((g) => (
                  <div
                    key={g.id}
                    className="bg-white border border-[#e0d8d3] rounded-lg p-5 flex gap-4 justify-between"
                  >
                    <div className="flex gap-4 min-w-0">
                      <div className="w-24 h-20 rounded-lg overflow-hidden border border-[#e0d8d3] shrink-0 bg-[#fcf9f8] flex items-center justify-center">
                        <MediaImage src={g.imageUrl} alt={g.title} className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs text-[#73594c]">
                          {g.category} · {g.year} · {g.isVisible ? '顯示中' : '已隱藏'}
                        </p>
                        <h3 className="text-base font-serif text-[#1b1c1c] truncate">{g.title}</h3>
                        <p className="text-xs text-[#51443d]">{g.artisanName}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingGallery(g)}
                        className="px-3 h-8 rounded-lg border border-[#e0d8d3] text-xs text-[#73594c] cursor-pointer"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteGalleryWork(g.id);
                          setGalleryWorks(await fetchGalleryWorks());
                          await onCatalogRefresh();
                        }}
                        className="px-3 h-8 rounded-lg text-xs text-[#ba1a1a] cursor-pointer"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'payments' && hasPermission('payments') && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-serif text-[#1b1c1c]">課程報名管理與繳費核對同步通知</h2>
              <p className="text-sm text-[#51443d]">
                審核學員銀行轉帳後五碼或匯款憑證截圖，確認收款後系統將自動發送站內通知給該會員。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { k: 'all', l: `全部 (${enrollments.length})` },
                { k: 'awaiting_verification', l: '待核對匯款' },
                { k: 'pending_payment', l: '待學員匯款' },
                { k: 'paid', l: '已確認繳費' },
                { k: 'needs_revision', l: '需補件' },
                { k: 'refunded', l: '已退款' },
              ].map((f) => (
                <button
                  key={f.k}
                  type="button"
                  onClick={() => setPaymentFilter(f.k)}
                  className={`px-4 h-9 rounded-full text-xs font-medium cursor-pointer ${
                    paymentFilter === f.k
                      ? 'bg-[#8c5e43] text-white'
                      : 'bg-white border border-[#e0d8d3] text-[#73594c]'
                  }`}
                >
                  {f.l}
                </button>
              ))}
            </div>

            {filteredEnrollments.length === 0 ? (
              <div className="bg-white border border-[#e0d8d3] rounded-lg p-12 text-center text-sm text-[#51443d]">
                目前無符合篩選條件的報名紀錄。
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEnrollments.map((enr) => (
                  <div
                    key={enr.id}
                    className="bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-4 shadow-warm"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#e0d8d3] pb-3">
                      <div>
                        <p className="text-xs text-[#73594c] tabular-nums">
                          {enr.enrollmentCode} · {formatDateTime(enr.createdAt)}
                        </p>
                        <h3 className="text-lg font-serif text-[#1b1c1c]">{enr.courseTitle}</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base font-serif text-[#70472d] tabular-nums">
                          HK$ {enr.totalAmount.toLocaleString()}
                        </span>
                        <span
                          className={`px-3.5 h-7 inline-flex items-center rounded-full text-xs font-medium ${
                            enr.paymentStatus === 'paid'
                              ? 'bg-[#e8ded8] text-[#70472d]'
                              : enr.paymentStatus === 'needs_revision' || enr.paymentStatus === 'refunded'
                              ? 'bg-[#ffdad6] text-[#93000a]'
                              : 'bg-[#f6f3f2] text-[#b0704c] border border-[#e0d8d3]'
                          }`}
                        >
                          {enr.paymentStatus === 'paid'
                            ? '已確認收款'
                            : enr.paymentStatus === 'awaiting_verification'
                            ? '待核對收款'
                            : enr.paymentStatus === 'pending_payment'
                            ? '尚未提交匯款'
                            : enr.paymentStatus === 'needs_revision'
                            ? '退回補件'
                            : enr.paymentStatus === 'refunded'
                            ? `已退款 HK$ ${(enr.refundAmount ?? enr.totalAmount).toLocaleString()}`
                            : '已取消'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-[#51443d]">
                      <div>
                        <p className="text-xs text-[#73594c]">報名學員</p>
                        <p className="font-medium text-[#1b1c1c]">{enr.memberName}</p>
                        <p className="text-xs tabular-nums">{enr.memberPhone}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#73594c]">繳費方式與憑證</p>
                        <p>
                          {enr.paymentMethod === 'online_card' ? '線上模擬即時付款' : '銀行轉帳'}
                          {enr.cardLastFour ? `（末四碼 ${enr.cardLastFour}）` : ''}
                          {enr.transferLastFive ? `（後五碼 ${enr.transferLastFive}）` : ''}
                        </p>
                        {enr.studentNote && <p className="text-xs">學員備註：{enr.studentNote}</p>}
                        {enr.paymentStatus === 'refunded' && enr.refundReason && (
                          <p className="text-xs text-[#ba1a1a]">退款說明：{enr.refundReason}</p>
                        )}
                      </div>
                      <div>
                        {enr.receiptMediaId && (
                          <div className="w-32 h-24 rounded border border-[#e0d8d3] overflow-hidden bg-[#fcf9f8] flex items-center justify-center">
                            <MediaImage
                              src={`media://${enr.receiptMediaId}`}
                              alt="匯款憑證"
                              className="w-full h-full object-contain"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#e0d8d3]">
                      <button
                        type="button"
                        onClick={() => {
                          setVerifyingEnrollment(enr);
                          setVerifyNote(enr.adminNote || '');
                          setRefundAmount(enr.refundAmount ?? enr.totalAmount);
                          setRefundReason(enr.refundReason || '');
                        }}
                        className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        審核繳費狀態／辦理退款
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteEnrollment(enr.id);
                          setEnrollments(await fetchAllEnrollments());
                        }}
                        className="px-3 h-9 rounded-lg text-xs text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                      >
                        刪除紀錄
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'accounting' && hasPermission('accounting') && (
          <AdminAccounting
            courses={courses}
            artisans={artisans}
            enrollments={enrollments}
            instructorSessions={instructorSessions}
            initialArtisanFilter={accountingArtisanFilter}
            onSessionsRefresh={async () => setInstructorSessions(await fetchInstructorSessions())}
          />
        )}

        {tab === 'members' && hasPermission('members') && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-serif text-[#1b1c1c]">會員資料管理</h2>
                <p className="text-sm text-[#51443d]">
                  新增、修改、停權或刪除學員會員資料，並可協助學員重設 6 位數登入 PIN 碼。
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingMember({
                    phone: '',
                    name: '',
                    email: '',
                    newPin: '',
                    notes: '',
                    status: 'active',
                  })
                }
                className="inline-flex items-center gap-1.5 px-5 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                新增會員
              </button>
            </div>

            <label className="block space-y-1.5 max-w-md">
              <span className="block text-xs font-medium text-[#51443d]">搜尋學員會員</span>
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="輸入會員姓名或手提電話號碼..."
                className="w-full h-11 px-4 rounded-lg bg-white border border-[#e0d8d3] text-sm"
              />
            </label>

            <div className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#f6f3f2] text-xs text-[#51443d] border-b border-[#e0d8d3]">
                    <tr>
                      <th className="px-5 py-3 font-medium">姓名</th>
                      <th className="px-4 py-3 font-medium">手提電話</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">狀態</th>
                      <th className="px-5 py-3 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0d8d3]">
                    {filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-sm text-[#51443d]">
                          尚無符合條件的會員資料
                        </td>
                      </tr>
                    ) : (
                      filteredMembers.map((m) => (
                        <tr key={m.id} className="hover:bg-[#fcf9f8]">
                          <td className="px-5 py-3.5 font-medium text-[#1b1c1c]">{m.name}</td>
                          <td className="px-4 py-3.5 tabular-nums text-[#51443d]">{m.phone}</td>
                          <td className="px-4 py-3.5 text-[#51443d]">{m.email || '—'}</td>
                          <td className="px-4 py-3.5 text-xs">
                            <span
                              className={
                                m.status === 'active' ? 'text-[#70472d]' : 'text-[#ba1a1a]'
                              }
                            >
                              {m.status === 'active' ? '正常使用' : '已停權'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingMember({
                                  id: m.id,
                                  ownerUid: m.ownerUid,
                                  phone: m.phone,
                                  name: m.name,
                                  email: m.email,
                                  newPin: '',
                                  existingPinHash: m.pinHash,
                                  notes: m.notes,
                                  status: m.status,
                                  createdAt: m.createdAt,
                                })
                              }
                              className="px-3 h-8 rounded-lg border border-[#e0d8d3] text-xs text-[#73594c] cursor-pointer"
                            >
                              修改 / 重設 PIN
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteMember(m.id);
                                setMembers(await fetchAllMembers());
                              }}
                              className="px-3 h-8 rounded-lg text-xs text-[#ba1a1a] cursor-pointer"
                            >
                              刪除
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'forms' && hasPermission('forms') && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-serif text-[#1b1c1c]">前台聯絡與預約表單資料匣</h2>
              <p className="text-sm text-[#51443d]">
                檢視所有訪客透過前台表單提交的預約與包場諮詢，並更新處理進度。
              </p>
            </div>

            {submissions.length === 0 ? (
              <div className="bg-white border border-[#e0d8d3] rounded-lg p-12 text-center text-sm text-[#51443d]">
                目前尚未收到任何聯絡預約表單資料。
              </div>
            ) : (
              <div className="space-y-4">
                {submissions.map((sub) => (
                  <div
                    key={sub.id}
                    className="bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0d8d3] pb-3">
                      <div>
                        <p className="text-xs text-[#73594c] tabular-nums">
                          {sub.inquiryType} · {formatDateTime(sub.createdAt)}
                        </p>
                        <h3 className="text-lg font-serif text-[#1b1c1c]">
                          {sub.name}（{sub.phone}）
                        </h3>
                        {sub.email && <p className="text-xs text-[#51443d]">{sub.email}</p>}
                      </div>

                      <div className="flex items-end gap-2">
                        <label className="block space-y-1">
                          <span className="block text-[11px] font-medium text-[#51443d]">處理狀態</span>
                          <select
                            value={sub.status}
                            onChange={async (e) => {
                              await updateContactSubmission(
                                sub,
                                e.target.value as ContactSubmission['status'],
                                sub.adminReplyNote
                              );
                              setSubmissions(await fetchAllContactSubmissions());
                            }}
                            className="h-9 px-3 rounded-lg border border-[#e0d8d3] text-xs bg-[#fcf9f8]"
                          >
                            <option value="new">新進表單</option>
                            <option value="in_progress">聯繫處理中</option>
                            <option value="resolved">已結案</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteContactSubmission(sub.id);
                            setSubmissions(await fetchAllContactSubmissions());
                          }}
                          className="p-2 rounded-lg text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                          aria-label="刪除表單紀錄"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <p className="text-sm text-[#1b1c1c] whitespace-pre-line">{sub.message}</p>

                    <label className="block space-y-1">
                      <span className="block text-xs font-medium text-[#51443d]">
                        內部跟進處理備註（離開輸入框自動儲存）
                      </span>
                      <input
                        type="text"
                        defaultValue={sub.adminReplyNote}
                        onBlur={async (e) => {
                          if (e.target.value !== sub.adminReplyNote) {
                            await updateContactSubmission(sub, sub.status, e.target.value);
                            setSubmissions(await fetchAllContactSubmissions());
                          }
                        }}
                        placeholder="輸入跟進聯絡進度或備忘事項..."
                        className="w-full h-10 px-3.5 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] text-xs"
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'admins' && hasPermission('admins') && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-serif text-[#1b1c1c]">多管理員帳號與權限矩陣設定</h2>
                <p className="text-sm text-[#51443d]">
                  可新增不同部門的管理員帳號（以手機號碼與 6 位 PIN 登入），並針對每位管理員勾選可操作的模組權限。
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingAdmin({
                    phone: '',
                    name: '',
                    roleTitle: '課程與 CMS 編輯員',
                    boundEmail: '',
                    newPin: '',
                    isSuperAdmin: false,
                    isActive: true,
                    permissions: { ...DEFAULT_PERMS },
                  })
                }
                className="inline-flex items-center gap-1.5 px-5 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                新增管理員帳號
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {adminUsers.map((adm) => (
                <div
                  key={adm.id}
                  className="bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-4 shadow-warm"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-[#e0d8d3] pb-3">
                    <div>
                      <p className="text-xs text-[#73594c]">
                        {adm.isSuperAdmin ? '超級管理員（全部權限）' : adm.roleTitle} ·{' '}
                        {adm.isActive ? '啟用中' : '已停用'}
                      </p>
                      <h3 className="text-lg font-serif text-[#1b1c1c]">{adm.name}</h3>
                      <p className="text-xs text-[#51443d] tabular-nums">登入電話：{adm.phone}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingAdmin({
                            id: adm.id,
                            phone: adm.phone,
                            name: adm.name,
                            roleTitle: adm.roleTitle,
                            boundEmail: adm.boundEmail,
                            newPin: '',
                            existingPinHash: adm.pinHash,
                            isSuperAdmin: adm.isSuperAdmin,
                            isActive: adm.isActive,
                            permissions: { ...adm.permissions },
                            createdAt: adm.createdAt,
                          })
                        }
                        className="px-3 h-8 rounded-lg border border-[#e0d8d3] text-xs text-[#73594c] cursor-pointer"
                      >
                        權限設定
                      </button>
                      {!adm.isSuperAdmin && (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteAdminUser(adm.id);
                            setAdminUsers(await fetchAllAdminUsers());
                          }}
                          className="px-3 h-8 rounded-lg text-xs text-[#ba1a1a] cursor-pointer"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {PERMISSION_LABELS.map((p) => {
                      const enabled = adm.isSuperAdmin || adm.permissions[p.key];
                      return (
                        <span
                          key={p.key}
                          className={`px-2.5 py-1 rounded text-[11px] border ${
                            enabled
                              ? 'bg-[#e8ded8]/60 border-[#8c5e43]/40 text-[#70472d]'
                              : 'bg-[#fcf9f8] border-[#e0d8d3] text-[#51443d]/50 line-through'
                          }`}
                        >
                          {p.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Course Edit Modal */}
      {editingCourse && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#e0d8d3] rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col shadow-warm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0d8d3]">
              <h3 className="text-lg font-serif text-[#1b1c1c]">
                {editingCourse.id ? '編輯體驗課程' : '新增體驗課程'}
              </h3>
              <button type="button" onClick={() => setEditingCourse(null)} className="cursor-pointer">
                <X className="w-5 h-5 text-[#51443d]" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <p className="text-xs text-[#73594c] bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg px-3.5 py-2">
                每個下拉式清單各選項末端均有「×」按鈕可刪除不適用選項；每個欄位皆可於右上方控制前台「顯示中 / 已隱藏」。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextFieldWithVisibility
                  label="課程名稱 *"
                  value={editingCourse.title || ''}
                  onChange={(val) => setEditingCourse({ ...editingCourse, title: val })}
                  placeholder="例如：赤陶手拉坯：日常溫潤飯碗與小鉢"
                  visible={isFieldVisible(editingCourse.fieldVisibility, 'title')}
                  onToggleVisible={(next) =>
                    setEditingCourse({
                      ...editingCourse,
                      fieldVisibility: { ...(editingCourse.fieldVisibility || {}), title: next },
                    })
                  }
                />
                <OptionOrCustomField
                  label="工藝分類 *"
                  value={editingCourse.category || ''}
                  onChange={(val) => setEditingCourse({ ...editingCourse, category: val })}
                  options={COURSE_CATEGORY_OPTIONS}
                  optionStorageKey="course_category"
                  placeholder="輸入自訂工藝分類..."
                  visible={isFieldVisible(editingCourse.fieldVisibility, 'category')}
                  onToggleVisible={(next) =>
                    setEditingCourse({
                      ...editingCourse,
                      fieldVisibility: { ...(editingCourse.fieldVisibility || {}), category: next },
                    })
                  }
                />
                <NumberFieldWithVisibility
                  label="課程費用（港幣 HK$） *"
                  value={editingCourse.price ?? 0}
                  onChange={(val) => setEditingCourse({ ...editingCourse, price: val })}
                  min={0}
                  placeholder="例如：680"
                  visible={isFieldVisible(editingCourse.fieldVisibility, 'price')}
                  onToggleVisible={(next) =>
                    setEditingCourse({
                      ...editingCourse,
                      fieldVisibility: { ...(editingCourse.fieldVisibility || {}), price: next },
                    })
                  }
                />
                <NumberFieldWithVisibility
                  label="最大招生名額（人） *"
                  value={editingCourse.maxSeats ?? 6}
                  onChange={(val) => setEditingCourse({ ...editingCourse, maxSeats: val })}
                  min={1}
                  placeholder="例如：6"
                  visible={isFieldVisible(editingCourse.fieldVisibility, 'maxSeats')}
                  onToggleVisible={(next) =>
                    setEditingCourse({
                      ...editingCourse,
                      fieldVisibility: { ...(editingCourse.fieldVisibility || {}), maxSeats: next },
                    })
                  }
                />

                {/* Course Recruitment Status */}
                <div className="space-y-1.5">
                  <FieldLabelHeader
                    label="課程狀態（招生中／開課中／已完結）"
                    visible={isFieldVisible(editingCourse.fieldVisibility, 'courseStatus')}
                    onToggleVisible={(next) =>
                      setEditingCourse({
                        ...editingCourse,
                        fieldVisibility: {
                          ...(editingCourse.fieldVisibility || {}),
                          courseStatus: next,
                        },
                      })
                    }
                  />
                  <select
                    value={editingCourse.courseStatus || 'recruiting'}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        courseStatus: e.target.value as CourseStatus,
                      })
                    }
                    className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm text-[#1b1c1c] focus:outline-none focus:border-[#8c5e43]"
                  >
                    <option value="recruiting">招生中</option>
                    <option value="ongoing">開課中</option>
                    <option value="completed">已完結</option>
                  </select>
                </div>

                {/* Instructor Pay Per Session (Internal Accounting) */}
                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[#51443d]">
                    導師每堂授課課酬（港幣 HK$，內部會計計算用）
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={editingCourse.instructorPayPerSession ?? 0}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        instructorPayPerSession: Number(e.target.value),
                      })
                    }
                    placeholder="例如：1200"
                    className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
                  />
                </label>

                <OptionOrCustomField
                  label="授課職人姓名"
                  value={editingCourse.artisanName || ''}
                  onChange={(val) => {
                    const matched = artisans.find((a) => a.name === val);
                    setEditingCourse({
                      ...editingCourse,
                      artisanName: val,
                      artisanId: matched?.id || editingCourse.artisanId || '',
                      instructorPayPerSession:
                        editingCourse.instructorPayPerSession ||
                        matched?.defaultSessionPay ||
                        0,
                    });
                  }}
                  options={Array.from(
                    new Set([...artisans.map((a) => a.name), '陳清和', '林沐恩', '葉書嫻'].filter(Boolean))
                  )}
                  optionStorageKey="course_artisan"
                  placeholder="輸入客座或自訂職人姓名..."
                  visible={isFieldVisible(editingCourse.fieldVisibility, 'artisanName')}
                  onToggleVisible={(next) =>
                    setEditingCourse({
                      ...editingCourse,
                      fieldVisibility: { ...(editingCourse.fieldVisibility || {}), artisanName: next },
                    })
                  }
                />
                <OptionOrCustomField
                  label="適合難度程度"
                  value={editingCourse.level || ''}
                  onChange={(val) => setEditingCourse({ ...editingCourse, level: val })}
                  options={COURSE_LEVEL_OPTIONS}
                  optionStorageKey="course_level"
                  placeholder="輸入自訂適合難度（如：零基礎親子共學）..."
                  visible={isFieldVisible(editingCourse.fieldVisibility, 'level')}
                  onToggleVisible={(next) =>
                    setEditingCourse({
                      ...editingCourse,
                      fieldVisibility: { ...(editingCourse.fieldVisibility || {}), level: next },
                    })
                  }
                />
                <div className="sm:col-span-2">
                  <OptionOrCustomField
                    label="上課地點"
                    value={editingCourse.location || ''}
                    onChange={(val) => setEditingCourse({ ...editingCourse, location: val })}
                    options={COURSE_LOCATION_OPTIONS}
                    optionStorageKey="course_location"
                    placeholder="輸入自訂上課地點..."
                    visible={isFieldVisible(editingCourse.fieldVisibility, 'location')}
                    onToggleVisible={(next) =>
                      setEditingCourse({
                        ...editingCourse,
                        fieldVisibility: { ...(editingCourse.fieldVisibility || {}), location: next },
                      })
                    }
                  />
                </div>
              </div>

              {/* Class Time Slot (Auto Calculates Duration: e.g. 12:00-13:15 (1 小時 15分鐘)) */}
              <div className="bg-[#fcf9f8] border border-[#e0d8d3] rounded-lg p-4 space-y-3">
                <FieldLabelHeader
                  label="開課時段（系統自動計算上課至下課時間與總時數） *"
                  visible={isFieldVisible(editingCourse.fieldVisibility, 'duration')}
                  onToggleVisible={(next) =>
                    setEditingCourse({
                      ...editingCourse,
                      fieldVisibility: { ...(editingCourse.fieldVisibility || {}), duration: next },
                    })
                  }
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block space-y-1">
                    <span className="block text-xs text-[#51443d]">開始上課時間</span>
                    <input
                      type="time"
                      value={editingCourse.startTime || '12:00'}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        const nextEnd = editingCourse.endTime || '13:15';
                        const calc = calculateTimeRangeDisplay(nextStart, nextEnd);
                        const nextSchedule = buildScheduleText({
                          sessionDates: editingCourse.sessionDates,
                          totalSessions: editingCourse.totalSessions,
                          startTime: nextStart,
                          endTime: nextEnd,
                          fallbackText: editingCourse.scheduleText,
                        });
                        setEditingCourse({
                          ...editingCourse,
                          startTime: nextStart,
                          duration: calc.fullDisplay || editingCourse.duration,
                          scheduleText: nextSchedule,
                        });
                      }}
                      className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="block text-xs text-[#51443d]">下課結束時間</span>
                    <input
                      type="time"
                      value={editingCourse.endTime || '13:15'}
                      onChange={(e) => {
                        const nextStart = editingCourse.startTime || '12:00';
                        const nextEnd = e.target.value;
                        const calc = calculateTimeRangeDisplay(nextStart, nextEnd);
                        const nextSchedule = buildScheduleText({
                          sessionDates: editingCourse.sessionDates,
                          totalSessions: editingCourse.totalSessions,
                          startTime: nextStart,
                          endTime: nextEnd,
                          fallbackText: editingCourse.scheduleText,
                        });
                        setEditingCourse({
                          ...editingCourse,
                          endTime: nextEnd,
                          duration: calc.fullDisplay || editingCourse.duration,
                          scheduleText: nextSchedule,
                        });
                      }}
                      className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
                    />
                  </label>
                </div>
                <div className="bg-white border border-[#e0d8d3] rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[#73594c]">前台頁面將自動顯示開課至下課時間：</span>
                  <strong className="text-[#70472d] font-serif text-sm tabular-nums">
                    {calculateTimeRangeDisplay(
                      editingCourse.startTime || '12:00',
                      editingCourse.endTime || '13:15'
                    ).fullDisplay || editingCourse.duration}
                  </strong>
                </div>
              </div>

              {/* Calendar Multi-Date Picker Linked with 開課時段說明 */}
              <div className="space-y-3">
                <FieldLabelHeader
                  label="開課堂數與上課日子選擇（連動開課時段說明）"
                  visible={isFieldVisible(editingCourse.fieldVisibility, 'scheduleText')}
                  onToggleVisible={(next) =>
                    setEditingCourse({
                      ...editingCourse,
                      fieldVisibility: {
                        ...(editingCourse.fieldVisibility || {}),
                        scheduleText: next,
                      },
                    })
                  }
                />
                <CalendarMultiDatePicker
                  totalSessions={editingCourse.totalSessions ?? 1}
                  selectedDates={editingCourse.sessionDates || []}
                  onTotalSessionsChange={(nextTotal) => {
                    const nextSchedule = buildScheduleText({
                      sessionDates: editingCourse.sessionDates,
                      totalSessions: nextTotal,
                      startTime: editingCourse.startTime,
                      endTime: editingCourse.endTime,
                      fallbackText: editingCourse.scheduleText,
                    });
                    setEditingCourse({
                      ...editingCourse,
                      totalSessions: nextTotal,
                      scheduleText: nextSchedule,
                    });
                  }}
                  onDatesChange={(nextDates) => {
                    const nextSchedule = buildScheduleText({
                      sessionDates: nextDates,
                      totalSessions: editingCourse.totalSessions ?? Math.max(1, nextDates.length),
                      startTime: editingCourse.startTime,
                      endTime: editingCourse.endTime,
                      fallbackText: editingCourse.scheduleText,
                    });
                    setEditingCourse({
                      ...editingCourse,
                      sessionDates: nextDates,
                      scheduleText: nextSchedule,
                    });
                  }}
                />
                <OptionOrCustomField
                  label="開課時段說明（已與月曆與開課時間自動連繫，亦可補充備註）"
                  value={editingCourse.scheduleText || ''}
                  onChange={(val) => setEditingCourse({ ...editingCourse, scheduleText: val })}
                  options={[
                    buildScheduleText({
                      sessionDates: editingCourse.sessionDates,
                      totalSessions: editingCourse.totalSessions,
                      startTime: editingCourse.startTime,
                      endTime: editingCourse.endTime,
                    }),
                    ...COURSE_SCHEDULE_OPTIONS,
                  ].filter(Boolean)}
                  optionStorageKey="course_schedule"
                  placeholder="輸入自訂開課時段說明..."
                />
              </div>

              <TextAreaFieldWithVisibility
                label="課程簡述（顯示於列表卡片）"
                rows={2}
                value={editingCourse.summary || ''}
                onChange={(val) => setEditingCourse({ ...editingCourse, summary: val })}
                placeholder="請輸入 1–2 句課程重點介紹..."
                visible={isFieldVisible(editingCourse.fieldVisibility, 'summary')}
                onToggleVisible={(next) =>
                  setEditingCourse({
                    ...editingCourse,
                    fieldVisibility: { ...(editingCourse.fieldVisibility || {}), summary: next },
                  })
                }
              />
              <TextAreaFieldWithVisibility
                label="詳細課程內容介紹"
                rows={3}
                value={editingCourse.description || ''}
                onChange={(val) => setEditingCourse({ ...editingCourse, description: val })}
                placeholder="請輸入課程教學步驟、體驗內容與作品燒製領取說明..."
                visible={isFieldVisible(editingCourse.fieldVisibility, 'description')}
                onToggleVisible={(next) =>
                  setEditingCourse({
                    ...editingCourse,
                    fieldVisibility: { ...(editingCourse.fieldVisibility || {}), description: next },
                  })
                }
              />
              <OptionOrCustomField
                label="包含材料與工具"
                value={editingCourse.materialsIncluded || ''}
                onChange={(val) => setEditingCourse({ ...editingCourse, materialsIncluded: val })}
                options={COURSE_MATERIALS_OPTIONS}
                optionStorageKey="course_materials"
                multilineCustom
                rows={2}
                placeholder="請輸入自訂包含材料與工具說明..."
                visible={isFieldVisible(editingCourse.fieldVisibility, 'materialsIncluded')}
                onToggleVisible={(next) =>
                  setEditingCourse({
                    ...editingCourse,
                    fieldVisibility: {
                      ...(editingCourse.fieldVisibility || {}),
                      materialsIncluded: next,
                    },
                  })
                }
              />
              <MediaPickerButton
                label="課程封面圖片"
                value={editingCourse.imageUrl || ''}
                onChange={(url) => setEditingCourse({ ...editingCourse, imageUrl: url })}
                category="course"
                mediaAssets={mediaAssets}
                onUploaded={(a) => setMediaAssets((prev) => [a, ...prev])}
              />
              <div className="flex gap-4 pt-2">
                <label className="inline-flex items-center gap-2 text-xs text-[#51443d] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingCourse.isVisible)}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, isVisible: e.target.checked })
                    }
                  />
                  前台公開顯示此課程
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-[#51443d] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingCourse.imageVisible)}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, imageVisible: e.target.checked })
                    }
                  />
                  顯示課程圖片
                </label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e0d8d3] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                className="px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  const sTime = editingCourse.startTime || '12:00';
                  const eTime = editingCourse.endTime || '13:15';
                  const calc = calculateTimeRangeDisplay(sTime, eTime);
                  const computedDuration = calc.isValid
                    ? calc.fullDisplay
                    : editingCourse.duration || '12:00-13:15 (1 小時 15分鐘)';
                  const computedSchedule =
                    editingCourse.scheduleText ||
                    buildScheduleText({
                      sessionDates: editingCourse.sessionDates,
                      totalSessions: editingCourse.totalSessions,
                      startTime: sTime,
                      endTime: eTime,
                    });

                  await saveCourse({
                    id: editingCourse.id,
                    title: editingCourse.title || '未命名課程',
                    category: editingCourse.category || '陶藝拉坯',
                    level: editingCourse.level || '初學入門',
                    duration: computedDuration,
                    startTime: sTime,
                    endTime: eTime,
                    totalSessions: editingCourse.totalSessions ?? Math.max(1, editingCourse.sessionDates?.length || 1),
                    sessionDates: editingCourse.sessionDates || [],
                    courseStatus: (editingCourse.courseStatus || 'recruiting') as CourseStatus,
                    instructorPayPerSession: Number(editingCourse.instructorPayPerSession ?? 0),
                    price: editingCourse.price ?? 680,
                    maxSeats: editingCourse.maxSeats ?? 6,
                    enrolledCount: editingCourse.enrolledCount ?? 0,
                    scheduleText: computedSchedule,
                    location: editingCourse.location || '將軍澳工坊本館',
                    summary: editingCourse.summary || '',
                    description: editingCourse.description || '',
                    materialsIncluded: editingCourse.materialsIncluded || '含工坊材料與工具',
                    imageUrl: editingCourse.imageUrl || '',
                    imageVisible: Boolean(editingCourse.imageVisible),
                    artisanId: editingCourse.artisanId || '',
                    artisanName: editingCourse.artisanName || '',
                    isVisible: Boolean(editingCourse.isVisible),
                    order: editingCourse.order ?? 1,
                    fieldVisibility: editingCourse.fieldVisibility || {},
                    createdAt: editingCourse.createdAt,
                  });
                  setEditingCourse(null);
                  setCourses(await fetchCourses());
                  await onCatalogRefresh();
                }}
                className="px-6 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium cursor-pointer"
              >
                儲存課程資料
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Artisan Edit Modal */}
      {editingArtisan && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#e0d8d3] rounded-lg max-w-xl w-full p-6 space-y-4 shadow-warm max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-serif text-[#1b1c1c]">
              {editingArtisan.id ? '編輯職人資料與關聯課程' : '新增駐店職人'}
            </h3>
            <p className="text-xs text-[#73594c] bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg px-3.5 py-2">
              每個欄位皆可於右上方點擊「顯示中 / 已隱藏」獨立控制是否在前台顯示；下方可直接查看此職人對應的授課課程。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextFieldWithVisibility
                label="職人姓名 *"
                value={editingArtisan.name || ''}
                onChange={(val) => setEditingArtisan({ ...editingArtisan, name: val })}
                placeholder="例如：陳清和"
                visible={isFieldVisible(editingArtisan.fieldVisibility, 'name')}
                onToggleVisible={(next) =>
                  setEditingArtisan({
                    ...editingArtisan,
                    fieldVisibility: { ...(editingArtisan.fieldVisibility || {}), name: next },
                  })
                }
              />
              <NumberFieldWithVisibility
                label="工藝資歷年數（年）"
                value={editingArtisan.yearsExperience ?? 5}
                onChange={(val) => setEditingArtisan({ ...editingArtisan, yearsExperience: val })}
                min={0}
                placeholder="例如：12"
                visible={isFieldVisible(editingArtisan.fieldVisibility, 'yearsExperience')}
                onToggleVisible={(next) =>
                  setEditingArtisan({
                    ...editingArtisan,
                    fieldVisibility: {
                      ...(editingArtisan.fieldVisibility || {}),
                      yearsExperience: next,
                    },
                  })
                }
              />
              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[#51443d]">聯絡電話（後台內部用）</span>
                <input
                  type="tel"
                  value={editingArtisan.phone || ''}
                  onChange={(e) => setEditingArtisan({ ...editingArtisan, phone: e.target.value })}
                  placeholder="例如：9123 4567"
                  className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[#51443d]">每堂預設課酬（港幣 HK$）</span>
                <input
                  type="number"
                  min={0}
                  value={editingArtisan.defaultSessionPay ?? 1000}
                  onChange={(e) =>
                    setEditingArtisan({
                      ...editingArtisan,
                      defaultSessionPay: Number(e.target.value),
                    })
                  }
                  placeholder="例如：1200"
                  className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
                />
              </label>
            </div>
            <OptionOrCustomField
              label="專長領域"
              value={editingArtisan.specialty || ''}
              onChange={(val) => setEditingArtisan({ ...editingArtisan, specialty: val })}
              options={ARTISAN_SPECIALTY_OPTIONS}
              optionStorageKey="artisan_specialty"
              placeholder="輸入自訂專長領域..."
              visible={isFieldVisible(editingArtisan.fieldVisibility, 'specialty')}
              onToggleVisible={(next) =>
                setEditingArtisan({
                  ...editingArtisan,
                  fieldVisibility: { ...(editingArtisan.fieldVisibility || {}), specialty: next },
                })
              }
            />
            <TextFieldWithVisibility
              label="職人代表引言"
              value={editingArtisan.quote || ''}
              onChange={(val) => setEditingArtisan({ ...editingArtisan, quote: val })}
              placeholder="例如：器皿真正的完成，是在每日盛裝食物與茶湯的那一刻。"
              visible={isFieldVisible(editingArtisan.fieldVisibility, 'quote')}
              onToggleVisible={(next) =>
                setEditingArtisan({
                  ...editingArtisan,
                  fieldVisibility: { ...(editingArtisan.fieldVisibility || {}), quote: next },
                })
              }
            />
            <TextAreaFieldWithVisibility
              label="詳細職人簡介"
              rows={3}
              value={editingArtisan.bio || ''}
              onChange={(val) => setEditingArtisan({ ...editingArtisan, bio: val })}
              placeholder="請輸入職人的創作背景、經歷與教學理念..."
              visible={isFieldVisible(editingArtisan.fieldVisibility, 'bio')}
              onToggleVisible={(next) =>
                setEditingArtisan({
                  ...editingArtisan,
                  fieldVisibility: { ...(editingArtisan.fieldVisibility || {}), bio: next },
                })
              }
            />

            {/* Linked Courses Preview */}
            {editingArtisan.name && (
              <div className="bg-[#fcf9f8] border border-[#e0d8d3] rounded-lg p-3.5 space-y-2">
                <p className="text-xs font-medium text-[#51443d]">
                  目前已與此職人對應關聯的體驗課程：
                </p>
                {courses.filter(
                  (c) =>
                    c.artisanName === editingArtisan.name ||
                    (editingArtisan.id && c.artisanId === editingArtisan.id)
                ).length === 0 ? (
                  <p className="text-xs text-[#73594c]">
                    尚無課程指定「{editingArtisan.name}」為授課職人（可在體驗課程編輯頁指派）。
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs text-[#1b1c1c]">
                    {courses
                      .filter(
                        (c) =>
                          c.artisanName === editingArtisan.name ||
                          (editingArtisan.id && c.artisanId === editingArtisan.id)
                      )
                      .map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span>• {c.title}</span>
                          <span className="text-[#73594c] tabular-nums">
                            {c.duration} · 每堂課酬 HK$ {(c.instructorPayPerSession ?? editingArtisan.defaultSessionPay ?? 0).toLocaleString()}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}

            <MediaPickerButton
              label="職人頭像圖片"
              value={editingArtisan.avatarUrl || ''}
              onChange={(url) => setEditingArtisan({ ...editingArtisan, avatarUrl: url })}
              category="artisan"
              mediaAssets={mediaAssets}
              onUploaded={(a) => setMediaAssets((prev) => [a, ...prev])}
            />
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(editingArtisan.isVisible)}
                  onChange={(e) =>
                    setEditingArtisan({ ...editingArtisan, isVisible: e.target.checked })
                  }
                />
                前台顯示
              </label>
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(editingArtisan.imageVisible)}
                  onChange={(e) =>
                    setEditingArtisan({ ...editingArtisan, imageVisible: e.target.checked })
                  }
                />
                顯示照片
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingArtisan(null)}
                className="px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  await saveArtisan({
                    id: editingArtisan.id,
                    name: editingArtisan.name || '駐店職人',
                    specialty: editingArtisan.specialty || '',
                    yearsExperience: editingArtisan.yearsExperience ?? 5,
                    phone: editingArtisan.phone || '',
                    defaultSessionPay: Number(editingArtisan.defaultSessionPay ?? 0),
                    quote: editingArtisan.quote || '',
                    bio: editingArtisan.bio || '',
                    avatarUrl: editingArtisan.avatarUrl || '',
                    imageVisible: Boolean(editingArtisan.imageVisible),
                    isVisible: Boolean(editingArtisan.isVisible),
                    order: editingArtisan.order ?? 1,
                    fieldVisibility: editingArtisan.fieldVisibility || {},
                    createdAt: editingArtisan.createdAt,
                  });
                  setEditingArtisan(null);
                  setArtisans(await fetchArtisans());
                  await onCatalogRefresh();
                }}
                className="px-6 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium cursor-pointer"
              >
                儲存職人
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery Edit Modal */}
      {editingGallery && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#e0d8d3] rounded-lg max-w-xl w-full p-6 space-y-4 shadow-warm max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-serif text-[#1b1c1c]">
              {editingGallery.id ? '編輯藝廊作品' : '新增藝廊作品'}
            </h3>
            <p className="text-xs text-[#73594c] bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg px-3.5 py-2">
              每個欄位皆可於右上方點擊「顯示中 / 已隱藏」獨立控制是否在前台顯示；選擇「自訂（自行輸入）」即可自由填寫。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextFieldWithVisibility
                label="作品標題 *"
                value={editingGallery.title || ''}
                onChange={(val) => setEditingGallery({ ...editingGallery, title: val })}
                placeholder="例如：山嵐灰釉茶倉"
                visible={isFieldVisible(editingGallery.fieldVisibility, 'title')}
                onToggleVisible={(next) =>
                  setEditingGallery({
                    ...editingGallery,
                    fieldVisibility: { ...(editingGallery.fieldVisibility || {}), title: next },
                  })
                }
              />
              <OptionOrCustomField
                label="工藝類別"
                value={editingGallery.category || ''}
                onChange={(val) => setEditingGallery({ ...editingGallery, category: val })}
                options={COURSE_CATEGORY_OPTIONS}
                placeholder="輸入自訂工藝類別..."
                visible={isFieldVisible(editingGallery.fieldVisibility, 'category')}
                onToggleVisible={(next) =>
                  setEditingGallery({
                    ...editingGallery,
                    fieldVisibility: { ...(editingGallery.fieldVisibility || {}), category: next },
                  })
                }
              />
              <OptionOrCustomField
                label="創作者名稱"
                value={editingGallery.artisanName || ''}
                onChange={(val) => setEditingGallery({ ...editingGallery, artisanName: val })}
                options={Array.from(
                  new Set([...artisans.map((a) => a.name), '陳清和', '林木生', '蘇若水'].filter(Boolean))
                )}
                placeholder="輸入自訂創作者姓名..."
                visible={isFieldVisible(editingGallery.fieldVisibility, 'artisanName')}
                onToggleVisible={(next) =>
                  setEditingGallery({
                    ...editingGallery,
                    fieldVisibility: {
                      ...(editingGallery.fieldVisibility || {}),
                      artisanName: next,
                    },
                  })
                }
              />
              <OptionOrCustomField
                label="創作年份"
                value={editingGallery.year || ''}
                onChange={(val) => setEditingGallery({ ...editingGallery, year: val })}
                options={GALLERY_YEAR_OPTIONS}
                placeholder="輸入自訂年份（如：2022）..."
                visible={isFieldVisible(editingGallery.fieldVisibility, 'year')}
                onToggleVisible={(next) =>
                  setEditingGallery({
                    ...editingGallery,
                    fieldVisibility: { ...(editingGallery.fieldVisibility || {}), year: next },
                  })
                }
              />
            </div>
            <TextAreaFieldWithVisibility
              label="創作故事說明"
              rows={3}
              value={editingGallery.story || ''}
              onChange={(val) => setEditingGallery({ ...editingGallery, story: val })}
              placeholder="請輸入作品材質、靈感與燒製工藝細節..."
              visible={isFieldVisible(editingGallery.fieldVisibility, 'story')}
              onToggleVisible={(next) =>
                setEditingGallery({
                  ...editingGallery,
                  fieldVisibility: { ...(editingGallery.fieldVisibility || {}), story: next },
                })
              }
            />
            <MediaPickerButton
              label="作品攝影圖片"
              value={editingGallery.imageUrl || ''}
              onChange={(url) => setEditingGallery({ ...editingGallery, imageUrl: url })}
              category="gallery"
              mediaAssets={mediaAssets}
              onUploaded={(a) => setMediaAssets((prev) => [a, ...prev])}
            />
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(editingGallery.isVisible)}
                  onChange={(e) =>
                    setEditingGallery({ ...editingGallery, isVisible: e.target.checked })
                  }
                />
                前台顯示
              </label>
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(editingGallery.imageVisible)}
                  onChange={(e) =>
                    setEditingGallery({ ...editingGallery, imageVisible: e.target.checked })
                  }
                />
                顯示作品圖
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingGallery(null)}
                className="px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  await saveGalleryWork({
                    id: editingGallery.id,
                    title: editingGallery.title || '未命名作品',
                    category: editingGallery.category || '陶藝拉坯',
                    artisanName: editingGallery.artisanName || '',
                    year: editingGallery.year || '2026',
                    story: editingGallery.story || '',
                    imageUrl: editingGallery.imageUrl || '',
                    imageVisible: Boolean(editingGallery.imageVisible),
                    isVisible: Boolean(editingGallery.isVisible),
                    order: editingGallery.order ?? 1,
                    fieldVisibility: editingGallery.fieldVisibility || {},
                    createdAt: editingGallery.createdAt,
                  });
                  setEditingGallery(null);
                  setGalleryWorks(await fetchGalleryWorks());
                  await onCatalogRefresh();
                }}
                className="px-6 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium cursor-pointer"
              >
                儲存作品
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify Enrollment Payment & Refund Modal */}
      {verifyingEnrollment && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#e0d8d3] rounded-lg max-w-md w-full p-6 space-y-4 shadow-warm max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-serif text-[#1b1c1c]">
              確認繳費狀態／辦理退款並通知會員
            </h3>
            <p className="text-xs text-[#51443d]">
              訂單編號：{verifyingEnrollment.enrollmentCode} · 學員：{verifyingEnrollment.memberName}
              <br />
              實付金額：HK$ {verifyingEnrollment.totalAmount.toLocaleString()}（港幣）
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#51443d]">管理員對帳備註（將同步顯示於會員通知）</span>
              <textarea
                rows={2}
                value={verifyNote}
                onChange={(e) => setVerifyNote(e.target.value)}
                placeholder="例如：已核對銀行入帳款項，期待課程當日見！"
                className="w-full p-3 rounded-lg border border-[#e0d8d3] text-sm"
              />
            </label>

            {/* Optional Refund Section */}
            <div className="bg-[#fcf9f8] border border-[#e0d8d3] rounded-lg p-3.5 space-y-2.5">
              <p className="text-xs font-medium text-[#70472d]">如需辦理退款（將記入當月會計退款明細）</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="block space-y-1">
                  <span className="block text-[11px] font-medium text-[#51443d]">退款金額（港幣 HK$）</span>
                  <input
                    type="number"
                    min={0}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded-lg bg-white border border-[#e0d8d3] text-xs tabular-nums"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="block text-[11px] font-medium text-[#51443d]">退款原因說明</span>
                  <input
                    type="text"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="例如：學員改期退款"
                    className="w-full h-9 px-3 rounded-lg bg-white border border-[#e0d8d3] text-xs"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await adminVerifyEnrollmentPayment({
                    enrollment: verifyingEnrollment,
                    newStatus: 'refunded',
                    adminNote: verifyNote || refundReason || '已辦理退款',
                    adminName: activeAdmin.name,
                    refundAmount,
                    refundReason,
                  });
                  setVerifyingEnrollment(null);
                  setEnrollments(await fetchAllEnrollments());
                }}
                className="w-full h-9 rounded-lg border border-[#ba1a1a]/40 bg-[#ffdad6]/40 text-[#93000a] text-xs font-medium hover:bg-[#ffdad6]/70 cursor-pointer"
              >
                確認辦理退款（HK$ {refundAmount.toLocaleString()}）並記入會計
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  await adminVerifyEnrollmentPayment({
                    enrollment: verifyingEnrollment,
                    newStatus: 'paid',
                    adminNote: verifyNote,
                    adminName: activeAdmin.name,
                  });
                  setVerifyingEnrollment(null);
                  setEnrollments(await fetchAllEnrollments());
                }}
                className="h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
              >
                確認繳費成功（同步發送確認通知給會員）
              </button>
              <button
                type="button"
                onClick={async () => {
                  await adminVerifyEnrollmentPayment({
                    enrollment: verifyingEnrollment,
                    newStatus: 'needs_revision',
                    adminNote: verifyNote,
                    adminName: activeAdmin.name,
                  });
                  setVerifyingEnrollment(null);
                  setEnrollments(await fetchAllEnrollments());
                }}
                className="h-10 rounded-lg border border-[#e0d8d3] text-[#73594c] text-xs font-medium hover:bg-[#f6f3f2] cursor-pointer"
              >
                退回補件（同步通知會員重新核對）
              </button>
              <button
                type="button"
                onClick={async () => {
                  await adminVerifyEnrollmentPayment({
                    enrollment: verifyingEnrollment,
                    newStatus: 'cancelled',
                    adminNote: verifyNote,
                    adminName: activeAdmin.name,
                  });
                  setVerifyingEnrollment(null);
                  setEnrollments(await fetchAllEnrollments());
                }}
                className="h-10 rounded-lg border border-[#e0d8d3] text-[#ba1a1a] text-xs font-medium hover:bg-[#ffdad6]/30 cursor-pointer"
              >
                標記為已取消
              </button>
              <button
                type="button"
                onClick={() => setVerifyingEnrollment(null)}
                className="h-9 text-xs text-[#51443d] cursor-pointer"
              >
                關閉視窗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Edit / Create Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#e0d8d3] rounded-lg max-w-md w-full p-6 space-y-4 shadow-warm max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-serif text-[#1b1c1c]">
              {editingMember.id ? '修改會員資料' : '新增學員會員'}
            </h3>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[#51443d]">學員姓名 *</span>
              <input
                type="text"
                value={editingMember.name}
                onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                placeholder="請輸入真實姓名"
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[#51443d]">手提電話號碼 *</span>
              <input
                type="tel"
                value={editingMember.phone}
                onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                placeholder="例如：91234567"
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[#51443d]">聯絡 Email（選填）</span>
              <input
                type="email"
                value={editingMember.email}
                onChange={(e) => setEditingMember({ ...editingMember, email: e.target.value })}
                placeholder="name@example.com"
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[#51443d]">
                {editingMember.id ? '重設 6 位數 PIN 碼（不改則留空）' : '設定 6 位數 PIN 碼 *'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={editingMember.newPin}
                onChange={(e) =>
                  setEditingMember({
                    ...editingMember,
                    newPin: e.target.value.replace(/\D/g, '').slice(0, 6),
                  })
                }
                placeholder="請輸入 6 位數字"
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[#51443d]">帳號狀態</span>
              <select
                value={editingMember.status}
                onChange={(e) =>
                  setEditingMember({
                    ...editingMember,
                    status: e.target.value as 'active' | 'suspended',
                  })
                }
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
              >
                <option value="active">帳號正常啟用</option>
                <option value="suspended">帳號已停權</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[#51443d]">管理員內部備註</span>
              <textarea
                rows={2}
                value={editingMember.notes}
                onChange={(e) => setEditingMember({ ...editingMember, notes: e.target.value })}
                placeholder="輸入會員備忘或偏好紀錄..."
                className="w-full p-3 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await adminUpsertMember(editingMember);
                    setEditingMember(null);
                    setMembers(await fetchAllMembers());
                  } catch (err) {
                    alert(err instanceof Error ? err.message : '儲存失敗');
                  }
                }}
                className="px-6 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium cursor-pointer"
              >
                儲存會員資料
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin User & RBAC Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#e0d8d3] rounded-lg max-w-lg w-full p-6 space-y-4 shadow-warm max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-serif text-[#1b1c1c]">
              {editingAdmin.id ? '編輯管理員與權限' : '新增不同管理員帳號'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[#51443d]">管理員姓名 *</span>
                <input
                  type="text"
                  value={editingAdmin.name}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, name: e.target.value })}
                  placeholder="例如：林財務"
                  className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                />
              </label>
              <OptionOrCustomField
                label="部門職稱 *"
                value={editingAdmin.roleTitle}
                onChange={(val) => setEditingAdmin({ ...editingAdmin, roleTitle: val })}
                options={ADMIN_ROLE_OPTIONS}
                placeholder="例如：財務對帳專員"
              />
              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[#51443d]">登入用手機號碼 *</span>
                <input
                  type="tel"
                  value={editingAdmin.phone}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, phone: e.target.value })}
                  placeholder="例如：91234567"
                  className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[#51443d]">
                  {editingAdmin.id ? '重設 6 位數 PIN（不改留空）' : '設定 6 位數 PIN 碼 *'}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={editingAdmin.newPin}
                  onChange={(e) =>
                    setEditingAdmin({
                      ...editingAdmin,
                      newPin: e.target.value.replace(/\D/g, '').slice(0, 6),
                    })
                  }
                  placeholder="請輸入 6 位數字"
                  className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tabular-nums focus:outline-none focus:border-[#8c5e43]"
                />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="block text-xs font-medium text-[#51443d]">綁定識別信箱（選填）</span>
                <input
                  type="email"
                  value={editingAdmin.boundEmail}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, boundEmail: e.target.value })}
                  placeholder="admin@example.com"
                  className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                />
              </label>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#e0d8d3]">
              <p className="text-xs font-medium text-[#51443d]">權限模組配置（勾選開放項目）</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PERMISSION_LABELS.map((p) => (
                  <label
                    key={p.key}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-[#e0d8d3] bg-[#fcf9f8] text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(editingAdmin.permissions[p.key])}
                      onChange={(e) =>
                        setEditingAdmin({
                          ...editingAdmin,
                          permissions: {
                            ...editingAdmin.permissions,
                            [p.key]: e.target.checked,
                          },
                        })
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingAdmin.isSuperAdmin}
                  onChange={(e) =>
                    setEditingAdmin({ ...editingAdmin, isSuperAdmin: e.target.checked })
                  }
                />
                設為超級管理員（擁有全部權限）
              </label>
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingAdmin.isActive}
                  onChange={(e) =>
                    setEditingAdmin({ ...editingAdmin, isActive: e.target.checked })
                  }
                />
                啟用此管理員帳號
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingAdmin(null)}
                className="px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await saveAdminUser(editingAdmin);
                    setEditingAdmin(null);
                    setAdminUsers(await fetchAllAdminUsers());
                  } catch (err) {
                    alert(err instanceof Error ? err.message : '儲存管理員失敗');
                  }
                }}
                className="px-6 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium cursor-pointer"
              >
                儲存管理員與權限
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Self-service Own 6-digit PIN Change Modal */}
      {showOwnPinModal && activeAdmin && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <form
            onSubmit={handleOwnPinSubmit}
            className="bg-white border border-[#e0d8d3] rounded-lg max-w-md w-full p-6 space-y-4 shadow-warm"
          >
            <div className="flex items-center justify-between border-b border-[#e0d8d3] pb-3">
              <h3 className="text-lg font-serif text-[#1b1c1c]">修改我的 6 位數 PIN 碼</h3>
              <button
                type="button"
                onClick={() => setShowOwnPinModal(false)}
                className="cursor-pointer text-[#51443d] hover:text-[#1b1c1c]"
                aria-label="關閉"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg px-3.5 py-2.5 text-xs text-[#51443d] space-y-0.5">
              <p className="font-medium text-[#1b1c1c]">
                {activeAdmin.name}（{activeAdmin.roleTitle}）
              </p>
              <p className="tabular-nums">登入電話：{activeAdmin.phone}</p>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#51443d]">目前 6 位數 PIN 碼 *</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={ownCurrentPin}
                onChange={(e) => setOwnCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="輸入目前使用的 6 位數字"
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tracking-[0.25em] tabular-nums focus:outline-none focus:border-[#8c5e43]"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#51443d]">新 6 位數 PIN 碼 *</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={ownNewPin}
                onChange={(e) => setOwnNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="設定新的 6 位數字"
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tracking-[0.25em] tabular-nums focus:outline-none focus:border-[#8c5e43]"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#51443d]">再次確認新 6 位數 PIN 碼 *</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={ownConfirmPin}
                onChange={(e) => setOwnConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="再次輸入新的 6 位數字"
                className="w-full h-11 px-3.5 rounded-lg border border-[#e0d8d3] text-sm tracking-[0.25em] tabular-nums focus:outline-none focus:border-[#8c5e43]"
              />
            </label>

            {ownPinError && (
              <div className="p-3 rounded-lg bg-[#ffdad6]/60 border border-[#ba1a1a]/30 text-xs text-[#93000a] leading-relaxed">
                {ownPinError}
              </div>
            )}

            {ownPinSuccess && (
              <div className="p-3 rounded-lg bg-[#e8ded8]/60 border border-[#8c5e43]/40 text-xs text-[#70472d] leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{ownPinSuccess}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOwnPinModal(false)}
                className="px-4 h-10 rounded-lg border border-[#e0d8d3] text-xs cursor-pointer"
              >
                {ownPinSuccess ? '完成並關閉' : '取消'}
              </button>
              <button
                type="submit"
                disabled={ownPinSaving}
                className="px-6 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer disabled:opacity-50"
              >
                {ownPinSaving ? '更新儲存中...' : '確認修改 PIN 碼'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
