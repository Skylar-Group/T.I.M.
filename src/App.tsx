/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  DEFAULT_ARTISANS,
  DEFAULT_COURSES,
  DEFAULT_GALLERY,
  DEFAULT_SITE_CONTENT,
} from './data/defaultSeed';
import { auth, SUPER_ADMIN_EMAIL } from './lib/firebase';
import {
  fetchArtisans,
  fetchCourses,
  fetchGalleryWorks,
  fetchSiteContent,
  seedDatabaseIfEmpty,
} from './services/firestoreService';
import {
  Artisan,
  Course,
  GalleryWork,
  isFieldVisible,
  Member,
  PublicPageKey,
  SiteContent,
} from './types/atelier';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MediaImage } from './components/MediaImage';
import { Navbar } from './components/Navbar';
import { StorefrontPages } from './components/StorefrontPages';
import { EnrollmentModal } from './components/EnrollmentModal';
import { MemberCenter } from './components/MemberCenter';
import { AdminConsole } from './components/AdminConsole';

function AtelierApp() {
  const [currentPage, setCurrentPage] = useState<PublicPageKey | 'course-detail' | 'admin'>('home');
  const [siteContent, setSiteContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  const [courses, setCourses] = useState<Course[]>(
    DEFAULT_COURSES.map((c, idx) => ({ ...c, id: `seed-course-${idx + 1}` }))
  );
  const [artisans, setArtisans] = useState<Artisan[]>(
    DEFAULT_ARTISANS.map((a, idx) => ({ ...a, id: `seed-artisan-${idx + 1}` }))
  );
  const [galleryWorks, setGalleryWorks] = useState<GalleryWork[]>(
    DEFAULT_GALLERY.map((g, idx) => ({ ...g, id: `seed-gallery-${idx + 1}` }))
  );

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [bookingCourse, setBookingCourse] = useState<Course | null>(null);
  const [activeMember, setActiveMember] = useState<Member | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [firebaseReady, setFirebaseReady] = useState(false);

  const loadPublicData = useCallback(async () => {
    try {
      const [content, crs, arts, gal] = await Promise.all([
        fetchSiteContent(),
        fetchCourses(),
        fetchArtisans(),
        fetchGalleryWorks(),
      ]);
      setSiteContent(content);
      if (crs.length > 0) setCourses(crs);
      if (arts.length > 0) setArtisans(arts);
      if (gal.length > 0) setGalleryWorks(gal);
    } catch (err) {
      console.warn('Using default storefront content until Firestore is seeded:', err);
    }
  }, []);

  useEffect(() => {
    void loadPublicData();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseReady(Boolean(user));
      if (user && user.email === SUPER_ADMIN_EMAIL && user.emailVerified) {
        await seedDatabaseIfEmpty();
        await loadPublicData();
      }
    });
    return () => unsub();
  }, [loadPublicData]);

  const handleNavigate = (page: PublicPageKey | 'admin') => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (currentPage === 'admin') {
    return (
      <AdminConsole
        siteContent={siteContent}
        onSiteContentChange={(updated) => setSiteContent(updated)}
        onCatalogRefresh={loadPublicData}
        onExitToStorefront={() => handleNavigate('home')}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fcf9f8] text-[#1b1c1c]">
      <Navbar
        siteContent={siteContent}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        unreadNotifications={unreadNotifications}
        memberName={activeMember?.name}
      />

      <main className="flex-1">
        {currentPage === 'member' ? (
          <MemberCenter
            activeMember={activeMember}
            siteContent={siteContent}
            firebaseReady={firebaseReady}
            onMemberLogin={(member) => setActiveMember(member)}
            onMemberLogout={() => {
              setActiveMember(null);
              setUnreadNotifications(0);
            }}
            onNotificationsChange={setUnreadNotifications}
            onOpenAdmin={() => handleNavigate('admin')}
          />
        ) : (
          <StorefrontPages
            page={currentPage}
            siteContent={siteContent}
            courses={courses}
            artisans={artisans}
            galleryWorks={galleryWorks}
            selectedCourse={selectedCourse}
            onNavigate={handleNavigate}
            onSelectCourse={(course) => {
              setSelectedCourse(course);
              setCurrentPage('course-detail');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onBookCourse={(course) => setBookingCourse(course)}
            firebaseReady={firebaseReady}
          />
        )}
      </main>

      {siteContent.footer.isVisible && (
        <footer className="bg-[#f6f3f2] border-t border-[#e0d8d3] mt-12">
          <div className="max-w-[1280px] mx-auto px-5 md:px-12 py-12 flex flex-col md:flex-row justify-between gap-8">
            <div className="space-y-2 max-w-md">
              {(siteContent.brandVisible || (siteContent.brandLogoVisible && siteContent.brandLogoUrl)) && (
                <div className="flex items-center gap-2.5">
                  {siteContent.brandLogoVisible && siteContent.brandLogoUrl && (
                    <MediaImage
                      src={siteContent.brandLogoUrl}
                      alt={siteContent.brandName || '品牌標誌'}
                      className="h-12 w-auto max-w-[140px] object-contain shrink-0"
                    />
                  )}
                  {siteContent.brandVisible && (
                    <p className="text-lg font-serif text-[#1b1c1c]">{siteContent.brandName}</p>
                  )}
                </div>
              )}
              {isFieldVisible(siteContent.footer.fieldVisibility, 'tagline') &&
                siteContent.footer.tagline && (
                  <p className="text-sm text-[#51443d]">{siteContent.footer.tagline}</p>
                )}
              {isFieldVisible(siteContent.footer.fieldVisibility, 'addressLine') &&
                siteContent.footer.addressLine && (
                  <p className="text-xs text-[#73594c]">{siteContent.footer.addressLine}</p>
                )}
            </div>

            <div className="flex flex-col sm:items-end justify-between gap-4">
              <div className="flex flex-wrap gap-5 text-xs font-medium text-[#73594c]">
                <button
                  type="button"
                  onClick={() => handleNavigate('courses')}
                  className="hover:text-[#70472d] cursor-pointer"
                >
                  體驗課程
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('gallery')}
                  className="hover:text-[#70472d] cursor-pointer"
                >
                  作品藝廊
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('contact')}
                  className="hover:text-[#70472d] cursor-pointer"
                >
                  聯絡預約
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('member')}
                  className="hover:text-[#70472d] cursor-pointer"
                >
                  會員中心
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('admin')}
                  className="hover:text-[#70472d] underline underline-offset-4 cursor-pointer"
                >
                  管理員後台
                </button>
              </div>
              {isFieldVisible(siteContent.footer.fieldVisibility, 'copyrightText') &&
                siteContent.footer.copyrightText && (
                  <p className="text-xs text-[#51443d]">{siteContent.footer.copyrightText}</p>
                )}
            </div>
          </div>
        </footer>
      )}

      {bookingCourse && (
        <EnrollmentModal
          course={bookingCourse}
          siteContent={siteContent}
          activeMember={activeMember}
          firebaseReady={firebaseReady}
          onMemberAuthenticated={(m) => setActiveMember(m)}
          onClose={() => setBookingCourse(null)}
          onSuccessGoToMemberCenter={() => {
            setBookingCourse(null);
            handleNavigate('member');
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AtelierApp />
    </ErrorBoundary>
  );
}
