export type PublicPageKey = 'home' | 'courses' | 'gallery' | 'artisans' | 'contact' | 'member';

export type FieldVisibilityMap = Record<string, boolean>;

export function isFieldVisible(map: FieldVisibilityMap | undefined, key: string): boolean {
  return map?.[key] !== false;
}

export interface NavItem {
  id: string;
  label: string;
  pageKey: PublicPageKey;
  isVisible: boolean;
  order: number;
}

export interface PhilosophyPillar {
  id: string;
  number: string;
  title: string;
  description: string;
  isVisible: boolean;
  fieldVisibility?: FieldVisibilityMap;
}

export interface CustomBlock {
  id: string;
  pageKey: PublicPageKey;
  title: string;
  subtitle: string;
  body: string;
  imageUrl: string;
  imageVisible: boolean;
  ctaLabel: string;
  ctaTarget: PublicPageKey;
  isVisible: boolean;
  order: number;
  fieldVisibility?: FieldVisibilityMap;
}

export interface HeroSlide {
  id: string;
  imageUrl: string;
  caption?: string;
  captionVisible?: boolean;
  isVisible: boolean;
  order: number;
}

export interface SiteContent {
  brandName: string;
  brandVisible: boolean;
  brandLogoUrl: string;
  brandLogoVisible: boolean;
  navItems: NavItem[];
  hero: {
    isVisible: boolean;
    kicker: string;
    title: string;
    subtitle: string;
    ctaText: string;
    secondaryCtaText: string;
    imageUrl: string;
    imageVisible: boolean;
    slides?: HeroSlide[];
    slideAutoPlay?: boolean;
    slideIntervalSec?: number;
    fieldVisibility?: FieldVisibilityMap;
  };
  philosophy: {
    isVisible: boolean;
    title: string;
    subtitle: string;
    description: string;
    imageUrl: string;
    imageVisible: boolean;
    pillars: PhilosophyPillar[];
    fieldVisibility?: FieldVisibilityMap;
  };
  coursesSection: {
    isVisible: boolean;
    title: string;
    subtitle: string;
    emptyText: string;
    fieldVisibility?: FieldVisibilityMap;
  };
  gallerySection: {
    isVisible: boolean;
    title: string;
    subtitle: string;
    fieldVisibility?: FieldVisibilityMap;
  };
  artisansSection: {
    isVisible: boolean;
    title: string;
    subtitle: string;
    fieldVisibility?: FieldVisibilityMap;
  };
  contactSection: {
    isVisible: boolean;
    title: string;
    subtitle: string;
    address: string;
    phone: string;
    email: string;
    hours: string;
    mapNote: string;
    formTitle: string;
    submitText: string;
    fieldVisibility?: FieldVisibilityMap;
  };
  paymentConfig: {
    bankName: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    transferNotice: string;
    fieldVisibility?: FieldVisibilityMap;
  };
  footer: {
    isVisible: boolean;
    tagline: string;
    copyrightText: string;
    addressLine: string;
    fieldVisibility?: FieldVisibilityMap;
  };
  customBlocks: CustomBlock[];
  updatedBy: string;
  updatedAt?: unknown;
}

export interface CmsRevision {
  id: string;
  revisionTitle: string;
  note: string;
  targetType: 'site_content' | 'full_snapshot';
  snapshot: SiteContent;
  editorName: string;
  editorPhone: string;
  ownerUid: string;
  createdAt?: unknown;
}

export interface MediaAsset {
  id: string;
  title: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
  category: 'cms' | 'course' | 'gallery' | 'artisan' | 'receipt';
  isPublic: boolean;
  uploadedByUid: string;
  createdAt?: unknown;
}

export type CourseStatus = 'recruiting' | 'ongoing' | 'completed';

export interface Course {
  id: string;
  title: string;
  category: string;
  level: string;
  duration: string;
  startTime?: string;
  endTime?: string;
  totalSessions?: number;
  sessionDates?: string[];
  courseStatus?: CourseStatus;
  instructorPayPerSession?: number;
  price: number;
  maxSeats: number;
  enrolledCount: number;
  scheduleText: string;
  location: string;
  summary: string;
  description: string;
  materialsIncluded: string;
  imageUrl: string;
  imageVisible: boolean;
  artisanId: string;
  artisanName: string;
  isVisible: boolean;
  order: number;
  fieldVisibility?: FieldVisibilityMap;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Artisan {
  id: string;
  name: string;
  specialty: string;
  yearsExperience: number;
  phone?: string;
  defaultSessionPay?: number;
  quote: string;
  bio: string;
  avatarUrl: string;
  imageVisible: boolean;
  isVisible: boolean;
  order: number;
  fieldVisibility?: FieldVisibilityMap;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GalleryWork {
  id: string;
  title: string;
  category: string;
  artisanName: string;
  year: string;
  story: string;
  imageUrl: string;
  imageVisible: boolean;
  isVisible: boolean;
  order: number;
  fieldVisibility?: FieldVisibilityMap;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Member {
  id: string;
  ownerUid: string;
  phone: string;
  name: string;
  email: string;
  pinHash: string;
  notes: string;
  status: 'active' | 'suspended';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PaymentMethod = 'online_card' | 'bank_transfer';
export type PaymentStatus =
  | 'pending_payment'
  | 'awaiting_verification'
  | 'paid'
  | 'needs_revision'
  | 'cancelled'
  | 'refunded';

export interface Enrollment {
  id: string;
  enrollmentCode: string;
  ownerUid: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  courseId: string;
  courseTitle: string;
  courseCategory: string;
  sessionDate: string;
  seats: number;
  totalAmount: number;
  refundAmount?: number;
  refundReason?: string;
  refundedAt?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cardLastFour: string;
  transferLastFive: string;
  receiptMediaId: string;
  studentNote: string;
  adminNote: string;
  verifiedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type InstructorAttendanceStatus = 'present' | 'leave' | 'substitute' | 'cancelled';

export interface InstructorSessionRecord {
  id: string;
  artisanId: string;
  artisanName: string;
  courseId: string;
  courseTitle: string;
  sessionDate: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  startTime: string;
  endTime: string;
  durationText: string;
  attendanceStatus: InstructorAttendanceStatus;
  substituteName: string;
  payAmount: number;
  payStatus: 'unpaid' | 'paid';
  note: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MemberNotification {
  id: string;
  ownerUid: string;
  memberId: string;
  enrollmentId: string;
  title: string;
  message: string;
  type: 'payment_verified' | 'payment_rejected' | 'enrollment_created' | 'system';
  isRead: boolean;
  createdAt?: unknown;
  readAt?: unknown;
}

export interface ContactSubmission {
  id: string;
  ownerUid: string;
  name: string;
  phone: string;
  email: string;
  inquiryType: string;
  message: string;
  status: 'new' | 'in_progress' | 'resolved';
  adminReplyNote: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminPermissions {
  cms: boolean;
  media: boolean;
  courses: boolean;
  members: boolean;
  payments: boolean;
  accounting?: boolean;
  forms: boolean;
  analytics: boolean;
  admins: boolean;
}

export interface AdminUser {
  id: string;
  phone: string;
  name: string;
  roleTitle: string;
  boundEmail: string;
  pinHash: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  permissions: AdminPermissions;
  createdAt?: unknown;
  updatedAt?: unknown;
}
