import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, History, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import {
  deleteCmsRevision,
  formatDateTime,
  saveSiteContentWithRevision,
} from '../services/firestoreService';
import {
  AdminUser,
  CmsRevision,
  CustomBlock,
  HERO_KICKER_SIZE_CLASS,
  HERO_KICKER_SIZE_OPTIONS,
  HeroSlide,
  isFieldVisible,
  MediaAsset,
  PublicPageKey,
  SiteContent,
} from '../types/atelier';
import { GENERATED_IMAGES } from '../data/defaultSeed';
import { MediaPickerButton } from './MediaPickerButton';
import {
  OptionOrCustomField,
  TextAreaFieldWithVisibility,
  TextFieldWithVisibility,
} from './FormControls';

const HK_BANK_PRESETS = [
  '香港上海滙豐銀行 HSBC',
  '中國銀行（香港）BOCHK',
  '恒生銀行 Hang Seng Bank',
  '渣打銀行（香港）Standard Chartered',
  '轉數快 FPS',
  '東亞銀行 BEA',
];

interface AdminCmsEditorProps {
  siteContent: SiteContent;
  revisions: CmsRevision[];
  mediaAssets: MediaAsset[];
  activeAdmin: AdminUser;
  onMediaUploaded: (asset: MediaAsset) => void;
  onSiteContentPublished: (updated: SiteContent) => void;
  onRevisionsRefresh: () => Promise<void>;
}

const VisibilityToggle: React.FC<{
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
}> = ({ checked, onChange, label = '前台顯示' }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
      checked
        ? 'bg-[#e8ded8] border-[#8c5e43] text-[#70472d]'
        : 'bg-[#f6f3f2] border-[#e0d8d3] text-[#51443d]'
    }`}
  >
    {checked ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
    {label}：{checked ? '顯示中' : '已隱藏'}
  </button>
);

export const AdminCmsEditor: React.FC<AdminCmsEditorProps> = ({
  siteContent,
  revisions,
  mediaAssets,
  activeAdmin,
  onMediaUploaded,
  onSiteContentPublished,
  onRevisionsRefresh,
}) => {
  const normalizeDraftContent = (raw: SiteContent): SiteContent => {
    const cloned: SiteContent = JSON.parse(JSON.stringify(raw));
    const existingSlides = Array.isArray(cloned.hero?.slides)
      ? cloned.hero.slides
      : cloned.hero?.imageUrl
      ? [
          {
            id: 'hero-slide-1',
            imageUrl: cloned.hero.imageUrl,
            caption: '',
            captionVisible: false,
            isVisible: true,
            order: 1,
          },
        ]
      : [];
    return {
      ...cloned,
      hero: {
        ...cloned.hero,
        slides: existingSlides,
        slideAutoPlay: cloned.hero?.slideAutoPlay ?? true,
        slideIntervalSec: cloned.hero?.slideIntervalSec ?? 5,
      },
      brandLogoUrl: cloned.brandLogoUrl ?? '',
      brandLogoVisible: cloned.brandLogoVisible ?? true,
    };
  };

  const [draft, setDraft] = useState<SiteContent>(() => normalizeDraftContent(siteContent));
  const [sectionTab, setSectionTab] = useState<
    'brand_nav' | 'hero' | 'philosophy' | 'sections' | 'contact_bank' | 'footer' | 'custom_blocks'
  >('hero');
  const [revisionTitle, setRevisionTitle] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const handleSaveAndPublish = async () => {
    setSaving(true);
    setStatusMsg('');
    try {
      const title =
        revisionTitle.trim() ||
        `CMS 更新（${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}）`;
      await saveSiteContentWithRevision(
        draft,
        title,
        revisionNote.trim() || '更新前台文字、圖片與可視化配置',
        activeAdmin.name,
        activeAdmin.phone
      );
      onSiteContentPublished({ ...draft, updatedBy: activeAdmin.name });
      await onRevisionsRefresh();
      setRevisionTitle('');
      setRevisionNote('');
      setStatusMsg('已成功發佈至前台，並永久儲存本次版本快照於資料庫！');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleRecallRevision = (rev: CmsRevision) => {
    setDraft(normalizeDraftContent(rev.snapshot));
    setRevisionTitle(`延續修改：${rev.revisionTitle}`);
    setShowHistory(false);
    setStatusMsg(`已載入「${rev.revisionTitle}」到編輯器，您可繼續修改並重新發佈。`);
  };

  const updateHeroSlides = (nextSlides: HeroSlide[]) => {
    const normalized = nextSlides.map((s, idx) => ({ ...s, order: idx + 1 }));
    const firstImg = normalized.find((s) => s.isVisible && s.imageUrl)?.imageUrl || normalized[0]?.imageUrl || '';
    setDraft({
      ...draft,
      hero: {
        ...draft.hero,
        slides: normalized,
        imageUrl: firstImg || draft.hero.imageUrl,
      },
    });
  };

  const handleAddHeroSlide = () => {
    const slides = draft.hero.slides || [];
    const newSlide: HeroSlide = {
      id: `hero-slide-${Date.now()}`,
      imageUrl: GENERATED_IMAGES.heroStudio,
      caption: '',
      captionVisible: true,
      isVisible: true,
      order: slides.length + 1,
    };
    updateHeroSlides([...slides, newSlide]);
  };

  const handleMoveHeroSlide = (index: number, direction: -1 | 1) => {
    const slides = [...(draft.hero.slides || [])];
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    [slides[index], slides[target]] = [slides[target], slides[index]];
    updateHeroSlides(slides);
  };

  const handleAddNavItem = () => {
    const nextOrder = draft.navItems.length + 1;
    setDraft({
      ...draft,
      navItems: [
        ...draft.navItems,
        {
          id: `nav-${Date.now()}`,
          label: '新導覽項目',
          pageKey: 'courses',
          isVisible: true,
          order: nextOrder,
        },
      ],
    });
  };

  const handleAddPillar = () => {
    const num = String(draft.philosophy.pillars.length + 1).padStart(2, '0');
    setDraft({
      ...draft,
      philosophy: {
        ...draft.philosophy,
        pillars: [
          ...draft.philosophy.pillars,
          {
            id: `pillar-${Date.now()}`,
            number: num,
            title: '新增工藝理念標題',
            description: '輸入關於工坊理念的細膩描述...',
            isVisible: true,
          },
        ],
      },
    });
  };

  const handleAddCustomBlock = () => {
    const newBlock: CustomBlock = {
      id: `block-${Date.now()}`,
      pageKey: 'home',
      title: '新增工坊自訂主題區塊',
      subtitle: 'SEASONAL HIGHLIGHT',
      body: '您可以在此編輯文字內容，並上傳專屬電腦圖片或設定顯示／隱藏狀態。',
      imageUrl: '',
      imageVisible: true,
      ctaLabel: '前往課程總覽',
      ctaTarget: 'courses',
      isVisible: true,
      order: (draft.customBlocks?.length || 0) + 1,
    };
    setDraft({
      ...draft,
      customBlocks: [...(draft.customBlocks || []), newBlock],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-[#e0d8d3] rounded-lg p-6">
        <div>
          <h2 className="text-2xl font-serif text-[#1b1c1c]">全站畫面 CMS 與版本控制中心</h2>
          <p className="text-sm text-[#51443d]">
            控制全站每一個文字、圖片的新增／修改／刪除與可視化狀態，每一次儲存皆留存歷史版本可回頭叫出再編輯。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-[#e0d8d3] bg-white text-[#73594c] text-xs font-medium hover:bg-[#e8ded8]/60 cursor-pointer whitespace-nowrap shrink-0"
          >
            <History className="w-4 h-4" />
            版本歷史紀錄 ({revisions.length})
          </button>
        </div>
      </div>

      {/* Save Bar */}
      <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
        <label className="lg:col-span-4 block space-y-1">
          <span className="text-xs font-medium text-[#51443d]">本次修改版本名稱（便於日後叫回）</span>
          <input
            type="text"
            value={revisionTitle}
            onChange={(e) => setRevisionTitle(e.target.value)}
            placeholder="例如：春季陶藝主視覺換圖"
            className="w-full h-10 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm"
          />
        </label>
        <label className="lg:col-span-5 block space-y-1">
          <span className="text-xs font-medium text-[#51443d]">修改備註說明</span>
          <input
            type="text"
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            placeholder="記錄本次更新了哪些區塊或圖片..."
            className="w-full h-10 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm"
          />
        </label>
        <div className="lg:col-span-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveAndPublish()}
            className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '儲存發佈中...' : '儲存版本並發佈前台'}
          </button>
        </div>
        {statusMsg && (
          <p className="lg:col-span-12 text-xs font-medium text-[#70472d] pt-1">{statusMsg}</p>
        )}
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'hero', label: '首頁主視覺 Hero' },
          { key: 'brand_nav', label: '品牌與導覽列' },
          { key: 'philosophy', label: '工坊理念與支柱' },
          { key: 'sections', label: '課程／藝廊／職人標題' },
          { key: 'contact_bank', label: '聯絡資訊與匯款帳號' },
          { key: 'footer', label: '頁尾 Footer' },
          { key: 'custom_blocks', label: `自訂圖文區塊 (${draft.customBlocks?.length || 0})` },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSectionTab(t.key as typeof sectionTab)}
            className={`px-4 h-9 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              sectionTab === t.key
                ? 'bg-[#8c5e43] text-white'
                : 'bg-white border border-[#e0d8d3] text-[#73594c] hover:bg-[#e8ded8]/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Editor Panels */}
      <div className="bg-white border border-[#e0d8d3] rounded-lg p-6 md:p-8 space-y-6">
        {sectionTab === 'brand_nav' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0d8d3] pb-4">
              <h3 className="text-lg font-serif text-[#1b1c1c]">品牌標誌、名稱與頂部導覽列設定</h3>
              <div className="flex flex-wrap items-center gap-2">
                <VisibilityToggle
                  checked={draft.brandLogoVisible ?? true}
                  onChange={(val) => setDraft({ ...draft, brandLogoVisible: val })}
                  label="品牌 Logo"
                />
                <VisibilityToggle
                  checked={draft.brandVisible}
                  onChange={(val) => setDraft({ ...draft, brandVisible: val })}
                  label="品牌字標"
                />
              </div>
            </div>

            <div className="space-y-3 p-4 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3]">
              <MediaPickerButton
                label="網站品牌 Logo 圖片（顯示於網站名稱前方，支援透明 PNG／SVG 與自動退地）"
                category="cms"
                value={draft.brandLogoUrl || ''}
                onChange={(url) => setDraft({ ...draft, brandLogoUrl: url })}
                mediaAssets={mediaAssets}
                onUploaded={onMediaUploaded}
                allowBgRemoval
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      brandLogoUrl: GENERATED_IMAGES.brandLogo,
                      brandLogoVisible: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#e8ded8] text-[#70472d] text-xs font-medium hover:bg-[#e0d8d3] cursor-pointer"
                >
                  套用「存心·傳意」已退地透明 PNG 原檔 Logo
                </button>
                {draft.brandLogoUrl && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, brandLogoUrl: '' })}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[#e0d8d3] bg-white text-[#ba1a1a] text-xs font-medium hover:bg-[#ffdad6]/40 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    清除目前 Logo
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextFieldWithVisibility
                label="工坊品牌名稱"
                value={draft.brandName}
                onChange={(val) => setDraft({ ...draft, brandName: val })}
                visible={draft.brandVisible}
                onToggleVisible={(val) => setDraft({ ...draft, brandVisible: val })}
              />
              <label className="block space-y-1.5">
                <span className="block text-xs font-medium text-[#51443d]">
                  瀏覽器分頁顯示名稱（Tab 標題，留空則自動套用工坊品牌名稱）
                </span>
                <input
                  type="text"
                  maxLength={100}
                  value={draft.footer.browserTabTitle || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      footer: { ...draft.footer, browserTabTitle: e.target.value },
                    })
                  }
                  placeholder={draft.brandName || '例如：存心‧傳意 Timeless Inheritance Mission'}
                  className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm focus:outline-none focus:border-[#8c5e43]"
                />
                <span className="block text-[11px] text-[#73594c]">
                  發佈後會即時更新瀏覽器上方分頁顯示的網站名稱
                </span>
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[#1b1c1c]">頂部導覽選單項目（最多顯示前 5 項）</h4>
                <button
                  type="button"
                  onClick={handleAddNavItem}
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#e8ded8] text-[#70472d] text-xs font-medium hover:bg-[#e0d8d3] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增導覽項
                </button>
              </div>
              {draft.navItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-3 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3]"
                >
                  <label className="sm:col-span-4 block space-y-1">
                    <span className="block text-[11px] font-medium text-[#51443d]">選單顯示文字</span>
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => {
                        const next = [...draft.navItems];
                        next[idx] = { ...item, label: e.target.value };
                        setDraft({ ...draft, navItems: next });
                      }}
                      placeholder="選單顯示文字"
                      className="w-full h-10 px-3 rounded-lg bg-white border border-[#e0d8d3] text-sm"
                    />
                  </label>
                  <label className="sm:col-span-3 block space-y-1">
                    <span className="block text-[11px] font-medium text-[#51443d]">導向頁面</span>
                    <select
                      value={item.pageKey}
                      onChange={(e) => {
                        const next = [...draft.navItems];
                        next[idx] = { ...item, pageKey: e.target.value as PublicPageKey };
                        setDraft({ ...draft, navItems: next });
                      }}
                      className="w-full h-10 px-3 rounded-lg bg-white border border-[#e0d8d3] text-sm"
                    >
                      <option value="home">首頁</option>
                      <option value="courses">課程總覽</option>
                      <option value="gallery">作品藝廊</option>
                      <option value="artisans">職人介紹</option>
                      <option value="contact">聯絡預約</option>
                      <option value="member">會員中心</option>
                    </select>
                  </label>
                  <label className="sm:col-span-2 block space-y-1">
                    <span className="block text-[11px] font-medium text-[#51443d]">排序順序</span>
                    <input
                      type="number"
                      value={item.order}
                      onChange={(e) => {
                        const next = [...draft.navItems];
                        next[idx] = { ...item, order: Number(e.target.value) };
                        setDraft({ ...draft, navItems: next });
                      }}
                      className="w-full h-10 px-3 rounded-lg bg-white border border-[#e0d8d3] text-sm tabular-nums"
                    />
                  </label>
                  <div className="sm:col-span-3 flex items-center justify-end gap-2 pb-1">
                    <VisibilityToggle
                      checked={item.isVisible}
                      onChange={(val) => {
                        const next = [...draft.navItems];
                        next[idx] = { ...item, isVisible: val };
                        setDraft({ ...draft, navItems: next });
                      }}
                      label="顯示"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          navItems: draft.navItems.filter((n) => n.id !== item.id),
                        })
                      }
                      className="p-2 rounded-lg text-[#ba1a1a] hover:bg-[#ffdad6]/50 cursor-pointer"
                      aria-label="刪除導覽項"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sectionTab === 'hero' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0d8d3] pb-4">
              <h3 className="text-lg font-serif text-[#1b1c1c]">首頁主視覺 Hero 區塊</h3>
              <div className="flex items-center gap-2">
                <VisibilityToggle
                  checked={draft.hero.isVisible}
                  onChange={(val) =>
                    setDraft({ ...draft, hero: { ...draft.hero, isVisible: val } })
                  }
                  label="整個區塊"
                />
                <VisibilityToggle
                  checked={draft.hero.imageVisible}
                  onChange={(val) =>
                    setDraft({ ...draft, hero: { ...draft.hero, imageVisible: val } })
                  }
                  label="主視覺圖片"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextAreaFieldWithVisibility
                label="前導小標（留白標語）"
                rows={2}
                value={draft.hero.kicker}
                onChange={(val) => setDraft({ ...draft, hero: { ...draft.hero, kicker: val } })}
                visible={isFieldVisible(draft.hero.fieldVisibility, 'kicker')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    hero: {
                      ...draft.hero,
                      fieldVisibility: { ...(draft.hero.fieldVisibility || {}), kicker: val },
                    },
                  })
                }
              />
              <TextFieldWithVisibility
                label="主按鈕文字"
                value={draft.hero.ctaText}
                onChange={(val) => setDraft({ ...draft, hero: { ...draft.hero, ctaText: val } })}
                visible={isFieldVisible(draft.hero.fieldVisibility, 'ctaText')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    hero: {
                      ...draft.hero,
                      fieldVisibility: { ...(draft.hero.fieldVisibility || {}), ctaText: val },
                    },
                  })
                }
              />
            </div>

            {/* Kicker Font Size Control & Live Preview */}
            <div className="bg-[#fcf9f8] border border-[#e0d8d3] rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#51443d]">
                  前導小標（留白標語）字體大小設定
                </span>
                <span className="text-[11px] text-[#73594c]">
                  目前尺寸：
                  {HERO_KICKER_SIZE_OPTIONS.find(
                    (o) => o.value === (draft.hero.kickerSize || 'xs')
                  )?.label || '極小（預設）'}{' '}
                  (
                  {HERO_KICKER_SIZE_OPTIONS.find(
                    (o) => o.value === (draft.hero.kickerSize || 'xs')
                  )?.px || '12px'}
                  )
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {HERO_KICKER_SIZE_OPTIONS.map((opt) => {
                  const active = (draft.hero.kickerSize || 'xs') === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          hero: { ...draft.hero, kickerSize: opt.value },
                        })
                      }
                      className={`px-3 h-9 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#8c5e43] border-[#8c5e43] text-white'
                          : 'bg-white border-[#e0d8d3] text-[#51443d] hover:bg-[#e8ded8]/60'
                      }`}
                    >
                      {opt.label} · {opt.px}
                    </button>
                  );
                })}
              </div>
              <div className="bg-white border border-[#e0d8d3] rounded-lg px-4 py-3">
                <span className="block text-[11px] text-[#73594c] mb-1">前台實際字級預覽：</span>
                <p
                  className={`${
                    HERO_KICKER_SIZE_CLASS[draft.hero.kickerSize || 'xs']
                  } font-medium tracking-[0.08em] text-[#73594c] break-words whitespace-pre-line`}
                >
                  {draft.hero.kicker || '前導小標（留白標語）預覽文字'}
                </p>
              </div>
            </div>

            <TextAreaFieldWithVisibility
              label="首頁主標題"
              rows={2}
              value={draft.hero.title}
              onChange={(val) => setDraft({ ...draft, hero: { ...draft.hero, title: val } })}
              visible={isFieldVisible(draft.hero.fieldVisibility, 'title')}
              onToggleVisible={(val) =>
                setDraft({
                  ...draft,
                  hero: {
                    ...draft.hero,
                    fieldVisibility: { ...(draft.hero.fieldVisibility || {}), title: val },
                  },
                })
              }
            />

            <TextAreaFieldWithVisibility
              label="首頁副標題描述"
              rows={3}
              value={draft.hero.subtitle}
              onChange={(val) => setDraft({ ...draft, hero: { ...draft.hero, subtitle: val } })}
              visible={isFieldVisible(draft.hero.fieldVisibility, 'subtitle')}
              onToggleVisible={(val) =>
                setDraft({
                  ...draft,
                  hero: {
                    ...draft.hero,
                    fieldVisibility: { ...(draft.hero.fieldVisibility || {}), subtitle: val },
                  },
                })
              }
            />

            <div className="max-w-md">
              <TextFieldWithVisibility
                label="次要按鈕文字"
                value={draft.hero.secondaryCtaText}
                onChange={(val) =>
                  setDraft({ ...draft, hero: { ...draft.hero, secondaryCtaText: val } })
                }
                visible={isFieldVisible(draft.hero.fieldVisibility, 'secondaryCtaText')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    hero: {
                      ...draft.hero,
                      fieldVisibility: {
                        ...(draft.hero.fieldVisibility || {}),
                        secondaryCtaText: val,
                      },
                    },
                  })
                }
              />
            </div>

            <div className="space-y-4 pt-4 border-t border-[#e0d8d3]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-medium text-[#1b1c1c]">
                    首頁主視覺幻燈片 Slide 管理（{draft.hero.slides?.length || 0} 張）
                  </h4>
                  <p className="text-xs text-[#73594c]">
                    支援多張圖片自動輪播與左右切換，每張相片皆可獨立新增、修改說明文字、調整順序、隱藏或刪除。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <VisibilityToggle
                    checked={draft.hero.slideAutoPlay ?? true}
                    onChange={(val) =>
                      setDraft({ ...draft, hero: { ...draft.hero, slideAutoPlay: val } })
                    }
                    label="自動輪播"
                  />
                  <label className="inline-flex items-center gap-1.5 text-xs text-[#51443d]">
                    <span>切換秒數</span>
                    <select
                      value={draft.hero.slideIntervalSec ?? 5}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          hero: { ...draft.hero, slideIntervalSec: Number(e.target.value) },
                        })
                      }
                      className="h-8 px-2.5 rounded-lg border border-[#e0d8d3] bg-white text-xs tabular-nums"
                    >
                      <option value={3}>3 秒</option>
                      <option value={5}>5 秒</option>
                      <option value={7}>7 秒</option>
                      <option value={10}>10 秒</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddHeroSlide}
                    className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    新增幻燈片 Slide
                  </button>
                </div>
              </div>

              {(draft.hero.slides || []).length === 0 ? (
                <div className="p-6 rounded-lg bg-[#fcf9f8] border border-dashed border-[#e0d8d3] text-center text-xs text-[#73594c]">
                  目前尚無幻燈片圖片，請點擊右上方「新增幻燈片 Slide」加入首頁主視覺輪播圖。
                </div>
              ) : (
                <div className="space-y-4">
                  {(draft.hero.slides || []).map((slide, idx) => (
                    <div
                      key={slide.id}
                      className="p-4 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e0d8d3] pb-3">
                        <span className="text-xs font-medium text-[#70472d] tabular-nums">
                          幻燈片 Slide #{idx + 1}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveHeroSlide(idx, -1)}
                            className="p-1.5 rounded-lg border border-[#e0d8d3] bg-white text-[#51443d] hover:bg-[#e8ded8]/50 disabled:opacity-40 cursor-pointer"
                            aria-label="上移此張幻燈片"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === (draft.hero.slides?.length || 0) - 1}
                            onClick={() => handleMoveHeroSlide(idx, 1)}
                            className="p-1.5 rounded-lg border border-[#e0d8d3] bg-white text-[#51443d] hover:bg-[#e8ded8]/50 disabled:opacity-40 cursor-pointer"
                            aria-label="下移此張幻燈片"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <VisibilityToggle
                            checked={slide.isVisible}
                            onChange={(val) => {
                              const next = [...(draft.hero.slides || [])];
                              next[idx] = { ...slide, isVisible: val };
                              updateHeroSlides(next);
                            }}
                            label="此張圖片"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = (draft.hero.slides || []).filter(
                                (s) => s.id !== slide.id
                              );
                              updateHeroSlides(next);
                            }}
                            className="p-1.5 rounded-lg text-[#ba1a1a] hover:bg-[#ffdad6]/50 cursor-pointer"
                            aria-label="刪除此張幻燈片"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <MediaPickerButton
                        label={`幻燈片 #${idx + 1} 圖片`}
                        value={slide.imageUrl}
                        onChange={(url) => {
                          const next = [...(draft.hero.slides || [])];
                          next[idx] = { ...slide, imageUrl: url };
                          updateHeroSlides(next);
                        }}
                        category="cms"
                        mediaAssets={mediaAssets}
                        onUploaded={onMediaUploaded}
                      />

                      <TextAreaFieldWithVisibility
                        compact
                        rows={2}
                        label={`幻燈片 #${idx + 1} 圖片底部說明文字（選填）`}
                        value={slide.caption || ''}
                        placeholder="輸入此張圖片簡短介紹或活動提示（可留空）"
                        onChange={(val) => {
                          const next = [...(draft.hero.slides || [])];
                          next[idx] = { ...slide, caption: val };
                          updateHeroSlides(next);
                        }}
                        visible={slide.captionVisible ?? true}
                        onToggleVisible={(val) => {
                          const next = [...(draft.hero.slides || [])];
                          next[idx] = { ...slide, captionVisible: val };
                          updateHeroSlides(next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {sectionTab === 'philosophy' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0d8d3] pb-4">
              <h3 className="text-lg font-serif text-[#1b1c1c]">工坊理念與特色支柱區塊</h3>
              <div className="flex items-center gap-2">
                <VisibilityToggle
                  checked={draft.philosophy.isVisible}
                  onChange={(val) =>
                    setDraft({ ...draft, philosophy: { ...draft.philosophy, isVisible: val } })
                  }
                  label="理念區塊"
                />
                <VisibilityToggle
                  checked={draft.philosophy.imageVisible}
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      philosophy: { ...draft.philosophy, imageVisible: val },
                    })
                  }
                  label="理念圖片"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextAreaFieldWithVisibility
                label="副標題"
                rows={2}
                value={draft.philosophy.subtitle}
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    philosophy: { ...draft.philosophy, subtitle: val },
                  })
                }
                visible={isFieldVisible(draft.philosophy.fieldVisibility, 'subtitle')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    philosophy: {
                      ...draft.philosophy,
                      fieldVisibility: { ...(draft.philosophy.fieldVisibility || {}), subtitle: val },
                    },
                  })
                }
              />
              <TextFieldWithVisibility
                label="主標題"
                value={draft.philosophy.title}
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    philosophy: { ...draft.philosophy, title: val },
                  })
                }
                visible={isFieldVisible(draft.philosophy.fieldVisibility, 'title')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    philosophy: {
                      ...draft.philosophy,
                      fieldVisibility: { ...(draft.philosophy.fieldVisibility || {}), title: val },
                    },
                  })
                }
              />
            </div>

            <TextAreaFieldWithVisibility
              label="理念詳細說明"
              rows={3}
              value={draft.philosophy.description}
              onChange={(val) =>
                setDraft({
                  ...draft,
                  philosophy: { ...draft.philosophy, description: val },
                })
              }
              visible={isFieldVisible(draft.philosophy.fieldVisibility, 'description')}
              onToggleVisible={(val) =>
                setDraft({
                  ...draft,
                  philosophy: {
                    ...draft.philosophy,
                    fieldVisibility: {
                      ...(draft.philosophy.fieldVisibility || {}),
                      description: val,
                    },
                  },
                })
              }
            />

            <MediaPickerButton
              label="理念區塊圖片"
              value={draft.philosophy.imageUrl}
              onChange={(url) =>
                setDraft({ ...draft, philosophy: { ...draft.philosophy, imageUrl: url } })
              }
              category="cms"
              mediaAssets={mediaAssets}
              onUploaded={onMediaUploaded}
            />

            <div className="space-y-3 pt-4 border-t border-[#e0d8d3]">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[#1b1c1c]">工坊特色卡片（可增刪與切換可視化）</h4>
                <button
                  type="button"
                  onClick={handleAddPillar}
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#e8ded8] text-[#70472d] text-xs font-medium hover:bg-[#e0d8d3] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增特色卡片
                </button>
              </div>
              {draft.philosophy.pillars.map((pillar, idx) => (
                <div
                  key={pillar.id}
                  className="p-4 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 flex-1 min-w-[260px]">
                      <div className="sm:col-span-3">
                        <TextFieldWithVisibility
                          compact
                          tabular
                          label="編號"
                          value={pillar.number}
                          onChange={(val) => {
                            const next = [...draft.philosophy.pillars];
                            next[idx] = { ...pillar, number: val };
                            setDraft({
                              ...draft,
                              philosophy: { ...draft.philosophy, pillars: next },
                            });
                          }}
                          visible={isFieldVisible(pillar.fieldVisibility, 'number')}
                          onToggleVisible={(val) => {
                            const next = [...draft.philosophy.pillars];
                            next[idx] = {
                              ...pillar,
                              fieldVisibility: { ...(pillar.fieldVisibility || {}), number: val },
                            };
                            setDraft({
                              ...draft,
                              philosophy: { ...draft.philosophy, pillars: next },
                            });
                          }}
                        />
                      </div>
                      <div className="sm:col-span-9">
                        <TextFieldWithVisibility
                          compact
                          label="特色卡片標題"
                          value={pillar.title}
                          onChange={(val) => {
                            const next = [...draft.philosophy.pillars];
                            next[idx] = { ...pillar, title: val };
                            setDraft({
                              ...draft,
                              philosophy: { ...draft.philosophy, pillars: next },
                            });
                          }}
                          visible={isFieldVisible(pillar.fieldVisibility, 'title')}
                          onToggleVisible={(val) => {
                            const next = [...draft.philosophy.pillars];
                            next[idx] = {
                              ...pillar,
                              fieldVisibility: { ...(pillar.fieldVisibility || {}), title: val },
                            };
                            setDraft({
                              ...draft,
                              philosophy: { ...draft.philosophy, pillars: next },
                            });
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <VisibilityToggle
                        checked={pillar.isVisible}
                        onChange={(val) => {
                          const next = [...draft.philosophy.pillars];
                          next[idx] = { ...pillar, isVisible: val };
                          setDraft({
                            ...draft,
                            philosophy: { ...draft.philosophy, pillars: next },
                          });
                        }}
                        label="整張卡片"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            philosophy: {
                              ...draft.philosophy,
                              pillars: draft.philosophy.pillars.filter((p) => p.id !== pillar.id),
                            },
                          })
                        }
                        className="p-2 rounded-lg text-[#ba1a1a] hover:bg-[#ffdad6]/50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <TextAreaFieldWithVisibility
                    compact
                    rows={2}
                    label="特色詳細描述"
                    value={pillar.description}
                    onChange={(val) => {
                      const next = [...draft.philosophy.pillars];
                      next[idx] = { ...pillar, description: val };
                      setDraft({
                        ...draft,
                        philosophy: { ...draft.philosophy, pillars: next },
                      });
                    }}
                    visible={isFieldVisible(pillar.fieldVisibility, 'description')}
                    onToggleVisible={(val) => {
                      const next = [...draft.philosophy.pillars];
                      next[idx] = {
                        ...pillar,
                        fieldVisibility: { ...(pillar.fieldVisibility || {}), description: val },
                      };
                      setDraft({
                        ...draft,
                        philosophy: { ...draft.philosophy, pillars: next },
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {sectionTab === 'sections' && (
          <div className="space-y-8">
            <div className="space-y-4 border-b border-[#e0d8d3] pb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-serif text-[#1b1c1c]">課程總覽頁眉文案</h3>
                <VisibilityToggle
                  checked={draft.coursesSection.isVisible}
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      coursesSection: { ...draft.coursesSection, isVisible: val },
                    })
                  }
                  label="整區標題"
                />
              </div>
              <TextFieldWithVisibility
                label="課程區塊主標題"
                value={draft.coursesSection.title}
                placeholder="課程區塊標題"
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    coursesSection: { ...draft.coursesSection, title: val },
                  })
                }
                visible={isFieldVisible(draft.coursesSection.fieldVisibility, 'title')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    coursesSection: {
                      ...draft.coursesSection,
                      fieldVisibility: {
                        ...(draft.coursesSection.fieldVisibility || {}),
                        title: val,
                      },
                    },
                  })
                }
              />
              <TextAreaFieldWithVisibility
                label="課程區塊說明文字"
                rows={2}
                value={draft.coursesSection.subtitle}
                placeholder="課程區塊說明"
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    coursesSection: { ...draft.coursesSection, subtitle: val },
                  })
                }
                visible={isFieldVisible(draft.coursesSection.fieldVisibility, 'subtitle')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    coursesSection: {
                      ...draft.coursesSection,
                      fieldVisibility: {
                        ...(draft.coursesSection.fieldVisibility || {}),
                        subtitle: val,
                      },
                    },
                  })
                }
              />
              <TextAreaFieldWithVisibility
                label="篩選無課程時之提示文字"
                rows={2}
                value={draft.coursesSection.emptyText}
                placeholder="無課程時提示文字"
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    coursesSection: { ...draft.coursesSection, emptyText: val },
                  })
                }
                visible={isFieldVisible(draft.coursesSection.fieldVisibility, 'emptyText')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    coursesSection: {
                      ...draft.coursesSection,
                      fieldVisibility: {
                        ...(draft.coursesSection.fieldVisibility || {}),
                        emptyText: val,
                      },
                    },
                  })
                }
              />
            </div>

            <div className="space-y-4 border-b border-[#e0d8d3] pb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-serif text-[#1b1c1c]">作品藝廊頁眉文案</h3>
                <VisibilityToggle
                  checked={draft.gallerySection.isVisible}
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      gallerySection: { ...draft.gallerySection, isVisible: val },
                    })
                  }
                  label="整區標題"
                />
              </div>
              <TextFieldWithVisibility
                label="藝廊區塊主標題"
                value={draft.gallerySection.title}
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    gallerySection: { ...draft.gallerySection, title: val },
                  })
                }
                visible={isFieldVisible(draft.gallerySection.fieldVisibility, 'title')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    gallerySection: {
                      ...draft.gallerySection,
                      fieldVisibility: {
                        ...(draft.gallerySection.fieldVisibility || {}),
                        title: val,
                      },
                    },
                  })
                }
              />
              <TextAreaFieldWithVisibility
                label="藝廊區塊說明文字"
                rows={2}
                value={draft.gallerySection.subtitle}
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    gallerySection: { ...draft.gallerySection, subtitle: val },
                  })
                }
                visible={isFieldVisible(draft.gallerySection.fieldVisibility, 'subtitle')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    gallerySection: {
                      ...draft.gallerySection,
                      fieldVisibility: {
                        ...(draft.gallerySection.fieldVisibility || {}),
                        subtitle: val,
                      },
                    },
                  })
                }
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-serif text-[#1b1c1c]">職人介紹頁眉文案</h3>
                <VisibilityToggle
                  checked={draft.artisansSection.isVisible}
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      artisansSection: { ...draft.artisansSection, isVisible: val },
                    })
                  }
                  label="整區標題"
                />
              </div>
              <TextFieldWithVisibility
                label="職人區塊主標題"
                value={draft.artisansSection.title}
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    artisansSection: { ...draft.artisansSection, title: val },
                  })
                }
                visible={isFieldVisible(draft.artisansSection.fieldVisibility, 'title')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    artisansSection: {
                      ...draft.artisansSection,
                      fieldVisibility: {
                        ...(draft.artisansSection.fieldVisibility || {}),
                        title: val,
                      },
                    },
                  })
                }
              />
              <TextAreaFieldWithVisibility
                label="職人區塊說明文字"
                rows={2}
                value={draft.artisansSection.subtitle}
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    artisansSection: { ...draft.artisansSection, subtitle: val },
                  })
                }
                visible={isFieldVisible(draft.artisansSection.fieldVisibility, 'subtitle')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    artisansSection: {
                      ...draft.artisansSection,
                      fieldVisibility: {
                        ...(draft.artisansSection.fieldVisibility || {}),
                        subtitle: val,
                      },
                    },
                  })
                }
              />
            </div>
          </div>
        )}

        {sectionTab === 'contact_bank' && (
          <div className="space-y-8">
            <div className="space-y-4 border-b border-[#e0d8d3] pb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-serif text-[#1b1c1c]">聯絡與空間預約頁面文案</h3>
                <VisibilityToggle
                  checked={draft.contactSection.isVisible}
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: { ...draft.contactSection, isVisible: val },
                    })
                  }
                  label="整頁區塊"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextFieldWithVisibility
                  label="聯絡頁面主標題"
                  value={draft.contactSection.title}
                  placeholder="主標題"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: { ...draft.contactSection, title: val },
                    })
                  }
                  visible={isFieldVisible(draft.contactSection.fieldVisibility, 'title')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: {
                        ...draft.contactSection,
                        fieldVisibility: {
                          ...(draft.contactSection.fieldVisibility || {}),
                          title: val,
                        },
                      },
                    })
                  }
                />
                <TextFieldWithVisibility
                  label="諮詢表單區塊標題"
                  value={draft.contactSection.formTitle}
                  placeholder="表單標題"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: { ...draft.contactSection, formTitle: val },
                    })
                  }
                  visible={isFieldVisible(draft.contactSection.fieldVisibility, 'formTitle')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: {
                        ...draft.contactSection,
                        fieldVisibility: {
                          ...(draft.contactSection.fieldVisibility || {}),
                          formTitle: val,
                        },
                      },
                    })
                  }
                />
                <TextAreaFieldWithVisibility
                  label="工坊地址"
                  rows={2}
                  value={draft.contactSection.address}
                  placeholder="工坊地址"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: { ...draft.contactSection, address: val },
                    })
                  }
                  visible={isFieldVisible(draft.contactSection.fieldVisibility, 'address')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: {
                        ...draft.contactSection,
                        fieldVisibility: {
                          ...(draft.contactSection.fieldVisibility || {}),
                          address: val,
                        },
                      },
                    })
                  }
                />
                <TextAreaFieldWithVisibility
                  label="開放營業時間"
                  rows={2}
                  value={draft.contactSection.hours}
                  placeholder="開放時間"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: { ...draft.contactSection, hours: val },
                    })
                  }
                  visible={isFieldVisible(draft.contactSection.fieldVisibility, 'hours')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: {
                        ...draft.contactSection,
                        fieldVisibility: {
                          ...(draft.contactSection.fieldVisibility || {}),
                          hours: val,
                        },
                      },
                    })
                  }
                />
                <TextFieldWithVisibility
                  label="工坊聯絡電話"
                  tabular
                  value={draft.contactSection.phone}
                  placeholder="聯絡電話"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: { ...draft.contactSection, phone: val },
                    })
                  }
                  visible={isFieldVisible(draft.contactSection.fieldVisibility, 'phone')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: {
                        ...draft.contactSection,
                        fieldVisibility: {
                          ...(draft.contactSection.fieldVisibility || {}),
                          phone: val,
                        },
                      },
                    })
                  }
                />
                <TextFieldWithVisibility
                  label="工坊聯絡電郵"
                  type="email"
                  value={draft.contactSection.email}
                  placeholder="聯絡信箱"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: { ...draft.contactSection, email: val },
                    })
                  }
                  visible={isFieldVisible(draft.contactSection.fieldVisibility, 'email')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: {
                        ...draft.contactSection,
                        fieldVisibility: {
                          ...(draft.contactSection.fieldVisibility || {}),
                          email: val,
                        },
                      },
                    })
                  }
                />
                <TextAreaFieldWithVisibility
                  label="交通指引備註"
                  rows={2}
                  value={draft.contactSection.mapNote}
                  placeholder="交通與抵達指引"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: { ...draft.contactSection, mapNote: val },
                    })
                  }
                  visible={isFieldVisible(draft.contactSection.fieldVisibility, 'mapNote')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: {
                        ...draft.contactSection,
                        fieldVisibility: {
                          ...(draft.contactSection.fieldVisibility || {}),
                          mapNote: val,
                        },
                      },
                    })
                  }
                />
                <TextFieldWithVisibility
                  label="表單送出按鈕文字"
                  value={draft.contactSection.submitText}
                  placeholder="送出預約諮詢"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: { ...draft.contactSection, submitText: val },
                    })
                  }
                  visible={isFieldVisible(draft.contactSection.fieldVisibility, 'submitText')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      contactSection: {
                        ...draft.contactSection,
                        fieldVisibility: {
                          ...(draft.contactSection.fieldVisibility || {}),
                          submitText: val,
                        },
                      },
                    })
                  }
                />
              </div>
              <TextAreaFieldWithVisibility
                label="聯絡頁面簡介說明"
                rows={2}
                value={draft.contactSection.subtitle}
                placeholder="聯絡頁面簡介"
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    contactSection: { ...draft.contactSection, subtitle: val },
                  })
                }
                visible={isFieldVisible(draft.contactSection.fieldVisibility, 'subtitle')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    contactSection: {
                      ...draft.contactSection,
                      fieldVisibility: {
                        ...(draft.contactSection.fieldVisibility || {}),
                        subtitle: val,
                      },
                    },
                  })
                }
              />

              <div className="p-4 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] space-y-2.5">
                <p className="text-xs font-medium text-[#51443d]">前台諮詢表單輸入欄位可視化開關</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'inquiryName', label: '訪客姓名欄' },
                    { key: 'inquiryPhone', label: '手提電話欄' },
                    { key: 'inquiryEmail', label: '聯絡 Email 欄' },
                    { key: 'inquiryType', label: '詢問類別下拉欄' },
                    { key: 'inquiryMessage', label: '需求說明欄' },
                  ].map((field) => (
                    <VisibilityToggle
                      key={field.key}
                      checked={isFieldVisible(draft.contactSection.fieldVisibility, field.key)}
                      onChange={(val) =>
                        setDraft({
                          ...draft,
                          contactSection: {
                            ...draft.contactSection,
                            fieldVisibility: {
                              ...(draft.contactSection.fieldVisibility || {}),
                              [field.key]: val,
                            },
                          },
                        })
                      }
                      label={field.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-serif text-[#1b1c1c]">前台報名顯示之港幣 (HKD) 銀行轉帳資訊</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <OptionOrCustomField
                  label="收款銀行名稱（港幣帳戶）"
                  value={draft.paymentConfig.bankName}
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      paymentConfig: { ...draft.paymentConfig, bankName: val },
                    })
                  }
                  options={HK_BANK_PRESETS}
                  placeholder="輸入自訂香港或海外銀行名稱"
                  visible={isFieldVisible(draft.paymentConfig.fieldVisibility, 'bankName')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      paymentConfig: {
                        ...draft.paymentConfig,
                        fieldVisibility: {
                          ...(draft.paymentConfig.fieldVisibility || {}),
                          bankName: val,
                        },
                      },
                    })
                  }
                />
                <TextFieldWithVisibility
                  label="銀行編號／轉數快 (FPS) 代碼"
                  tabular
                  value={draft.paymentConfig.bankCode}
                  placeholder="例如：004"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      paymentConfig: { ...draft.paymentConfig, bankCode: val },
                    })
                  }
                  visible={isFieldVisible(draft.paymentConfig.fieldVisibility, 'bankCode')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      paymentConfig: {
                        ...draft.paymentConfig,
                        fieldVisibility: {
                          ...(draft.paymentConfig.fieldVisibility || {}),
                          bankCode: val,
                        },
                      },
                    })
                  }
                />
                <TextFieldWithVisibility
                  label="港幣匯款帳號"
                  tabular
                  value={draft.paymentConfig.accountNumber}
                  placeholder="輸入收款帳號"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      paymentConfig: { ...draft.paymentConfig, accountNumber: val },
                    })
                  }
                  visible={isFieldVisible(draft.paymentConfig.fieldVisibility, 'accountNumber')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      paymentConfig: {
                        ...draft.paymentConfig,
                        fieldVisibility: {
                          ...(draft.paymentConfig.fieldVisibility || {}),
                          accountNumber: val,
                        },
                      },
                    })
                  }
                />
                <TextFieldWithVisibility
                  label="帳戶戶名"
                  value={draft.paymentConfig.accountName}
                  placeholder="帳戶戶名"
                  onChange={(val) =>
                    setDraft({
                      ...draft,
                      paymentConfig: { ...draft.paymentConfig, accountName: val },
                    })
                  }
                  visible={isFieldVisible(draft.paymentConfig.fieldVisibility, 'accountName')}
                  onToggleVisible={(val) =>
                    setDraft({
                      ...draft,
                      paymentConfig: {
                        ...draft.paymentConfig,
                        fieldVisibility: {
                          ...(draft.paymentConfig.fieldVisibility || {}),
                          accountName: val,
                        },
                      },
                    })
                  }
                />
              </div>
              <TextAreaFieldWithVisibility
                label="港幣轉帳及對帳提醒事項"
                rows={2}
                value={draft.paymentConfig.transferNotice}
                placeholder="匯款提醒事項"
                onChange={(val) =>
                  setDraft({
                    ...draft,
                    paymentConfig: { ...draft.paymentConfig, transferNotice: val },
                  })
                }
                visible={isFieldVisible(draft.paymentConfig.fieldVisibility, 'transferNotice')}
                onToggleVisible={(val) =>
                  setDraft({
                    ...draft,
                    paymentConfig: {
                      ...draft.paymentConfig,
                      fieldVisibility: {
                        ...(draft.paymentConfig.fieldVisibility || {}),
                        transferNotice: val,
                      },
                    },
                  })
                }
              />
            </div>
          </div>
        )}

        {sectionTab === 'footer' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#e0d8d3] pb-4">
              <h3 className="text-lg font-serif text-[#1b1c1c]">網站頁尾 Footer 設定</h3>
              <VisibilityToggle
                checked={draft.footer.isVisible}
                onChange={(val) =>
                  setDraft({ ...draft, footer: { ...draft.footer, isVisible: val } })
                }
                label="整個頁尾"
              />
            </div>
            <TextAreaFieldWithVisibility
              label="品牌頁尾標語"
              rows={2}
              value={draft.footer.tagline}
              onChange={(val) =>
                setDraft({ ...draft, footer: { ...draft.footer, tagline: val } })
              }
              visible={isFieldVisible(draft.footer.fieldVisibility, 'tagline')}
              onToggleVisible={(val) =>
                setDraft({
                  ...draft,
                  footer: {
                    ...draft.footer,
                    fieldVisibility: { ...(draft.footer.fieldVisibility || {}), tagline: val },
                  },
                })
              }
            />
            <TextAreaFieldWithVisibility
              label="地址與營業資訊行"
              rows={2}
              value={draft.footer.addressLine}
              onChange={(val) =>
                setDraft({ ...draft, footer: { ...draft.footer, addressLine: val } })
              }
              visible={isFieldVisible(draft.footer.fieldVisibility, 'addressLine')}
              onToggleVisible={(val) =>
                setDraft({
                  ...draft,
                  footer: {
                    ...draft.footer,
                    fieldVisibility: {
                      ...(draft.footer.fieldVisibility || {}),
                      addressLine: val,
                    },
                  },
                })
              }
            />
            <TextFieldWithVisibility
              label="版權宣告文字"
              value={draft.footer.copyrightText}
              onChange={(val) =>
                setDraft({
                  ...draft,
                  footer: { ...draft.footer, copyrightText: val },
                })
              }
              visible={isFieldVisible(draft.footer.fieldVisibility, 'copyrightText')}
              onToggleVisible={(val) =>
                setDraft({
                  ...draft,
                  footer: {
                    ...draft.footer,
                    fieldVisibility: {
                      ...(draft.footer.fieldVisibility || {}),
                      copyrightText: val,
                    },
                  },
                })
              }
            />
          </div>
        )}

        {sectionTab === 'custom_blocks' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0d8d3] pb-4">
              <div>
                <h3 className="text-lg font-serif text-[#1b1c1c]">自由新增頁面圖文區塊</h3>
                <p className="text-xs text-[#51443d]">
                  可為任何前台頁面新增額外公告、展覽預告或專欄圖文區塊，並自由調整可視化開關。
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddCustomBlock}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                新增自訂區塊
              </button>
            </div>

            {(draft.customBlocks || []).length === 0 ? (
              <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-8 text-center text-sm text-[#51443d]">
                目前尚未新增任何自訂圖文區塊，點擊右上角「新增自訂區塊」即可插入新內容至前台指定頁面。
              </div>
            ) : (
              <div className="space-y-6">
                {draft.customBlocks.map((block, idx) => (
                  <div
                    key={block.id}
                    className="p-5 rounded-lg bg-[#fcf9f8] border border-[#e0d8d3] space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[#73594c]">顯示頁面：</span>
                        <select
                          value={block.pageKey}
                          onChange={(e) => {
                            const next = [...draft.customBlocks];
                            next[idx] = { ...block, pageKey: e.target.value as PublicPageKey };
                            setDraft({ ...draft, customBlocks: next });
                          }}
                          className="h-9 px-3 rounded-lg bg-white border border-[#e0d8d3] text-xs"
                        >
                          <option value="home">首頁</option>
                          <option value="courses">課程總覽</option>
                          <option value="gallery">作品藝廊</option>
                          <option value="artisans">職人介紹</option>
                          <option value="contact">聯絡預約</option>
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <VisibilityToggle
                          checked={block.isVisible}
                          onChange={(val) => {
                            const next = [...draft.customBlocks];
                            next[idx] = { ...block, isVisible: val };
                            setDraft({ ...draft, customBlocks: next });
                          }}
                          label="整個區塊"
                        />
                        <VisibilityToggle
                          checked={block.imageVisible}
                          onChange={(val) => {
                            const next = [...draft.customBlocks];
                            next[idx] = { ...block, imageVisible: val };
                            setDraft({ ...draft, customBlocks: next });
                          }}
                          label="圖片"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              customBlocks: draft.customBlocks.filter((b) => b.id !== block.id),
                            })
                          }
                          className="p-2 rounded-lg text-[#ba1a1a] hover:bg-[#ffdad6]/50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TextAreaFieldWithVisibility
                        compact
                        rows={2}
                        label="區塊前導小標"
                        value={block.subtitle}
                        placeholder="小標"
                        onChange={(val) => {
                          const next = [...draft.customBlocks];
                          next[idx] = { ...block, subtitle: val };
                          setDraft({ ...draft, customBlocks: next });
                        }}
                        visible={isFieldVisible(block.fieldVisibility, 'subtitle')}
                        onToggleVisible={(val) => {
                          const next = [...draft.customBlocks];
                          next[idx] = {
                            ...block,
                            fieldVisibility: { ...(block.fieldVisibility || {}), subtitle: val },
                          };
                          setDraft({ ...draft, customBlocks: next });
                        }}
                      />
                      <TextFieldWithVisibility
                        compact
                        label="區塊主標題"
                        value={block.title}
                        placeholder="區塊標題"
                        onChange={(val) => {
                          const next = [...draft.customBlocks];
                          next[idx] = { ...block, title: val };
                          setDraft({ ...draft, customBlocks: next });
                        }}
                        visible={isFieldVisible(block.fieldVisibility, 'title')}
                        onToggleVisible={(val) => {
                          const next = [...draft.customBlocks];
                          next[idx] = {
                            ...block,
                            fieldVisibility: { ...(block.fieldVisibility || {}), title: val },
                          };
                          setDraft({ ...draft, customBlocks: next });
                        }}
                      />
                    </div>

                    <TextAreaFieldWithVisibility
                      compact
                      rows={3}
                      label="區塊內文內容"
                      value={block.body}
                      placeholder="區塊內文"
                      onChange={(val) => {
                        const next = [...draft.customBlocks];
                        next[idx] = { ...block, body: val };
                        setDraft({ ...draft, customBlocks: next });
                      }}
                      visible={isFieldVisible(block.fieldVisibility, 'body')}
                      onToggleVisible={(val) => {
                        const next = [...draft.customBlocks];
                        next[idx] = {
                          ...block,
                          fieldVisibility: { ...(block.fieldVisibility || {}), body: val },
                        };
                        setDraft({ ...draft, customBlocks: next });
                      }}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TextFieldWithVisibility
                        compact
                        label="按鈕顯示文字"
                        value={block.ctaLabel}
                        placeholder="按鈕文字"
                        onChange={(val) => {
                          const next = [...draft.customBlocks];
                          next[idx] = { ...block, ctaLabel: val };
                          setDraft({ ...draft, customBlocks: next });
                        }}
                        visible={isFieldVisible(block.fieldVisibility, 'ctaLabel')}
                        onToggleVisible={(val) => {
                          const next = [...draft.customBlocks];
                          next[idx] = {
                            ...block,
                            fieldVisibility: { ...(block.fieldVisibility || {}), ctaLabel: val },
                          };
                          setDraft({ ...draft, customBlocks: next });
                        }}
                      />
                      <label className="block space-y-1.5">
                        <span className="block text-[11px] font-medium text-[#51443d]">按鈕點擊導向頁面</span>
                        <select
                          value={block.ctaTarget}
                          onChange={(e) => {
                            const next = [...draft.customBlocks];
                            next[idx] = { ...block, ctaTarget: e.target.value as PublicPageKey };
                            setDraft({ ...draft, customBlocks: next });
                          }}
                          className="w-full h-9 px-2.5 rounded-lg bg-white border border-[#e0d8d3] text-xs"
                        >
                          <option value="courses">導向：課程總覽</option>
                          <option value="gallery">導向：作品藝廊</option>
                          <option value="artisans">導向：職人介紹</option>
                          <option value="contact">導向：聯絡預約</option>
                          <option value="member">導向：會員中心</option>
                        </select>
                      </label>
                    </div>

                    <MediaPickerButton
                      label="區塊配圖"
                      value={block.imageUrl}
                      onChange={(url) => {
                        const next = [...draft.customBlocks];
                        next[idx] = { ...block, imageUrl: url };
                        setDraft({ ...draft, customBlocks: next });
                      }}
                      category="cms"
                      mediaAssets={mediaAssets}
                      onUploaded={onMediaUploaded}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Revision History Modal / Drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-[#1b1c1c]/45 flex justify-end">
          <div className="bg-white w-full max-w-xl h-full flex flex-col border-l border-[#e0d8d3] shadow-warm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#e0d8d3]">
              <div>
                <h3 className="text-xl font-serif text-[#1b1c1c]">CMS 修改版本歷史紀錄</h3>
                <p className="text-xs text-[#51443d]">
                  每次發佈皆已完整保存於資料庫，點擊即可叫出該版本並再次修改
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="p-2 rounded-lg hover:bg-[#f6f3f2] text-[#51443d] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {revisions.length === 0 ? (
                <div className="bg-[#f6f3f2] border border-[#e0d8d3] rounded-lg p-8 text-center text-sm text-[#51443d]">
                  尚無歷史版本紀錄，點擊上方「儲存版本並發佈前台」後，每一次的變更與圖片配置都會永久記錄於此。
                </div>
              ) : (
                revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-5 rounded-lg border border-[#e0d8d3] bg-[#fcf9f8] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-serif text-[#1b1c1c]">{rev.revisionTitle}</h4>
                        <p className="text-xs text-[#73594c] tabular-nums">
                          {formatDateTime(rev.createdAt)} · 編輯者：{rev.editorName} ({rev.editorPhone})
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteCmsRevision(rev.id);
                          await onRevisionsRefresh();
                        }}
                        className="p-1.5 rounded-lg text-[#ba1a1a] hover:bg-[#ffdad6]/50 cursor-pointer"
                        title="刪除此歷史紀錄"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {rev.note && (
                      <p className="text-xs text-[#51443d] whitespace-pre-line">{rev.note}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRecallRevision(rev)}
                      className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-[#8c5e43] text-white text-xs font-medium hover:bg-[#73594c] cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      叫出此版本到編輯器再次修改
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
