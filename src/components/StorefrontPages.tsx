import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Send,
  Users,
} from 'lucide-react';
import { ensureAnonymousSession, formatFrontAuthError } from '../lib/firebase';
import { createContactSubmission } from '../services/firestoreService';
import {
  Artisan,
  Course,
  CourseStatus,
  CustomBlock,
  GalleryWork,
  HERO_KICKER_SIZE_CLASS,
  isFieldVisible,
  PublicPageKey,
  SiteContent,
} from '../types/atelier';
import { calculateTimeRangeDisplay, formatDateWithWeekday } from '../utils/scheduleUtils';
import { HeroSlider } from './HeroSlider';
import { MediaImage } from './MediaImage';
import { OptionOrCustomField } from './FormControls';

const COURSE_STATUS_LABEL: Record<CourseStatus, string> = {
  recruiting: '招生中',
  ongoing: '開課中',
  completed: '已完結',
};

const getCourseTimeDisplay = (course: Course): string => {
  const calc = calculateTimeRangeDisplay(course.startTime, course.endTime);
  if (calc.isValid) return calc.fullDisplay;
  return course.duration;
};

const INQUIRY_TYPE_PRESETS = [
  '體驗課程諮詢',
  '企業／團體包班',
  '空間租借／展覽合作',
  '客製器皿訂購',
];

const renderDotSeparated = (items: Array<{ key: string; text: string; className?: string }>) => {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[#73594c]">
      {items.map((item, idx) => (
        <React.Fragment key={item.key}>
          {idx > 0 && <span aria-hidden="true">·</span>}
          <span className={item.className}>{item.text}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

interface StorefrontPagesProps {
  page: PublicPageKey | 'course-detail';
  siteContent: SiteContent;
  courses: Course[];
  artisans: Artisan[];
  galleryWorks: GalleryWork[];
  selectedCourse: Course | null;
  onNavigate: (page: PublicPageKey | 'admin') => void;
  onSelectCourse: (course: Course) => void;
  onBookCourse: (course: Course) => void;
  firebaseReady: boolean;
}

export const StorefrontPages: React.FC<StorefrontPagesProps> = ({
  page,
  siteContent,
  courses,
  artisans,
  galleryWorks,
  selectedCourse,
  onNavigate,
  onSelectCourse,
  onBookCourse,
  firebaseReady,
}) => {
  const [courseFilter, setCourseFilter] = useState<string>('全部');
  const [courseStatusFilter, setCourseStatusFilter] = useState<'all' | CourseStatus>('all');
  const [courseArtisanFilter, setCourseArtisanFilter] = useState<string>('全部');
  const [courseLevelFilter, setCourseLevelFilter] = useState<string>('全部');
  const [galleryFilter, setGalleryFilter] = useState<string>('全部');

  // Contact form state
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    inquiryType: '體驗課程諮詢',
    message: '',
  });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState('');

  const visibleCourses = courses.filter((c) => c.isVisible);
  const visibleArtisans = artisans.filter((a) => a.isVisible);
  const visibleGallery = galleryWorks.filter((g) => g.isVisible);

  const courseCategories = ['全部', ...Array.from(new Set(visibleCourses.map((c) => c.category)))];
  const courseArtisansList = [
    '全部',
    ...Array.from(new Set(visibleCourses.map((c) => c.artisanName).filter(Boolean))),
  ];
  const courseLevelsList = [
    '全部',
    ...Array.from(new Set(visibleCourses.map((c) => c.level).filter(Boolean))),
  ];
  const galleryCategories = ['全部', ...Array.from(new Set(visibleGallery.map((g) => g.category)))];

  const filteredCourses = visibleCourses.filter((c) => {
    if (courseFilter !== '全部' && c.category !== courseFilter) return false;
    if (courseStatusFilter !== 'all' && (c.courseStatus || 'recruiting') !== courseStatusFilter) {
      return false;
    }
    if (courseArtisanFilter !== '全部' && c.artisanName !== courseArtisanFilter) return false;
    if (courseLevelFilter !== '全部' && c.level !== courseLevelFilter) return false;
    return true;
  });

  const filteredGallery =
    galleryFilter === '全部'
      ? visibleGallery
      : visibleGallery.filter((g) => g.category === galleryFilter);

  const renderCustomBlocks = (targetPage: PublicPageKey) => {
    const blocks = (siteContent.customBlocks || [])
      .filter((b) => b.isVisible && b.pageKey === targetPage)
      .sort((a, b) => a.order - b.order);

    if (blocks.length === 0) return null;

    return (
      <div className="space-y-12 py-10">
        {blocks.map((block: CustomBlock) => (
          <section
            key={block.id}
            className="max-w-[1280px] mx-auto px-5 md:px-12"
          >
            <div className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden shadow-warm grid grid-cols-1 lg:grid-cols-12 items-center">
              {block.imageVisible && block.imageUrl && (
                <div className="lg:col-span-5 bg-[#fcf9f8] flex items-center justify-center overflow-hidden">
                  <MediaImage
                    src={block.imageUrl}
                    alt={block.title}
                    className="w-full h-auto max-h-[520px] object-contain block"
                  />
                </div>
              )}
              <div
                className={`${
                  block.imageVisible && block.imageUrl ? 'lg:col-span-7' : 'lg:col-span-12'
                } p-8 md:p-12 flex flex-col justify-center space-y-4`}
              >
                {isFieldVisible(block.fieldVisibility, 'subtitle') && block.subtitle && (
                  <p className="text-xs font-medium tracking-[0.08em] text-[#73594c] whitespace-pre-line">
                    {block.subtitle}
                  </p>
                )}
                {isFieldVisible(block.fieldVisibility, 'title') && block.title && (
                  <h3 className="text-2xl md:text-3xl font-serif text-[#1b1c1c] whitespace-pre-line">
                    {block.title}
                  </h3>
                )}
                {isFieldVisible(block.fieldVisibility, 'body') && block.body && (
                  <p className="text-[15px] leading-relaxed text-[#51443d] whitespace-pre-line">
                    {block.body}
                  </p>
                )}
                {isFieldVisible(block.fieldVisibility, 'ctaLabel') && block.ctaLabel && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(block.ctaTarget || 'courses')}
                      className="inline-flex items-center gap-2 px-6 h-11 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer"
                    >
                      {block.ctaLabel}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    );
  };

  const contactVis = siteContent.contactSection.fieldVisibility;
  const showInquiryName = isFieldVisible(contactVis, 'inquiryName');
  const showInquiryPhone = isFieldVisible(contactVis, 'inquiryPhone');
  const showInquiryEmail = isFieldVisible(contactVis, 'inquiryEmail');
  const showInquiryType = isFieldVisible(contactVis, 'inquiryType');
  const showInquiryMessage = isFieldVisible(contactVis, 'inquiryMessage');

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError('');
    if (
      (showInquiryName && !contactForm.name.trim()) ||
      (showInquiryPhone && !contactForm.phone.trim()) ||
      (showInquiryMessage && !contactForm.message.trim())
    ) {
      setContactError('請填寫必要的聯絡欄位內容');
      return;
    }
    setContactSubmitting(true);
    try {
      await ensureAnonymousSession();
      await createContactSubmission({
        name: showInquiryName ? contactForm.name.trim() : '（未公開欄位）',
        phone: showInquiryPhone ? contactForm.phone.trim() : '（未公開欄位）',
        email: showInquiryEmail ? contactForm.email.trim() : '',
        inquiryType: showInquiryType ? contactForm.inquiryType.trim() || '體驗課程諮詢' : '一般諮詢',
        message: showInquiryMessage ? contactForm.message.trim() : '（未公開欄位）',
      });
      setContactSuccess(true);
      setContactForm({
        name: '',
        phone: '',
        email: '',
        inquiryType: '體驗課程諮詢',
        message: '',
      });
    } catch (err) {
      setContactError(formatFrontAuthError(err));
    } finally {
      setContactSubmitting(false);
    }
  };

  // Course Detail View
  if (page === 'course-detail' && selectedCourse) {
    const remaining = Math.max(0, selectedCourse.maxSeats - selectedCourse.enrolledCount);
    const fv = selectedCourse.fieldVisibility;
    const durationDisplay = getCourseTimeDisplay(selectedCourse);
    const courseStatus = selectedCourse.courseStatus || 'recruiting';
    const sortedSessionDates = [...(selectedCourse.sessionDates || [])].filter(Boolean).sort();
    const metaItems = [
      isFieldVisible(fv, 'courseStatus')
        ? { key: 'status', text: COURSE_STATUS_LABEL[courseStatus], className: 'text-[#8c5e43] font-semibold' }
        : null,
      isFieldVisible(fv, 'category') && selectedCourse.category
        ? { key: 'cat', text: selectedCourse.category }
        : null,
      isFieldVisible(fv, 'level') && selectedCourse.level
        ? { key: 'lvl', text: selectedCourse.level }
        : null,
      isFieldVisible(fv, 'duration') && durationDisplay
        ? { key: 'dur', text: durationDisplay, className: 'tabular-nums' }
        : null,
    ].filter((x): x is { key: string; text: string; className?: string } => Boolean(x));

    const showSeats = isFieldVisible(fv, 'maxSeats');
    const showArtisan = isFieldVisible(fv, 'artisanName') && Boolean(selectedCourse.artisanName);
    const showDescription = isFieldVisible(fv, 'description') && Boolean(selectedCourse.description);
    const showMaterials =
      isFieldVisible(fv, 'materialsIncluded') && Boolean(selectedCourse.materialsIncluded);

    return (
      <div className="max-w-[1280px] mx-auto px-5 md:px-12 py-12 md:py-16 space-y-12">
        <button
          type="button"
          onClick={() => onNavigate('courses')}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#73594c] hover:text-[#70472d] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          返回課程總覽
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {selectedCourse.imageVisible && (
            <div className="lg:col-span-7 rounded-lg overflow-hidden border border-[#e0d8d3] bg-[#fcf9f8] shadow-warm flex items-center justify-center">
              <MediaImage
                src={selectedCourse.imageUrl}
                alt={selectedCourse.title}
                className="w-full h-auto max-h-[680px] object-contain block"
              />
            </div>
          )}

          <div
            className={`${
              selectedCourse.imageVisible ? 'lg:col-span-5' : 'lg:col-span-12'
            } bg-white border border-[#e0d8d3] rounded-lg p-8 shadow-warm flex flex-col justify-between space-y-6`}
          >
            <div className="space-y-4">
              {metaItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#73594c]">
                  {metaItems.map((item, idx) => (
                    <React.Fragment key={item.key}>
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      <span className={item.className}>{item.text}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {isFieldVisible(fv, 'title') && (
                <h1 className="text-2xl md:text-3xl font-serif text-[#1b1c1c] leading-snug">
                  {selectedCourse.title}
                </h1>
              )}

              {isFieldVisible(fv, 'summary') && selectedCourse.summary && (
                <p className="text-[15px] text-[#51443d] leading-relaxed whitespace-pre-line">
                  {selectedCourse.summary}
                </p>
              )}

              {(isFieldVisible(fv, 'duration') ||
                isFieldVisible(fv, 'scheduleText') ||
                isFieldVisible(fv, 'location') ||
                sortedSessionDates.length > 0 ||
                showSeats ||
                showArtisan) && (
                <div className="pt-4 border-t border-[#e0d8d3] space-y-3 text-sm text-[#51443d]">
                  {isFieldVisible(fv, 'duration') && durationDisplay && (
                    <div className="flex items-start gap-3">
                      <Clock className="w-4 h-4 text-[#8c5e43] mt-1 shrink-0" />
                      <span className="tabular-nums">開課時段：{durationDisplay}</span>
                    </div>
                  )}
                  {(isFieldVisible(fv, 'scheduleText') && selectedCourse.scheduleText) ||
                  sortedSessionDates.length > 0 ? (
                    <div className="flex items-start gap-3">
                      <Calendar className="w-4 h-4 text-[#8c5e43] mt-1 shrink-0" />
                      <div className="space-y-1.5">
                        {isFieldVisible(fv, 'scheduleText') && selectedCourse.scheduleText && (
                          <p className="whitespace-pre-line">{selectedCourse.scheduleText}</p>
                        )}
                        {sortedSessionDates.length > 0 && (
                          <div className="space-y-1 text-xs text-[#73594c] tabular-nums">
                            <p className="font-medium text-[#51443d]">
                              詳細上課日子（共 {selectedCourse.totalSessions || sortedSessionDates.length} 堂）：
                            </p>
                            <ul className="space-y-0.5">
                              {sortedSessionDates.map((d, idx) => (
                                <li key={d}>
                                  第 {idx + 1} 堂：{formatDateWithWeekday(d)}
                                  {selectedCourse.startTime && selectedCourse.endTime
                                    ? ` · ${selectedCourse.startTime}-${selectedCourse.endTime}`
                                    : ''}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {isFieldVisible(fv, 'location') && selectedCourse.location && (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-[#8c5e43] mt-1 shrink-0" />
                      <span>{selectedCourse.location}</span>
                    </div>
                  )}
                  {(showSeats || showArtisan) && (
                    <div className="flex items-start gap-3">
                      <Users className="w-4 h-4 text-[#8c5e43] mt-1 shrink-0" />
                      <span className="tabular-nums">
                        {showSeats && `名額 ${selectedCourse.maxSeats} 人 · 目前剩餘 ${remaining} 席`}
                        {showSeats && showArtisan && '（'}
                        {showArtisan && `授課職人：${selectedCourse.artisanName}`}
                        {showSeats && showArtisan && '）'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-[#e0d8d3] space-y-4">
              {isFieldVisible(fv, 'price') && (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-[#51443d]">體驗課程費用（港幣）</span>
                  <span className="text-3xl font-serif text-[#70472d] tabular-nums">
                    HK$ {selectedCourse.price.toLocaleString()}
                  </span>
                </div>
              )}
              <button
                type="button"
                disabled={remaining === 0}
                onClick={() => onBookCourse(selectedCourse)}
                className="w-full h-12 rounded-lg bg-[#8c5e43] text-white text-sm font-medium tracking-[0.06em] hover:bg-[#73594c] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {remaining === 0 ? '本梯次名額已滿' : '立即報名與選擇繳費方式'}
              </button>
            </div>
          </div>
        </div>

        {(showDescription || showMaterials) && (
          <div
            className={`grid grid-cols-1 ${
              showDescription && showMaterials ? 'md:grid-cols-2' : ''
            } gap-8`}
          >
            {showDescription && (
              <div className="bg-white border border-[#e0d8d3] rounded-lg p-8 space-y-3">
                <h2 className="text-xl font-serif text-[#1b1c1c]">課程內容與學習節奏</h2>
                <p className="text-[15px] text-[#51443d] leading-relaxed whitespace-pre-line">
                  {selectedCourse.description}
                </p>
              </div>
            )}
            {showMaterials && (
              <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-8 space-y-3">
                <h2 className="text-xl font-serif text-[#1b1c1c]">包含材料與貼心準備</h2>
                <p className="text-[15px] text-[#51443d] leading-relaxed whitespace-pre-line">
                  {selectedCourse.materialsIncluded}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Home Page
  if (page === 'home') {
    const featuredCourses = visibleCourses.slice(0, 3);
    const featuredArtisans = visibleArtisans.slice(0, 3);
    const slideLayout = siteContent.hero.slideLayout || '5-7';
    const isFullStacked = slideLayout === 'full-bottom' || slideLayout === 'full-top';
    const textColClass =
      !siteContent.hero.imageVisible || isFullStacked
        ? 'lg:col-span-12'
        : slideLayout === '4-8'
        ? 'lg:col-span-4'
        : slideLayout === '6-6'
        ? 'lg:col-span-6'
        : 'lg:col-span-5';
    const sliderColClass = isFullStacked
      ? 'lg:col-span-12'
      : slideLayout === '4-8'
      ? 'lg:col-span-8'
      : slideLayout === '6-6'
      ? 'lg:col-span-6'
      : 'lg:col-span-7';

    return (
      <div>
        {/* Hero Section */}
        {siteContent.hero.isVisible && (
          <section className="max-w-[1360px] mx-auto px-5 md:px-12 py-10 md:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
              <div
                className={`${textColClass} ${
                  slideLayout === 'full-top' ? 'order-2' : 'order-1'
                } flex flex-col justify-center space-y-6 py-2`}
              >
                {isFieldVisible(siteContent.hero.fieldVisibility, 'kicker') &&
                  siteContent.hero.kicker && (
                    <p
                      className={`${
                        HERO_KICKER_SIZE_CLASS[siteContent.hero.kickerSize || 'xs']
                      } font-medium tracking-[0.08em] text-[#73594c] whitespace-pre-line`}
                    >
                      {siteContent.hero.kicker}
                    </p>
                  )}
                {isFieldVisible(siteContent.hero.fieldVisibility, 'title') &&
                  siteContent.hero.title && (
                    <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-serif text-[#1b1c1c] leading-[1.32] tracking-[0.02em] whitespace-pre-line">
                      {siteContent.hero.title}
                    </h1>
                  )}
                {isFieldVisible(siteContent.hero.fieldVisibility, 'subtitle') &&
                  siteContent.hero.subtitle && (
                    <p
                      className={`text-base md:text-lg text-[#51443d] leading-relaxed ${
                        isFullStacked ? 'max-w-3xl' : 'max-w-xl'
                      } whitespace-pre-line`}
                    >
                      {siteContent.hero.subtitle}
                    </p>
                  )}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  {isFieldVisible(siteContent.hero.fieldVisibility, 'ctaText') &&
                    siteContent.hero.ctaText && (
                      <button
                        type="button"
                        onClick={() => onNavigate('courses')}
                        className="inline-flex items-center gap-2 px-7 h-12 rounded-lg bg-[#8c5e43] text-white text-sm font-medium tracking-[0.06em] hover:bg-[#73594c] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {siteContent.hero.ctaText}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  {isFieldVisible(siteContent.hero.fieldVisibility, 'secondaryCtaText') &&
                    siteContent.hero.secondaryCtaText && (
                      <button
                        type="button"
                        onClick={() => onNavigate('artisans')}
                        className="inline-flex items-center px-6 h-12 rounded-lg border border-[#e0d8d3] bg-white text-[#73594c] text-sm font-medium hover:bg-[#e8ded8]/60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {siteContent.hero.secondaryCtaText}
                      </button>
                    )}
                </div>
              </div>

              {siteContent.hero.imageVisible && (
                <HeroSlider
                  slides={siteContent.hero.slides}
                  fallbackImageUrl={siteContent.hero.imageUrl}
                  altTitle={siteContent.hero.title}
                  autoPlay={siteContent.hero.slideAutoPlay ?? true}
                  intervalSec={siteContent.hero.slideIntervalSec ?? 5}
                  aspectRatio={siteContent.hero.slideAspectRatio || '16-10'}
                  imageFit={siteContent.hero.slideImageFit || 'cover'}
                  containerClassName={`${sliderColClass} ${
                    slideLayout === 'full-top' ? 'order-1' : 'order-2'
                  }`}
                />
              )}
            </div>
          </section>
        )}

        {/* Philosophy Section */}
        {siteContent.philosophy.isVisible && (
          <section className="bg-[#f6f3f2] border-y border-[#e0d8d3] py-16 md:py-24">
            <div className="max-w-[1280px] mx-auto px-5 md:px-12 space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                {siteContent.philosophy.imageVisible && (
                  <div className="lg:col-span-5 rounded-lg overflow-hidden border border-[#e0d8d3] bg-white flex items-center justify-center">
                    <MediaImage
                      src={siteContent.philosophy.imageUrl}
                      alt={siteContent.philosophy.title}
                      className="w-full h-auto max-h-[480px] object-contain block"
                    />
                  </div>
                )}
                <div
                  className={`${
                    siteContent.philosophy.imageVisible ? 'lg:col-span-7' : 'lg:col-span-12'
                  } flex flex-col justify-center space-y-5`}
                >
                  {isFieldVisible(siteContent.philosophy.fieldVisibility, 'subtitle') &&
                    siteContent.philosophy.subtitle && (
                      <p className="text-xs font-medium tracking-[0.08em] text-[#73594c] whitespace-pre-line">
                        {siteContent.philosophy.subtitle}
                      </p>
                    )}
                  {isFieldVisible(siteContent.philosophy.fieldVisibility, 'title') &&
                    siteContent.philosophy.title && (
                      <h2 className="text-2xl md:text-4xl font-serif text-[#1b1c1c]">
                        {siteContent.philosophy.title}
                      </h2>
                    )}
                  {isFieldVisible(siteContent.philosophy.fieldVisibility, 'description') &&
                    siteContent.philosophy.description && (
                      <p className="text-[15px] md:text-base text-[#51443d] leading-relaxed whitespace-pre-line">
                        {siteContent.philosophy.description}
                      </p>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {siteContent.philosophy.pillars
                  .filter((p) => p.isVisible)
                  .map((pillar) => (
                    <div
                      key={pillar.id}
                      className="bg-white border border-[#e0d8d3] rounded-lg p-7 space-y-3"
                    >
                      {isFieldVisible(pillar.fieldVisibility, 'number') && pillar.number && (
                        <span className="text-xs font-medium tracking-[0.08em] text-[#b0704c] tabular-nums block">
                          {pillar.number}
                        </span>
                      )}
                      {isFieldVisible(pillar.fieldVisibility, 'title') && pillar.title && (
                        <h3 className="text-lg font-serif text-[#1b1c1c]">{pillar.title}</h3>
                      )}
                      {isFieldVisible(pillar.fieldVisibility, 'description') &&
                        pillar.description && (
                          <p className="text-sm text-[#51443d] leading-relaxed whitespace-pre-line">
                            {pillar.description}
                          </p>
                        )}
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}

        {/* Featured Courses */}
        {siteContent.coursesSection.isVisible && (
          <section className="max-w-[1280px] mx-auto px-5 md:px-12 py-16 md:py-24 space-y-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
                {isFieldVisible(siteContent.coursesSection.fieldVisibility, 'title') && (
                  <h2 className="text-2xl md:text-4xl font-serif text-[#1b1c1c]">
                    {siteContent.coursesSection.title}
                  </h2>
                )}
                {isFieldVisible(siteContent.coursesSection.fieldVisibility, 'subtitle') && (
                  <p className="text-[15px] text-[#51443d] whitespace-pre-line">
                    {siteContent.coursesSection.subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('courses')}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#8c5e43] hover:text-[#70472d] cursor-pointer whitespace-nowrap shrink-0"
              >
                瀏覽全部課程
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
              {featuredCourses.map((course) => {
                const fv = course.fieldVisibility;
                const durationDisplay = getCourseTimeDisplay(course);
                const courseStatus = course.courseStatus || 'recruiting';
                const sortedDates = [...(course.sessionDates || [])].filter(Boolean).sort();
                const metaItems = [
                  isFieldVisible(fv, 'courseStatus')
                    ? { key: 'status', text: COURSE_STATUS_LABEL[courseStatus], className: 'text-[#8c5e43] font-medium' }
                    : null,
                  isFieldVisible(fv, 'category') && course.category
                    ? { key: 'cat', text: course.category }
                    : null,
                  isFieldVisible(fv, 'duration') && durationDisplay
                    ? { key: 'dur', text: durationDisplay, className: 'tabular-nums' }
                    : null,
                  isFieldVisible(fv, 'level') && course.level
                    ? { key: 'lvl', text: course.level }
                    : null,
                ].filter((x): x is { key: string; text: string; className?: string } => Boolean(x));

                return (
                  <article
                    key={course.id}
                    className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden shadow-warm shadow-warm-hover flex flex-col justify-between"
                  >
                    <div>
                      {course.imageVisible && (
                        <button
                          type="button"
                          onClick={() => onSelectCourse(course)}
                          className="w-full aspect-[16/10] bg-[#fcf9f8] overflow-hidden cursor-pointer flex items-center justify-center"
                        >
                          <MediaImage
                            src={course.imageUrl}
                            alt={course.title}
                            className="w-full h-full object-contain"
                          />
                        </button>
                      )}
                      <div className="p-6 space-y-3">
                        {renderDotSeparated(metaItems)}
                        {isFieldVisible(fv, 'title') && (
                          <h3 className="text-xl font-serif text-[#1b1c1c] leading-snug">
                            <button
                              type="button"
                              onClick={() => onSelectCourse(course)}
                              className="text-left hover:text-[#70472d] transition-colors cursor-pointer"
                            >
                              {course.title}
                            </button>
                          </h3>
                        )}
                        {isFieldVisible(fv, 'summary') && course.summary && (
                          <p className="text-sm text-[#51443d] leading-relaxed line-clamp-2 whitespace-pre-line">
                            {course.summary}
                          </p>
                        )}
                        {sortedDates.length > 0 && isFieldVisible(fv, 'scheduleText') && (
                          <p className="text-xs text-[#73594c] tabular-nums">
                            開課日期：{sortedDates.map(formatDateWithWeekday).join('、')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="px-6 pb-6 pt-4 border-t border-[#e0d8d3]/70 flex items-center justify-between gap-4">
                      {isFieldVisible(fv, 'price') ? (
                        <span className="text-lg font-serif text-[#70472d] tabular-nums">
                          HK$ {course.price.toLocaleString()}
                        </span>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => onBookCourse(course)}
                        className="px-4 h-9 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        立即報名
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Featured Artisans Strip */}
        {siteContent.artisansSection.isVisible && featuredArtisans.length > 0 && (
          <section className="bg-[#f6f3f2] border-t border-[#e0d8d3] py-16 md:py-20">
            <div className="max-w-[1280px] mx-auto px-5 md:px-12 space-y-10">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  {isFieldVisible(siteContent.artisansSection.fieldVisibility, 'title') && (
                    <h2 className="text-2xl md:text-3xl font-serif text-[#1b1c1c]">
                      {siteContent.artisansSection.title}
                    </h2>
                  )}
                  {isFieldVisible(siteContent.artisansSection.fieldVisibility, 'subtitle') && (
                    <p className="text-[15px] text-[#51443d] whitespace-pre-line">
                      {siteContent.artisansSection.subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('artisans')}
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#8c5e43] hover:text-[#70472d] cursor-pointer whitespace-nowrap shrink-0"
                >
                  查看職人介紹
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
                {featuredArtisans.map((artisan) => {
                  const afv = artisan.fieldVisibility;
                  return (
                    <div
                      key={artisan.id}
                      className="bg-white border border-[#e0d8d3] rounded-lg p-6 space-y-4"
                    >
                      <div className="flex items-center gap-4">
                        {artisan.imageVisible && (
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-[#e0d8d3] bg-[#fcf9f8] flex items-center justify-center shrink-0">
                            <MediaImage
                              src={artisan.avatarUrl}
                              alt={artisan.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        )}
                        <div>
                          {isFieldVisible(afv, 'name') && (
                            <h3 className="text-lg font-serif text-[#1b1c1c]">{artisan.name}</h3>
                          )}
                          {isFieldVisible(afv, 'specialty') && (
                            <p className="text-xs text-[#73594c]">{artisan.specialty}</p>
                          )}
                        </div>
                      </div>
                      {isFieldVisible(afv, 'quote') && artisan.quote && (
                        <p className="text-sm text-[#51443d] italic whitespace-pre-line">
                          「{artisan.quote}」
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {renderCustomBlocks('home')}
      </div>
    );
  }

  // Courses Catalog Page
  if (page === 'courses') {
    const csFv = siteContent.coursesSection.fieldVisibility;
    return (
      <div className="max-w-[1280px] mx-auto px-5 md:px-12 py-12 md:py-16 space-y-10">
        {siteContent.coursesSection.isVisible && (
          <div className="space-y-4 max-w-2xl">
            {isFieldVisible(csFv, 'title') && (
              <h1 className="text-3xl md:text-4xl font-serif text-[#1b1c1c]">
                {siteContent.coursesSection.title}
              </h1>
            )}
            {isFieldVisible(csFv, 'subtitle') && (
              <p className="text-[15px] text-[#51443d] whitespace-pre-line">
                {siteContent.coursesSection.subtitle}
              </p>
            )}
          </div>
        )}

        {/* Interactive Filter Chips + Multi-dimension Filters */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {courseCategories.map((cat) => {
              const active = courseFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCourseFilter(cat)}
                  className={`h-9 px-5 rounded-full text-xs font-medium tracking-[0.06em] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#8c5e43] text-white'
                      : 'bg-white border border-[#e0d8d3] text-[#73594c] hover:bg-[#e8ded8]/60'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[#51443d]">
              <span>開課狀態：</span>
              <select
                value={courseStatusFilter}
                onChange={(e) => setCourseStatusFilter(e.target.value as 'all' | CourseStatus)}
                className="h-9 px-3 rounded-lg bg-white border border-[#e0d8d3] text-xs text-[#1b1c1c]"
              >
                <option value="all">全部狀態</option>
                <option value="recruiting">招生中</option>
                <option value="ongoing">開課中</option>
                <option value="completed">已完結</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#51443d]">
              <span>授課職人：</span>
              <select
                value={courseArtisanFilter}
                onChange={(e) => setCourseArtisanFilter(e.target.value)}
                className="h-9 px-3 rounded-lg bg-white border border-[#e0d8d3] text-xs text-[#1b1c1c]"
              >
                {courseArtisansList.map((name) => (
                  <option key={name} value={name}>
                    {name === '全部' ? '全部職人' : name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#51443d]">
              <span>難度：</span>
              <select
                value={courseLevelFilter}
                onChange={(e) => setCourseLevelFilter(e.target.value)}
                className="h-9 px-3 rounded-lg bg-white border border-[#e0d8d3] text-xs text-[#1b1c1c]"
              >
                {courseLevelsList.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl === '全部' ? '全部難度' : lvl}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {filteredCourses.length === 0 ? (
          isFieldVisible(csFv, 'emptyText') && (
            <div className="bg-white border border-[#e0d8d3] rounded-lg p-12 text-center text-[#51443d] whitespace-pre-line">
              {siteContent.coursesSection.emptyText}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {filteredCourses.map((course) => {
              const remaining = Math.max(0, course.maxSeats - course.enrolledCount);
              const fv = course.fieldVisibility;
              const durationDisplay = getCourseTimeDisplay(course);
              const courseStatus = course.courseStatus || 'recruiting';
              const sortedDates = [...(course.sessionDates || [])].filter(Boolean).sort();
              const metaItems = [
                isFieldVisible(fv, 'courseStatus')
                  ? { key: 'status', text: COURSE_STATUS_LABEL[courseStatus], className: 'text-[#8c5e43] font-medium' }
                  : null,
                isFieldVisible(fv, 'category') && course.category
                  ? { key: 'cat', text: course.category }
                  : null,
                isFieldVisible(fv, 'duration') && durationDisplay
                  ? { key: 'dur', text: durationDisplay, className: 'tabular-nums' }
                  : null,
                isFieldVisible(fv, 'maxSeats')
                  ? {
                      key: 'seats',
                      text: remaining > 0 ? `餘 ${remaining} 席` : '已額滿',
                      className: 'text-[#b0704c] tabular-nums',
                    }
                  : null,
              ].filter(
                (x): x is { key: string; text: string; className?: string } => Boolean(x)
              );

              return (
                <article
                  key={course.id}
                  className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden shadow-warm shadow-warm-hover flex flex-col justify-between"
                >
                  <div>
                    {course.imageVisible && (
                      <button
                        type="button"
                        onClick={() => onSelectCourse(course)}
                        className="w-full aspect-[16/10] bg-[#fcf9f8] overflow-hidden cursor-pointer flex items-center justify-center"
                      >
                        <MediaImage
                          src={course.imageUrl}
                          alt={course.title}
                          className="w-full h-full object-contain"
                        />
                      </button>
                    )}
                    <div className="p-6 space-y-3">
                      {renderDotSeparated(metaItems)}
                      {isFieldVisible(fv, 'title') && (
                        <h2 className="text-xl font-serif text-[#1b1c1c] leading-snug">
                          <button
                            type="button"
                            onClick={() => onSelectCourse(course)}
                            className="text-left hover:text-[#70472d] cursor-pointer"
                          >
                            {course.title}
                          </button>
                        </h2>
                      )}
                      {isFieldVisible(fv, 'summary') && course.summary && (
                        <p className="text-sm text-[#51443d] leading-relaxed whitespace-pre-line">
                          {course.summary}
                        </p>
                      )}
                      {isFieldVisible(fv, 'artisanName') && course.artisanName && (
                        <p className="text-xs text-[#73594c]">授課職人：{course.artisanName}</p>
                      )}
                      {isFieldVisible(fv, 'scheduleText') && course.scheduleText && (
                        <p className="text-xs text-[#73594c] whitespace-pre-line">
                          {course.scheduleText}
                        </p>
                      )}
                      {sortedDates.length > 0 && isFieldVisible(fv, 'scheduleText') && (
                        <p className="text-xs text-[#51443d] tabular-nums leading-relaxed">
                          詳細開課日子：{sortedDates.map(formatDateWithWeekday).join('、')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="px-6 pb-6 pt-4 border-t border-[#e0d8d3]/70 flex items-center justify-between gap-3">
                    {isFieldVisible(fv, 'price') ? (
                      <span className="text-lg font-serif text-[#70472d] tabular-nums">
                        HK$ {course.price.toLocaleString()}
                      </span>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectCourse(course)}
                        className="px-3.5 h-9 rounded-lg border border-[#e0d8d3] text-xs font-medium text-[#73594c] hover:bg-[#e8ded8]/50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        課程詳情
                      </button>
                      <button
                        type="button"
                        disabled={remaining === 0}
                        onClick={() => onBookCourse(course)}
                        className="px-4 h-9 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        報名
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {renderCustomBlocks('courses')}
      </div>
    );
  }

  // Gallery Page
  if (page === 'gallery') {
    const galFv = siteContent.gallerySection.fieldVisibility;
    return (
      <div className="max-w-[1280px] mx-auto px-5 md:px-12 py-12 md:py-16 space-y-10">
        {siteContent.gallerySection.isVisible && (
          <div className="space-y-4 max-w-2xl">
            {isFieldVisible(galFv, 'title') && (
              <h1 className="text-3xl md:text-4xl font-serif text-[#1b1c1c]">
                {siteContent.gallerySection.title}
              </h1>
            )}
            {isFieldVisible(galFv, 'subtitle') && (
              <p className="text-[15px] text-[#51443d] whitespace-pre-line">
                {siteContent.gallerySection.subtitle}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {galleryCategories.map((cat) => {
            const active = galleryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setGalleryFilter(cat)}
                className={`h-9 px-5 rounded-full text-xs font-medium tracking-[0.06em] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#8c5e43] text-white'
                    : 'bg-white border border-[#e0d8d3] text-[#73594c] hover:bg-[#e8ded8]/60'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
          {filteredGallery.map((work) => {
            const wfv = work.fieldVisibility;
            const metaItems = [
              isFieldVisible(wfv, 'category') && work.category
                ? { key: 'cat', text: work.category }
                : null,
              isFieldVisible(wfv, 'artisanName') && work.artisanName
                ? { key: 'art', text: work.artisanName }
                : null,
              isFieldVisible(wfv, 'year') && work.year
                ? { key: 'yr', text: work.year, className: 'tabular-nums' }
                : null,
            ].filter(
              (x): x is { key: string; text: string; className?: string } => Boolean(x)
            );

            return (
              <article
                key={work.id}
                className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden shadow-warm"
              >
                {work.imageVisible && (
                  <div className="aspect-[4/3] bg-[#fcf9f8] overflow-hidden flex items-center justify-center">
                    <MediaImage
                      src={work.imageUrl}
                      alt={work.title}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="p-6 space-y-2.5">
                  {renderDotSeparated(metaItems)}
                  {isFieldVisible(wfv, 'title') && (
                    <h2 className="text-xl font-serif text-[#1b1c1c]">{work.title}</h2>
                  )}
                  {isFieldVisible(wfv, 'story') && work.story && (
                    <p className="text-sm text-[#51443d] leading-relaxed whitespace-pre-line">
                      {work.story}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {renderCustomBlocks('gallery')}
      </div>
    );
  }

  // Artisans Page
  if (page === 'artisans') {
    const artSecFv = siteContent.artisansSection.fieldVisibility;
    return (
      <div className="max-w-[1280px] mx-auto px-5 md:px-12 py-12 md:py-16 space-y-12">
        {siteContent.artisansSection.isVisible && (
          <div className="space-y-4 max-w-2xl">
            {isFieldVisible(artSecFv, 'title') && (
              <h1 className="text-3xl md:text-4xl font-serif text-[#1b1c1c]">
                {siteContent.artisansSection.title}
              </h1>
            )}
            {isFieldVisible(artSecFv, 'subtitle') && (
              <p className="text-[15px] text-[#51443d] whitespace-pre-line">
                {siteContent.artisansSection.subtitle}
              </p>
            )}
          </div>
        )}

        <div className="space-y-8">
          {visibleArtisans.map((artisan) => {
            const afv = artisan.fieldVisibility;
            const metaItems = [
              isFieldVisible(afv, 'specialty') && artisan.specialty
                ? { key: 'spec', text: artisan.specialty }
                : null,
              isFieldVisible(afv, 'yearsExperience')
                ? {
                    key: 'exp',
                    text: `工藝資歷 ${artisan.yearsExperience} 年`,
                    className: 'tabular-nums',
                  }
                : null,
            ].filter(
              (x): x is { key: string; text: string; className?: string } => Boolean(x)
            );

            return (
              <article
                key={artisan.id}
                className="bg-white border border-[#e0d8d3] rounded-lg overflow-hidden shadow-warm grid grid-cols-1 md:grid-cols-12 items-center"
              >
                {artisan.imageVisible && (
                  <div className="md:col-span-4 bg-[#fcf9f8] flex items-center justify-center overflow-hidden">
                    <MediaImage
                      src={artisan.avatarUrl}
                      alt={artisan.name}
                      className="w-full h-auto max-h-[420px] object-contain block"
                    />
                  </div>
                )}
                <div
                  className={`${
                    artisan.imageVisible ? 'md:col-span-8' : 'md:col-span-12'
                  } p-8 md:p-10 flex flex-col justify-center space-y-4`}
                >
                  {renderDotSeparated(metaItems)}
                  {isFieldVisible(afv, 'name') && (
                    <h2 className="text-2xl md:text-3xl font-serif text-[#1b1c1c]">
                      {artisan.name}
                    </h2>
                  )}
                  {isFieldVisible(afv, 'quote') && artisan.quote && (
                    <p className="text-base font-serif text-[#70472d] whitespace-pre-line">
                      「{artisan.quote}」
                    </p>
                  )}
                  {isFieldVisible(afv, 'bio') && artisan.bio && (
                    <p className="text-[15px] text-[#51443d] leading-relaxed whitespace-pre-line">
                      {artisan.bio}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {renderCustomBlocks('artisans')}
      </div>
    );
  }

  // Contact & Space Booking Form Page
  const showAddress = isFieldVisible(contactVis, 'address') && Boolean(siteContent.contactSection.address);
  const showHours = isFieldVisible(contactVis, 'hours') && Boolean(siteContent.contactSection.hours);
  const showPhone = isFieldVisible(contactVis, 'phone') && Boolean(siteContent.contactSection.phone);
  const showEmail = isFieldVisible(contactVis, 'email') && Boolean(siteContent.contactSection.email);
  const showMapNote = isFieldVisible(contactVis, 'mapNote') && Boolean(siteContent.contactSection.mapNote);
  const hasInfoCard = showAddress || showHours || showPhone || showEmail || showMapNote;

  return (
    <div className="max-w-[1280px] mx-auto px-5 md:px-12 py-12 md:py-16 space-y-12">
      {siteContent.contactSection.isVisible && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 space-y-6">
            {isFieldVisible(contactVis, 'title') && (
              <h1 className="text-3xl md:text-4xl font-serif text-[#1b1c1c]">
                {siteContent.contactSection.title}
              </h1>
            )}
            {isFieldVisible(contactVis, 'subtitle') && (
              <p className="text-[15px] text-[#51443d] leading-relaxed whitespace-pre-line">
                {siteContent.contactSection.subtitle}
              </p>
            )}

            {hasInfoCard && (
              <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-7 space-y-4 text-sm text-[#51443d]">
                {showAddress && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-[#8c5e43] mt-1 shrink-0" />
                    <div>
                      <p className="font-medium text-[#1b1c1c]">工坊地址</p>
                      <p className="whitespace-pre-line">{siteContent.contactSection.address}</p>
                    </div>
                  </div>
                )}
                {showHours && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-[#8c5e43] mt-1 shrink-0" />
                    <div>
                      <p className="font-medium text-[#1b1c1c]">開放時間</p>
                      <p className="whitespace-pre-line">{siteContent.contactSection.hours}</p>
                    </div>
                  </div>
                )}
                {(showPhone || showEmail || showMapNote) && (
                  <div className="pt-2 border-t border-[#e0d8d3] space-y-1">
                    {showPhone && (
                      <p className="tabular-nums">電話：{siteContent.contactSection.phone}</p>
                    )}
                    {showEmail && <p>信箱：{siteContent.contactSection.email}</p>}
                    {showMapNote && (
                      <p className="text-xs pt-1 whitespace-pre-line">
                        {siteContent.contactSection.mapNote}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-[#e0d8d3] rounded-lg p-8 shadow-warm">
            {isFieldVisible(contactVis, 'formTitle') && (
              <h2 className="text-2xl font-serif text-[#1b1c1c] mb-6">
                {siteContent.contactSection.formTitle}
              </h2>
            )}

            {contactSuccess ? (
              <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-8 text-center space-y-4">
                <CheckCircle2 className="w-10 h-10 text-[#b0704c] mx-auto" />
                <h3 className="text-xl font-serif text-[#1b1c1c]">已成功送出您的諮詢表單</h3>
                <p className="text-sm text-[#51443d]">
                  工坊團隊已收到您的訊息，後台管理人員將於營業時間內盡快透過電話或信箱與您聯繫。
                </p>
                <button
                  type="button"
                  onClick={() => setContactSuccess(false)}
                  className="px-6 h-10 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer"
                >
                  再填寫一筆諮詢
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-5">
                {(showInquiryName || showInquiryPhone) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {showInquiryName && (
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-[#51443d]">您的姓名 *</span>
                        <input
                          type="text"
                          required
                          value={contactForm.name}
                          onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                          placeholder="例如：林先生／陳小姐"
                          className="w-full h-12 px-4 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                        />
                      </label>
                    )}
                    {showInquiryPhone && (
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-[#51443d]">手提電話 *</span>
                        <input
                          type="tel"
                          required
                          value={contactForm.phone}
                          onChange={(e) =>
                            setContactForm({ ...contactForm, phone: e.target.value })
                          }
                          placeholder="例如：9123 4567"
                          className="w-full h-12 px-4 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43] tabular-nums"
                        />
                      </label>
                    )}
                  </div>
                )}

                {(showInquiryEmail || showInquiryType) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {showInquiryEmail && (
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-[#51443d]">聯絡 Email</span>
                        <input
                          type="email"
                          value={contactForm.email}
                          onChange={(e) =>
                            setContactForm({ ...contactForm, email: e.target.value })
                          }
                          placeholder="name@example.com"
                          className="w-full h-12 px-4 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                        />
                      </label>
                    )}
                    {showInquiryType && (
                      <OptionOrCustomField
                        label="詢問類別"
                        value={contactForm.inquiryType}
                        onChange={(val) => setContactForm({ ...contactForm, inquiryType: val })}
                        options={INQUIRY_TYPE_PRESETS}
                        placeholder="請輸入您的自訂詢問類別..."
                      />
                    )}
                  </div>
                )}

                {showInquiryMessage && (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-[#51443d]">需求說明與希望預約日期 *</span>
                    <textarea
                      required
                      rows={4}
                      value={contactForm.message}
                      onChange={(e) =>
                        setContactForm({ ...contactForm, message: e.target.value })
                      }
                      placeholder="請告訴我們預計參加人數、喜歡的工藝類型或疑問..."
                      className="w-full p-4 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                    />
                  </label>
                )}

                {contactError && <p className="text-xs text-[#ba1a1a]">{contactError}</p>}
                {!firebaseReady && (
                  <p className="text-xs text-[#73594c]">
                    送出表單時將先引導您進行一次安全連線驗證以確保資料安全寫入資料庫。
                  </p>
                )}

                {isFieldVisible(contactVis, 'submitText') && (
                  <button
                    type="submit"
                    disabled={contactSubmitting}
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 h-12 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {contactSubmitting ? '傳送寫入中...' : siteContent.contactSection.submitText}
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {renderCustomBlocks('contact')}
    </div>
  );
};
