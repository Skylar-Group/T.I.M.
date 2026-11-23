import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { PublicPageKey, SiteContent } from '../types/atelier';
import { MediaImage } from './MediaImage';

interface NavbarProps {
  siteContent: SiteContent;
  isBrandHydrated?: boolean;
  currentPage: PublicPageKey | 'admin' | 'course-detail';
  onNavigate: (page: PublicPageKey | 'admin') => void;
  unreadNotifications: number;
  memberName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  siteContent,
  isBrandHydrated = true,
  currentPage,
  onNavigate,
  unreadNotifications,
  memberName,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const maxNavItems = Math.min(
    12,
    Math.max(1, Math.round(Number(siteContent.maxNavItems ?? 5)) || 5)
  );

  const visibleNavItems = [...(siteContent.navItems || [])]
    .filter((item) => item.isVisible)
    .sort((a, b) => a.order - b.order)
    .slice(0, maxNavItems);

  const ctaLabel = memberName
    ? unreadNotifications > 0
      ? `會員中心 (${unreadNotifications})`
      : '會員中心'
    : '會員登入 / 報名查詢';

  const showLogo = Boolean((siteContent.brandLogoVisible ?? true) && siteContent.brandLogoUrl);
  const showBrandLockup = siteContent.brandVisible || showLogo;

  return (
    <header className="sticky top-0 z-40 bg-[#fcf9f8]/95 backdrop-blur-sm border-b border-[#e0d8d3]">
      <div className="max-w-[1360px] mx-auto px-4 md:px-8 h-20 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Logo + Wordmark */}
        {!isBrandHydrated ? (
          <div className="flex items-center gap-2.5 min-w-0 md:shrink-0" aria-hidden="true">
            <div className="h-9 w-9 rounded-lg bg-[#e8ded8]/60 animate-pulse shrink-0" />
            <div className="h-5 w-32 rounded bg-[#e8ded8]/60 animate-pulse" />
          </div>
        ) : showBrandLockup ? (
          <button
            type="button"
            onClick={() => {
              onNavigate('home');
              setMobileOpen(false);
            }}
            title={siteContent.brandName}
            className="flex items-center gap-2.5 min-w-0 md:shrink-0 text-left cursor-pointer group"
          >
            {showLogo && (
              <MediaImage
                src={siteContent.brandLogoUrl}
                alt={siteContent.brandName || '品牌標誌'}
                className="h-12 w-auto max-w-[140px] object-contain shrink-0"
              />
            )}
            {siteContent.brandVisible && (
              <span className="text-sm sm:text-base lg:text-[17px] font-serif font-medium tracking-[0.02em] text-[#1b1c1c] group-hover:text-[#70472d] transition-colors truncate md:overflow-visible md:whitespace-nowrap">
                {siteContent.brandName}
              </span>
            )}
          </button>
        ) : (
          <div className="shrink-0" />
        )}

        {/* Zone 2: Clean text nav links */}
        <nav className="hidden lg:flex flex-wrap items-center justify-center gap-x-5 gap-y-1 xl:gap-x-6 text-sm font-medium text-[#51443d] min-w-0">
          {visibleNavItems.map((item) => {
            const isActive =
              currentPage === item.pageKey ||
              (currentPage === 'course-detail' && item.pageKey === 'courses');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.pageKey)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'border-[#8c5e43] text-[#70472d]'
                    : 'border-transparent hover:text-[#1b1c1c] hover:border-[#e0d8d3]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action + Mobile Menu Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onNavigate('member');
              setMobileOpen(false);
            }}
            className="hidden sm:inline-flex items-center justify-center px-4 h-10 rounded-lg bg-[#8c5e43] text-white text-sm font-medium tracking-[0.04em] hover:bg-[#73594c] transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
          >
            {ctaLabel}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-lg border border-[#e0d8d3] text-[#51443d] hover:bg-[#e8ded8]/40 cursor-pointer"
            aria-label="切換選單"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[#e0d8d3] bg-[#fcf9f8] px-5 py-4 space-y-2">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.pageKey);
                setMobileOpen(false);
              }}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#1b1c1c] hover:bg-[#e8ded8]/60"
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onNavigate('member');
              setMobileOpen(false);
            }}
            className="block w-full text-center px-4 py-3 rounded-lg bg-[#8c5e43] text-white text-sm font-medium mt-2"
          >
            {ctaLabel}
          </button>
        </div>
      )}
    </header>
  );
};
