import React, { useEffect, useState } from 'react';
import { fetchMediaAssetById } from '../services/firestoreService';

const memoryMediaCache = new Map<string, string>();
const MEDIA_STORAGE_PREFIX = 'atelier_media_cache_v1_';

function getCachedMedia(id: string): string {
  const inMem = memoryMediaCache.get(id);
  if (inMem) return inMem;
  try {
    const stored = window.localStorage.getItem(`${MEDIA_STORAGE_PREFIX}${id}`);
    if (stored) {
      memoryMediaCache.set(id, stored);
      return stored;
    }
  } catch {
    // ignore storage errors
  }
  return '';
}

function setCachedMedia(id: string, dataUrl: string): void {
  memoryMediaCache.set(id, dataUrl);
  if (dataUrl.length <= 220000) {
    try {
      window.localStorage.setItem(`${MEDIA_STORAGE_PREFIX}${id}`, dataUrl);
    } catch {
      // ignore quota errors
    }
  }
}

interface MediaImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export const MediaImage: React.FC<MediaImageProps> = ({
  src,
  alt,
  className = '',
  fallbackLabel,
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(() => {
    if (!src) return '';
    if (src.startsWith('media://')) {
      const id = src.replace('media://', '');
      return getCachedMedia(id);
    }
    return src;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    if (!src) {
      setResolvedSrc('');
      return;
    }
    if (src.startsWith('media://')) {
      const id = src.replace('media://', '');
      const cached = getCachedMedia(id);
      if (cached) {
        setResolvedSrc(cached);
        return;
      }
      fetchMediaAssetById(id)
        .then((asset) => {
          if (!active) return;
          if (asset?.dataUrl) {
            setCachedMedia(id, asset.dataUrl);
            setResolvedSrc(asset.dataUrl);
          } else {
            setFailed(true);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    } else {
      setResolvedSrc(src);
    }
    return () => {
      active = false;
    };
  }, [src]);

  if (!src || failed || !resolvedSrc) {
    return (
      <div
        className={`bg-gradient-to-br from-[#f6f3f2] to-[#e8ded8] flex flex-col items-center justify-center text-[#73594c] p-6 select-none ${
          className.includes('h-auto') ? 'min-h-[240px] w-full' : ''
        } ${className}`}
        role="img"
        aria-label={alt}
      >
        <svg
          className="w-10 h-10 mb-2 opacity-60"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M12 3c2.5 3.5 4 6 4 9a4 4 0 1 1-8 0c0-3 1.5-5.5 4-9Z" />
          <path d="M5 20h14" />
        </svg>
        <span className="text-xs tracking-wider text-center opacity-80">
          {fallbackLabel || alt || '工坊影像'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
