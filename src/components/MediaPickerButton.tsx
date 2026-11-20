import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Upload, X, Check, Sparkles } from 'lucide-react';
import { MediaAsset } from '../types/atelier';
import { GENERATED_IMAGES } from '../data/defaultSeed';
import {
  BgRemovalMode,
  removeBackgroundAndSaveAsset,
  uploadMediaAsset,
} from '../services/firestoreService';
import { MediaImage } from './MediaImage';

interface MediaPickerButtonProps {
  value: string;
  onChange: (newUrl: string) => void;
  category: MediaAsset['category'];
  mediaAssets: MediaAsset[];
  onUploaded: (asset: MediaAsset) => void;
  label?: string;
  allowBgRemoval?: boolean;
}

export const MediaPickerButton: React.FC<MediaPickerButtonProps> = ({
  value,
  onChange,
  category,
  mediaAssets,
  onUploaded,
  label = '圖片設定',
  allowBgRemoval = false,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [processingBg, setProcessingBg] = useState(false);
  const [autoRemoveBg, setAutoRemoveBg] = useState<BgRemovalMode>(allowBgRemoval ? 'auto' : 'none');
  const [showLibrary, setShowLibrary] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const asset = await uploadMediaAsset(file, category, category !== 'receipt', undefined, {
        removeBackground: allowBgRemoval ? autoRemoveBg : 'none',
        maxDim: allowBgRemoval ? 640 : undefined,
      });
      onUploaded(asset);
      onChange(`media://${asset.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '圖片上傳失敗');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemoveExistingBg = async (mode: BgRemovalMode) => {
    if (!value) return;
    setError('');
    setProcessingBg(true);
    try {
      const asset = await removeBackgroundAndSaveAsset(
        value,
        category,
        category !== 'receipt',
        mode,
        '品牌 Logo（已退地）'
      );
      onUploaded(asset);
      onChange(`media://${asset.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '退地處理失敗');
    } finally {
      setProcessingBg(false);
    }
  };

  const builtInPresets = [
    { label: '存心·傳意 官方透明 Logo（PNG 原檔）', url: GENERATED_IMAGES.brandLogo, isLogo: true },
    { label: '工坊全景主視覺', url: GENERATED_IMAGES.heroStudio, isLogo: false },
    { label: '陶藝手拉坯實景', url: GENERATED_IMAGES.ceramicWheel, isLogo: false },
    { label: '木工手鑿工作桌', url: GENERATED_IMAGES.woodTurning, isLogo: false },
    { label: '茶道侘寂器皿', url: GENERATED_IMAGES.teaCeremony, isLogo: false },
    { label: '駐店職人肖像', url: GENERATED_IMAGES.artisanMaster, isLogo: false },
    { label: '藝廊陳列陶器', url: GENERATED_IMAGES.galleryVessels, isLogo: false },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-[#51443d]">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading || processingBg}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? '處理入庫中...' : '從電腦上傳圖片'}
          </button>
          <button
            type="button"
            onClick={() => setShowLibrary(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e0d8d3] bg-white text-[#73594c] text-xs font-medium hover:bg-[#e8ded8]/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            從媒體庫挑選
          </button>
        </div>
      </div>

      {allowBgRemoval && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#51443d] bg-[#f6f3f2] px-3 py-2 rounded-lg border border-[#e0d8d3]">
          <span className="font-medium text-[#70472d]">上傳退地選項：</span>
          {[
            { key: 'auto', label: '自動偵測透明／純色底去背（推薦）' },
            { key: 'black', label: '強制去純黑底' },
            { key: 'white', label: '強制去純白底' },
            { key: 'none', label: '保留原圖不處理' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setAutoRemoveBg(opt.key as BgRemovalMode)}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                autoRemoveBg === opt.key
                  ? 'bg-[#8c5e43] text-white border-[#8c5e43]'
                  : 'bg-white text-[#51443d] border-[#e0d8d3] hover:bg-[#e8ded8]/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {value && (
        <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg border border-[#e0d8d3] bg-[#fcf9f8]">
          <div className="w-16 h-12 rounded overflow-hidden shrink-0 border border-[#e0d8d3] bg-[#fcf9f8] flex items-center justify-center p-1">
            <MediaImage
              src={value}
              alt={label}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#51443d] truncate">
              {value.startsWith('media://') ? `資料庫媒體 ID：${value.replace('media://', '')}` : value}
            </p>
            {allowBgRemoval && (
              <p className="text-[11px] text-[#73594c] mt-0.5">
                支援透明 PNG／WebP／SVG；若現有 Logo 仍有黑底或白底，可直接點擊右側一鍵退地。
              </p>
            )}
          </div>
          {allowBgRemoval && (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={processingBg}
                onClick={() => void handleRemoveExistingBg('black')}
                className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-[#e8ded8] text-[#70472d] text-xs font-medium hover:bg-[#e0d8d3] cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {processingBg ? '退地中...' : '一鍵去黑底'}
              </button>
              <button
                type="button"
                disabled={processingBg}
                onClick={() => void handleRemoveExistingBg('white')}
                className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-[#e0d8d3] bg-white text-[#73594c] text-xs font-medium hover:bg-[#e8ded8]/40 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                一鍵去白底
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-[#ba1a1a]">{error}</p>}

      {showLibrary && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-[#e0d8d3] rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col shadow-warm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0d8d3]">
              <h3 className="text-lg font-serif text-[#1b1c1c]">選擇圖片（資料庫媒體庫與內建圖庫）</h3>
              <button
                type="button"
                onClick={() => setShowLibrary(false)}
                className="p-1.5 rounded-lg hover:bg-[#f6f3f2] text-[#51443d] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <h4 className="text-sm font-medium text-[#73594c] mb-3">
                  已上傳至資料庫的電腦圖片（{mediaAssets.filter((m) => m.isPublic).length} 張）
                </h4>
                {mediaAssets.filter((m) => m.isPublic).length === 0 ? (
                  <p className="text-xs text-[#51443d] bg-[#f6f3f2] p-4 rounded-lg border border-[#e0d8d3]">
                    尚未上傳過電腦圖片，點擊上方「從電腦上傳圖片」即可將圖片存入雲端資料庫並於此挑選。
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {mediaAssets
                      .filter((m) => m.isPublic)
                      .map((asset) => {
                        const refUrl = `media://${asset.id}`;
                        const selected = value === refUrl;
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => {
                              onChange(refUrl);
                              setShowLibrary(false);
                            }}
                            className={`text-left rounded-lg border overflow-hidden transition-all cursor-pointer ${
                              selected
                                ? 'border-[#8c5e43] ring-2 ring-[#8c5e43]/25'
                                : 'border-[#e0d8d3] hover:border-[#8c5e43]'
                            }`}
                          >
                            <div className="aspect-[4/3] relative bg-[#fcf9f8] flex items-center justify-center">
                              <img
                                src={asset.dataUrl}
                                alt={asset.title}
                                className={`w-full h-full object-contain ${
                                  asset.mimeType === 'image/png' ||
                                  asset.mimeType === 'image/webp' ||
                                  asset.mimeType === 'image/svg+xml'
                                    ? 'p-2'
                                    : ''
                                }`}
                              />
                              {selected && (
                                <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#8c5e43] text-white flex items-center justify-center">
                                  <Check className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                            <div className="p-2.5 bg-white">
                              <p className="text-xs font-medium text-[#1b1c1c] truncate">
                                {asset.title}
                              </p>
                              <p className="text-[11px] text-[#51443d] tabular-nums">
                                {Math.round(asset.sizeBytes / 1024)} KB
                              </p>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-[#73594c] mb-3">工坊精選內建攝影素材</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {builtInPresets.map((preset) => {
                    const selected = value === preset.url;
                    return (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => {
                          onChange(preset.url);
                          setShowLibrary(false);
                        }}
                        className={`text-left rounded-lg border overflow-hidden transition-all cursor-pointer ${
                          selected
                            ? 'border-[#8c5e43] ring-2 ring-[#8c5e43]/25'
                            : 'border-[#e0d8d3] hover:border-[#8c5e43]'
                        }`}
                      >
                        <div className="aspect-[4/3] bg-[#fcf9f8] flex items-center justify-center">
                          <img
                            src={preset.url}
                            alt={preset.label}
                            className={`w-full h-full object-contain ${preset.isLogo ? 'p-3' : ''}`}
                          />
                        </div>
                        <div className="p-2.5 bg-white">
                          <p className="text-xs font-medium text-[#1b1c1c] truncate">
                            {preset.label}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
