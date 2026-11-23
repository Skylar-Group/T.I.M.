import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { HeroSlide } from '../types/atelier';
import { MediaImage } from './MediaImage';

interface HeroSliderProps {
  slides?: HeroSlide[];
  fallbackImageUrl?: string;
  altTitle: string;
  autoPlay?: boolean;
  intervalSec?: number;
}

export const HeroSlider: React.FC<HeroSliderProps> = ({
  slides,
  fallbackImageUrl,
  altTitle,
  autoPlay = true,
  intervalSec = 5,
}) => {
  const visibleSlides: HeroSlide[] = React.useMemo(() => {
    const list = (slides || [])
      .filter((s) => s.isVisible && Boolean(s.imageUrl))
      .sort((a, b) => a.order - b.order);
    if (list.length > 0) return list;
    if (fallbackImageUrl) {
      return [
        {
          id: 'fallback-hero-slide',
          imageUrl: fallbackImageUrl,
          caption: '',
          captionVisible: false,
          isVisible: true,
          order: 1,
        },
      ];
    }
    return [];
  }, [slides, fallbackImageUrl]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (currentIndex >= visibleSlides.length) {
      setCurrentIndex(0);
    }
  }, [visibleSlides.length, currentIndex]);

  useEffect(() => {
    if (!autoPlay || isPaused || visibleSlides.length <= 1) return;
    const ms = Math.max(2000, Math.min(30000, (intervalSec || 5) * 1000));
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % visibleSlides.length);
    }, ms);
    return () => window.clearInterval(timer);
  }, [autoPlay, isPaused, intervalSec, visibleSlides.length]);

  if (visibleSlides.length === 0) return null;

  const activeSlide = visibleSlides[currentIndex] || visibleSlides[0];
  const hasMultiple = visibleSlides.length > 1;
  const showCaption = activeSlide.captionVisible !== false && Boolean(activeSlide.caption?.trim());

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + visibleSlides.length) % visibleSlides.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % visibleSlides.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasMultiple) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null || !hasMultiple) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
        const diff = endX - touchStartX.current;
        if (Math.abs(diff) > 40) {
          if (diff > 0) handlePrev();
          else handleNext();
        }
        touchStartX.current = null;
      }}
      aria-roledescription="carousel"
      aria-label={altTitle}
      className="lg:col-span-6 rounded-lg overflow-hidden border border-[#e0d8d3] shadow-warm bg-[#fcf9f8] flex flex-col self-center focus:outline-none focus:ring-2 focus:ring-[#8c5e43]/30"
    >
      <div className="relative w-full bg-[#fcf9f8] flex items-center justify-center overflow-hidden">
        <MediaImage
          key={activeSlide.id + activeSlide.imageUrl}
          src={activeSlide.imageUrl}
          alt={activeSlide.caption || altTitle}
          className="w-full h-auto max-h-[540px] object-contain block transition-opacity duration-300"
        />

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="上一張主視覺圖片"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-[#e0d8d3] text-[#73594c] hover:text-[#1b1c1c] hover:bg-white shadow-sm flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="下一張主視覺圖片"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-[#e0d8d3] text-[#73594c] hover:text-[#1b1c1c] hover:bg-white shadow-sm flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {(showCaption || hasMultiple) && (
        <div className="bg-white border-t border-[#e0d8d3] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {showCaption && (
              <p className="text-xs text-[#51443d] leading-relaxed whitespace-pre-line">
                {activeSlide.caption}
              </p>
            )}
          </div>

          {hasMultiple && (
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-1.5" role="tablist" aria-label="主視覺幻燈片切換">
                {visibleSlides.map((slide, idx) => {
                  const isActive = idx === currentIndex;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`切換至第 ${idx + 1} 張圖片`}
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        isActive ? 'w-5 bg-[#8c5e43]' : 'w-2 bg-[#e0d8d3] hover:bg-[#b0704c]/60'
                      }`}
                    />
                  );
                })}
              </div>
              <span className="text-[11px] text-[#73594c] tabular-nums">
                {currentIndex + 1} / {visibleSlides.length}
              </span>
              {autoPlay && (
                <button
                  type="button"
                  onClick={() => setIsPaused((p) => !p)}
                  aria-label={isPaused ? '繼續自動輪播' : '暫停自動輪播'}
                  className="p-1 rounded hover:bg-[#f6f3f2] text-[#73594c] cursor-pointer"
                >
                  {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
