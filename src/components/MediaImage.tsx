import React, { useEffect, useState } from 'react';
import { fetchMediaAssetById } from '../services/firestoreService';

const memoryMediaCache = new Map<string, string>();

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
      return memoryMediaCache.get(id) || '';
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
      const cached = memoryMediaCache.get(id);
      if (cached) {
        setResolvedSrc(cached);
        return;
      }
      fetchMediaAssetById(id)
        .then((asset) => {
          if (!active) return;
          if (asset?.dataUrl) {
            memoryMediaCache.set(id, asset.dataUrl);
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
