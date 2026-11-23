import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DEFAULT_ARTISANS,
  DEFAULT_COURSES,
  DEFAULT_GALLERY,
  DEFAULT_SITE_CONTENT,
} from '../data/defaultSeed';
import {
  auth,
  db,
  ensureAnonymousSession,
  handleFirestoreError,
  hashPin,
  normalizePhone,
  OperationType,
  SUPER_ADMIN_EMAIL,
} from '../lib/firebase';
import {
  AdminPermissions,
  AdminUser,
  Artisan,
  CmsRevision,
  ContactSubmission,
  Course,
  CourseStatus,
  Enrollment,
  GalleryWork,
  HERO_KICKER_SIZE_CLASS,
  HeroKickerSize,
  InstructorAttendanceStatus,
  InstructorSessionRecord,
  MediaAsset,
  Member,
  MemberNotification,
  PaymentMethod,
  PaymentStatus,
  SiteContent,
} from '../types/atelier';

export type BgRemovalMode = 'none' | 'auto' | 'black' | 'white';

function applyBackgroundRemoval(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: BgRemovalMode
): boolean {
  if (mode === 'none') return false;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;
  if (totalPixels === 0) return false;

  // Check if image already has genuine transparency
  let transparentCount = 0;
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < 20) transparentCount++;
  }
  const alreadyTransparent = transparentCount > (totalPixels / 4) * 0.05;
  if (mode === 'auto' && alreadyTransparent) {
    return false;
  }

  // Sample border/corner pixels to detect solid backdrop color
  const sampleCoords = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let opaqueSamples = 0;
  for (const [x, y] of sampleCoords) {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] > 200) {
      sumR += data[idx];
      sumG += data[idx + 1];
      sumB += data[idx + 2];
      opaqueSamples++;
    }
  }

  if (opaqueSamples === 0) return false;
  const avgR = sumR / opaqueSamples;
  const avgG = sumG / opaqueSamples;
  const avgB = sumB / opaqueSamples;
  const cornerMax = Math.max(avgR, avgG, avgB);
  const cornerMin = Math.min(avgR, avgG, avgB);

  let target: 'black' | 'white' | null = null;
  if (mode === 'black') target = 'black';
  else if (mode === 'white') target = 'white';
  else if (mode === 'auto') {
    if (cornerMax < 48) target = 'black';
    else if (cornerMin > 218) target = 'white';
  }

  if (!target) return false;

  const bgR = target === 'black' ? Math.min(avgR, 28) : Math.max(avgR, 240);
  const bgG = target === 'black' ? Math.min(avgG, 28) : Math.max(avgG, 240);
  const bgB = target === 'black' ? Math.min(avgB, 28) : Math.max(avgB, 240);

  let changed = false;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (target === 'black') {
      const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const metric = Math.min(dist, luma * 1.35);
      if (metric <= 24) {
        data[i + 3] = 0;
        changed = true;
      } else if (metric < 64) {
        const factor = (metric - 24) / 40;
        data[i + 3] = Math.round(a * factor);
        // Slightly lift color away from black fringe
        data[i] = Math.min(255, Math.round(r / Math.max(0.35, factor)));
        data[i + 1] = Math.min(255, Math.round(g / Math.max(0.35, factor)));
        data[i + 2] = Math.min(255, Math.round(b / Math.max(0.35, factor)));
        changed = true;
      }
    } else {
      const dist = Math.sqrt((bgR - r) ** 2 + (bgG - g) ** 2 + (bgB - b) ** 2);
      if (dist <= 30) {
        data[i + 3] = 0;
        changed = true;
      } else if (dist < 76) {
        const factor = (dist - 30) / 46;
        data[i + 3] = Math.round(a * factor);
        changed = true;
      }
    }
  }

  if (changed) {
    ctx.putImageData(imgData, 0, 0);
  }
  return changed;
}

function processImageElementToDataUrl(
  img: HTMLImageElement,
  options?: {
    preserveTransparency?: boolean;
    removeBackground?: BgRemovalMode;
    maxDim?: number;
  }
): { dataUrl: string; mimeType: string; sizeBytes: number } {
  const removeMode = options?.removeBackground ?? 'none';
  const maxDim = options?.maxDim ?? (options?.preserveTransparency || removeMode !== 'none' ? 640 : 1280);

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('瀏覽器不支援圖片處理');
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const removedBg = applyBackgroundRemoval(ctx, width, height, removeMode);

  // Detect any transparent pixels in canvas
  let hasAlphaPixels = removedBg;
  if (!hasAlphaPixels && options?.preserveTransparency) {
    const raw = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < raw.length; i += 16) {
      if (raw[i] < 250) {
        hasAlphaPixels = true;
        break;
      }
    }
  }

  if (options?.preserveTransparency || hasAlphaPixels || removedBg) {
    // Prefer lossless transparent PNG first
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length <= 780000) {
      return { dataUrl, mimeType: 'image/png', sizeBytes: dataUrl.length };
    }
    // Fallback to transparent WebP if PNG is too large
    let quality = 0.92;
    dataUrl = canvas.toDataURL('image/webp', quality);
    while (dataUrl.length > 780000 && quality > 0.45) {
      quality -= 0.12;
      dataUrl = canvas.toDataURL('image/webp', quality);
    }
    if (dataUrl.length <= 880000 && dataUrl.startsWith('data:image/webp')) {
      return { dataUrl, mimeType: 'image/webp', sizeBytes: dataUrl.length };
    }
    // Last resort: downscale PNG cleanly to keep full transparency
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = Math.max(1, Math.round(width * 0.6));
    scaleCanvas.height = Math.max(1, Math.round(height * 0.6));
    const sCtx = scaleCanvas.getContext('2d');
    if (sCtx) {
      sCtx.clearRect(0, 0, scaleCanvas.width, scaleCanvas.height);
      sCtx.drawImage(canvas, 0, 0, scaleCanvas.width, scaleCanvas.height);
      dataUrl = scaleCanvas.toDataURL('image/png');
      if (dataUrl.length <= 880000) {
        return { dataUrl, mimeType: 'image/png', sizeBytes: dataUrl.length };
      }
    }
    throw new Error('透明圖片壓縮後仍超過資料庫上限，請選擇較小解析度之圖片');
  }

  let quality = 0.84;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 780000 && quality > 0.35) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > 880000) {
    throw new Error('圖片壓縮後仍超過資料庫上限，請選擇較小解析度之圖片');
  }
  return {
    dataUrl,
    mimeType: 'image/jpeg',
    sizeBytes: dataUrl.length,
  };
}

// Compress uploaded computer image to fit comfortably within Firestore 1MB doc cap while preserving transparency
export async function compressImageToDataUrl(
  file: File,
  options?: {
    preserveTransparency?: boolean;
    removeBackground?: BgRemovalMode;
    maxDim?: number;
  }
): Promise<{
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const isTransparentFormat =
    file.type === 'image/png' ||
    file.type === 'image/webp' ||
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml' ||
    /\.(png|webp|gif|svg)$/i.test(file.name);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('無法讀取圖片檔案'));
    reader.onload = () => {
      const rawDataUrl = String(reader.result);
      if (
        (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) &&
        (!options?.removeBackground || options.removeBackground === 'none' || options.removeBackground === 'auto') &&
        rawDataUrl.length <= 780000
      ) {
        resolve({
          dataUrl: rawDataUrl,
          mimeType: 'image/svg+xml',
          sizeBytes: rawDataUrl.length,
        });
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('圖片格式不受支援，請上傳 JPG、PNG、WebP 或 SVG'));
      img.onload = () => {
        try {
          const result = processImageElementToDataUrl(img, {
            preserveTransparency: options?.preserveTransparency ?? isTransparentFormat,
            removeBackground: options?.removeBackground ?? 'none',
            maxDim: options?.maxDim,
          });
          resolve(result);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('圖片處理失敗'));
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadMediaAsset(
  file: File,
  category: MediaAsset['category'],
  isPublic: boolean,
  customTitle?: string,
  options?: {
    preserveTransparency?: boolean;
    removeBackground?: BgRemovalMode;
    maxDim?: number;
  }
): Promise<MediaAsset> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('請先完成安全驗證再上傳圖片');
  const compressed = await compressImageToDataUrl(file, options);
  const title = (customTitle || file.name.replace(/\.[^/.]+$/, '') || '未命名圖片').slice(0, 120);
  const path = 'media_assets';
  try {
    const payload = {
      title,
      mimeType: compressed.mimeType,
      dataUrl: compressed.dataUrl,
      sizeBytes: compressed.sizeBytes,
      category,
      isPublic,
      uploadedByUid: uid,
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, path), payload);
    return {
      id: docRef.id,
      ...payload,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeBackgroundAndSaveAsset(
  imageSrc: string,
  category: MediaAsset['category'],
  isPublic: boolean,
  mode: BgRemovalMode = 'auto',
  customTitle = '品牌 Logo（已退地）'
): Promise<MediaAsset> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('請先完成安全驗證再進行圖片去背');

  let resolvedSrc = imageSrc;
  if (imageSrc.startsWith('media://')) {
    const id = imageSrc.replace('media://', '');
    const existingAsset = await fetchMediaAssetById(id);
    if (!existingAsset?.dataUrl) {
      throw new Error('找不到原始圖片資料，請重新上傳圖片');
    }
    resolvedSrc = existingAsset.dataUrl;
  }

  const processed = await new Promise<{ dataUrl: string; mimeType: string; sizeBytes: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = () => reject(new Error('無法載入該圖片進行去背，請改為從電腦重新上傳'));
      img.onload = () => {
        try {
          resolve(
            processImageElementToDataUrl(img, {
              preserveTransparency: true,
              removeBackground: mode,
              maxDim: 640,
            })
          );
        } catch (err) {
          reject(err instanceof Error ? err : new Error('去背處理失敗'));
        }
      };
      img.src = resolvedSrc;
    }
  );

  const path = 'media_assets';
  try {
    const payload = {
      title: customTitle.slice(0, 120),
      mimeType: processed.mimeType,
      dataUrl: processed.dataUrl,
      sizeBytes: processed.sizeBytes,
      category,
      isPublic,
      uploadedByUid: uid,
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, path), payload);
    return {
      id: docRef.id,
      ...payload,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchPublicMediaAssets(): Promise<MediaAsset[]> {
  const path = 'media_assets';
  try {
    const q = query(collection(db, path), where('isPublic', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MediaAsset, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchAllMediaAssetsForAdmin(): Promise<MediaAsset[]> {
  const path = 'media_assets';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<MediaAsset, 'id'>) }))
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchMediaAssetById(id: string): Promise<MediaAsset | null> {
  const path = `media_assets/${id}`;
  try {
    const snap = await getDoc(doc(db, 'media_assets', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<MediaAsset, 'id'>) };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function deleteMediaAsset(id: string): Promise<void> {
  const path = `media_assets/${id}`;
  try {
    await deleteDoc(doc(db, 'media_assets', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchSiteContent(): Promise<SiteContent> {
  const path = 'site_content/published';
  try {
    const snap = await getDoc(doc(db, 'site_content', 'published'));
    if (!snap.exists()) return DEFAULT_SITE_CONTENT;
    const raw = snap.data() as Partial<SiteContent>;
    const rawHero = raw.hero;
    const defaultSlides = DEFAULT_SITE_CONTENT.hero.slides || [];
    const hydratedSlides = Array.isArray(rawHero?.slides)
      ? rawHero.slides
      : rawHero?.imageUrl && rawHero.imageUrl !== DEFAULT_SITE_CONTENT.hero.imageUrl
      ? [
          {
            id: 'hero-slide-1',
            imageUrl: rawHero.imageUrl,
            caption: '',
            captionVisible: false,
            isVisible: true,
            order: 1,
          },
          ...defaultSlides.slice(1),
        ]
      : defaultSlides;

    return {
      ...DEFAULT_SITE_CONTENT,
      ...raw,
      maxNavItems: Math.min(
        12,
        Math.max(1, Math.round(Number(raw.maxNavItems ?? DEFAULT_SITE_CONTENT.maxNavItems ?? 5)) || 5)
      ),
      hero: {
        ...DEFAULT_SITE_CONTENT.hero,
        ...(rawHero || {}),
        kickerSize:
          rawHero?.kickerSize && rawHero.kickerSize in HERO_KICKER_SIZE_CLASS
            ? (rawHero.kickerSize as HeroKickerSize)
            : 'xs',
        slides: hydratedSlides,
        slideAutoPlay: rawHero?.slideAutoPlay ?? true,
        slideIntervalSec: rawHero?.slideIntervalSec ?? 5,
      },
      brandLogoUrl: raw.brandLogoUrl ?? '',
      brandLogoVisible: raw.brandLogoVisible ?? true,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

function sanitizeSiteContentForWrite(content: SiteContent, updatedBy: string) {
  const cleanSlides = Array.isArray(content.hero.slides)
    ? content.hero.slides.slice(0, 12).map((s, idx) => ({
        id: String(s.id || `hero-slide-${idx + 1}`).slice(0, 64),
        imageUrl: String(s.imageUrl || '').slice(0, 300),
        caption: String(s.caption || '').slice(0, 200),
        captionVisible: s.captionVisible ?? true,
        isVisible: s.isVisible ?? true,
        order: Number.isFinite(s.order) ? s.order : idx + 1,
      }))
    : [];
  const firstVisibleSlide = cleanSlides.find((s) => s.isVisible && s.imageUrl) || cleanSlides[0];
  const rawKickerSize = content.hero.kickerSize;
  const cleanKickerSize: HeroKickerSize =
    rawKickerSize && rawKickerSize in HERO_KICKER_SIZE_CLASS ? rawKickerSize : 'xs';
  const cleanMaxNavItems = Math.min(12, Math.max(1, Math.round(Number(content.maxNavItems ?? 5)) || 5));

  return {
    brandName: content.brandName,
    brandVisible: content.brandVisible,
    brandLogoUrl: content.brandLogoUrl || '',
    brandLogoVisible: content.brandLogoVisible ?? true,
    navItems: content.navItems,
    maxNavItems: cleanMaxNavItems,
    hero: {
      ...content.hero,
      kickerSize: cleanKickerSize,
      imageUrl: (firstVisibleSlide?.imageUrl || content.hero.imageUrl || '').slice(0, 300),
      slides: cleanSlides,
      slideAutoPlay: content.hero.slideAutoPlay ?? true,
      slideIntervalSec: Math.min(30, Math.max(2, Number(content.hero.slideIntervalSec || 5))),
    },
    philosophy: content.philosophy,
    coursesSection: content.coursesSection,
    gallerySection: content.gallerySection,
    artisansSection: content.artisansSection,
    contactSection: content.contactSection,
    paymentConfig: content.paymentConfig,
    footer: {
      ...content.footer,
      browserTabTitle: String(content.footer?.browserTabTitle || '').trim().slice(0, 100),
    },
    customBlocks: content.customBlocks,
    updatedBy,
  };
}

export async function saveSiteContentWithRevision(
  content: SiteContent,
  revisionTitle: string,
  note: string,
  editorName: string,
  editorPhone: string
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('請先完成安全驗證');

  const cleanContent = sanitizeSiteContentForWrite(content, editorName);
  const path = 'site_content/published';
  try {
    await setDoc(doc(db, 'site_content', 'published'), {
      ...cleanContent,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }

  const revPath = 'cms_revisions';
  try {
    await addDoc(collection(db, revPath), {
      revisionTitle: revisionTitle.slice(0, 120) || '網站內容更新',
      note: note.slice(0, 500),
      targetType: 'site_content',
      snapshot: {
        ...cleanContent,
        updatedAt: new Date().toISOString(),
      },
      editorName: editorName.slice(0, 80),
      editorPhone: editorPhone.slice(0, 30),
      ownerUid: uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, revPath);
  }
}

export async function fetchCmsRevisions(): Promise<CmsRevision[]> {
  const path = 'cms_revisions';
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CmsRevision, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteCmsRevision(id: string): Promise<void> {
  const path = `cms_revisions/${id}`;
  try {
    await deleteDoc(doc(db, 'cms_revisions', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Courses CRUD
export async function fetchCourses(): Promise<Course[]> {
  const path = 'courses';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

function sanitizeFieldVisibility(map?: Record<string, boolean>): Record<string, boolean> {
  if (!map) return {};
  const result: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(map).slice(0, 30)) {
    if (typeof val === 'boolean') {
      result[key.slice(0, 40)] = val;
    }
  }
  return result;
}

export async function saveCourse(course: Omit<Course, 'id'> & { id?: string }): Promise<string> {
  const isEdit = Boolean(course.id);
  const path = isEdit ? `courses/${course.id}` : 'courses';
  try {
    const cleanDates = Array.isArray(course.sessionDates)
      ? course.sessionDates.filter((d) => typeof d === 'string' && d.trim() !== '').slice(0, 50)
      : [];
    const payload = {
      title: course.title.slice(0, 120),
      category: course.category.slice(0, 60),
      level: course.level.slice(0, 40),
      duration: course.duration.slice(0, 60),
      startTime: (course.startTime || '').slice(0, 10),
      endTime: (course.endTime || '').slice(0, 10),
      totalSessions: Math.max(1, Math.min(50, Number(course.totalSessions ?? 1))),
      sessionDates: cleanDates,
      courseStatus: (course.courseStatus || 'recruiting') as CourseStatus,
      instructorPayPerSession: Math.max(0, Number(course.instructorPayPerSession ?? 0)),
      price: Math.max(0, Number(course.price)),
      maxSeats: Math.max(1, Number(course.maxSeats)),
      enrolledCount: Math.max(0, Number(course.enrolledCount)),
      scheduleText: course.scheduleText.slice(0, 160),
      location: course.location.slice(0, 120),
      summary: course.summary.slice(0, 500),
      description: course.description.slice(0, 4000),
      materialsIncluded: course.materialsIncluded.slice(0, 1000),
      imageUrl: course.imageUrl.slice(0, 300),
      imageVisible: Boolean(course.imageVisible),
      artisanId: (course.artisanId || '').slice(0, 128),
      artisanName: (course.artisanName || '').slice(0, 80),
      isVisible: Boolean(course.isVisible),
      order: Number(course.order ?? 0),
      fieldVisibility: sanitizeFieldVisibility(course.fieldVisibility),
      updatedAt: serverTimestamp(),
    };
    if (isEdit && course.id) {
      await updateDoc(doc(db, 'courses', course.id), {
        ...payload,
        createdAt: course.createdAt || serverTimestamp(),
      });
      return course.id;
    } else {
      const ref = await addDoc(collection(db, 'courses'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    }
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function duplicateCourse(source: Course, totalCoursesCount: number): Promise<string> {
  return saveCourse({
    ...source,
    id: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    title: `${source.title}（複本）`.slice(0, 120),
    enrolledCount: 0,
    courseStatus: 'recruiting',
    isVisible: false,
    order: totalCoursesCount + 1,
  });
}

export async function deleteCourse(id: string): Promise<void> {
  const path = `courses/${id}`;
  try {
    await deleteDoc(doc(db, 'courses', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Artisans CRUD
export async function fetchArtisans(): Promise<Artisan[]> {
  const path = 'artisans';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Artisan, 'id'>) }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveArtisan(artisan: Omit<Artisan, 'id'> & { id?: string }): Promise<string> {
  const isEdit = Boolean(artisan.id);
  const path = isEdit ? `artisans/${artisan.id}` : 'artisans';
  try {
    const payload = {
      name: artisan.name.slice(0, 80),
      specialty: artisan.specialty.slice(0, 100),
      yearsExperience: Math.max(0, Number(artisan.yearsExperience)),
      phone: (artisan.phone || '').trim().slice(0, 30),
      defaultSessionPay: Math.max(0, Number(artisan.defaultSessionPay ?? 0)),
      quote: artisan.quote.slice(0, 300),
      bio: artisan.bio.slice(0, 2000),
      avatarUrl: artisan.avatarUrl.slice(0, 300),
      imageVisible: Boolean(artisan.imageVisible),
      isVisible: Boolean(artisan.isVisible),
      order: Number(artisan.order ?? 0),
      fieldVisibility: sanitizeFieldVisibility(artisan.fieldVisibility),
      updatedAt: serverTimestamp(),
    };
    if (isEdit && artisan.id) {
      await updateDoc(doc(db, 'artisans', artisan.id), {
        ...payload,
        createdAt: artisan.createdAt || serverTimestamp(),
      });
      return artisan.id;
    } else {
      const ref = await addDoc(collection(db, 'artisans'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    }
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteArtisan(id: string): Promise<void> {
  const path = `artisans/${id}`;
  try {
    await deleteDoc(doc(db, 'artisans', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Gallery CRUD
export async function fetchGalleryWorks(): Promise<GalleryWork[]> {
  const path = 'gallery_works';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<GalleryWork, 'id'>) }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveGalleryWork(
  work: Omit<GalleryWork, 'id'> & { id?: string }
): Promise<string> {
  const isEdit = Boolean(work.id);
  const path = isEdit ? `gallery_works/${work.id}` : 'gallery_works';
  try {
    const payload = {
      title: work.title,
      category: work.category,
      artisanName: work.artisanName,
      year: work.year,
      story: work.story,
      imageUrl: work.imageUrl,
      imageVisible: Boolean(work.imageVisible),
      isVisible: Boolean(work.isVisible),
      order: Number(work.order ?? 0),
      fieldVisibility: sanitizeFieldVisibility(work.fieldVisibility),
      updatedAt: serverTimestamp(),
    };
    if (isEdit && work.id) {
      await updateDoc(doc(db, 'gallery_works', work.id), {
        ...payload,
        createdAt: work.createdAt || serverTimestamp(),
      });
      return work.id;
    } else {
      const ref = await addDoc(collection(db, 'gallery_works'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    }
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteGalleryWork(id: string): Promise<void> {
  const path = `gallery_works/${id}`;
  try {
    await deleteDoc(doc(db, 'gallery_works', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Members: Phone + 6-digit PIN authentication & Admin CRUD
export async function registerMemberWithPhonePin(params: {
  phone: string;
  pin: string;
  name: string;
  email?: string;
}): Promise<Member> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('請先點擊安全連線授權再加入會員');
  const phone = normalizePhone(params.phone);
  if (!/^[0-9+\-\s]{6,20}$/.test(phone)) {
    throw new Error('請輸入正確的手提電話號碼');
  }
  if (!/^\d{6}$/.test(params.pin.trim())) {
    throw new Error('請設定 6 位數純數字 PIN 碼');
  }

  const path = 'members';
  try {
    const q = query(collection(db, path), where('ownerUid', '==', uid), where('phone', '==', phone));
    const existingSnap = await getDocs(q);
    if (!existingSnap.empty) {
      throw new Error('此手提電話號碼已註冊過會員，請直接登入');
    }
    const pinHash = await hashPin(params.pin, phone);
    const payload = {
      ownerUid: uid,
      phone,
      name: params.name.trim(),
      email: (params.email || '').trim(),
      pinHash,
      notes: '',
      status: 'active' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, path), payload);
    return {
      id: ref.id,
      ...payload,
    };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('已註冊') || error.message.includes('請'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function loginMemberWithPhonePin(phoneInput: string, pin: string): Promise<Member> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('請先完成安全連線授權');
  const phone = normalizePhone(phoneInput);
  if (!/^\d{6}$/.test(pin.trim())) {
    throw new Error('PIN 碼必須為 6 位數數字');
  }
  const path = 'members';
  try {
    const q = query(collection(db, path), where('ownerUid', '==', uid), where('phone', '==', phone));
    const snap = await getDocs(q);
    if (snap.empty) {
      throw new Error('找不到此手提電話號碼的會員資料，請先加入會員');
    }
    const docSnap = snap.docs[0];
    const member = { id: docSnap.id, ...(docSnap.data() as Omit<Member, 'id'>) };
    if (member.status === 'suspended') {
      throw new Error('此會員帳號目前已被停權，請聯絡工坊管理員');
    }
    const inputHash = await hashPin(pin, phone);
    if (inputHash !== member.pinHash) {
      throw new Error('6 位數 PIN 碼不正確，請重新確認');
    }
    return member;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('找不到') || error.message.includes('不正確') || error.message.includes('停權'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchAllMembers(): Promise<Member[]> {
  const path = 'members';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Member, 'id'>) }))
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminUpsertMember(params: {
  id?: string;
  ownerUid?: string;
  phone: string;
  name: string;
  email: string;
  newPin?: string;
  existingPinHash?: string;
  notes: string;
  status: 'active' | 'suspended';
  createdAt?: unknown;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('請先登入管理員安全工作階段');
  const phone = normalizePhone(params.phone);
  let pinHash = params.existingPinHash || '';
  if (params.newPin && params.newPin.trim()) {
    if (!/^\d{6}$/.test(params.newPin.trim())) {
      throw new Error('新設 PIN 碼必須為 6 位數數字');
    }
    pinHash = await hashPin(params.newPin, phone);
  }
  if (!pinHash) {
    throw new Error('新增會員時請設定初始 6 位數 PIN 碼');
  }
  const isEdit = Boolean(params.id);
  const path = isEdit ? `members/${params.id}` : 'members';
  try {
    const base = {
      ownerUid: params.ownerUid || uid,
      phone,
      name: params.name.trim(),
      email: params.email.trim(),
      pinHash,
      notes: params.notes.trim(),
      status: params.status,
      updatedAt: serverTimestamp(),
    };
    if (isEdit && params.id) {
      await updateDoc(doc(db, 'members', params.id), {
        ...base,
        createdAt: params.createdAt || serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, 'members'), {
        ...base,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function updateOwnMemberProfile(
  member: Member,
  updates: { name: string; email: string; newPin?: string }
): Promise<Member> {
  const phone = normalizePhone(member.phone);
  let pinHash = member.pinHash;
  if (updates.newPin && updates.newPin.trim()) {
    if (!/^\d{6}$/.test(updates.newPin.trim())) {
      throw new Error('新 PIN 碼必須為 6 位數數字');
    }
    pinHash = await hashPin(updates.newPin, phone);
  }
  const path = `members/${member.id}`;
  try {
    await updateDoc(doc(db, 'members', member.id), {
      name: updates.name.trim(),
      email: updates.email.trim(),
      phone,
      pinHash,
      notes: member.notes || '',
      updatedAt: serverTimestamp(),
    });
    return {
      ...member,
      name: updates.name.trim(),
      email: updates.email.trim(),
      pinHash,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMember(id: string): Promise<void> {
  const path = `members/${id}`;
  try {
    await deleteDoc(doc(db, 'members', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Enrollments & Payments
export async function createEnrollmentAndNotify(params: {
  member: Member;
  course: Course;
  sessionDate: string;
  seats: number;
  paymentMethod: PaymentMethod;
  cardLastFour?: string;
  transferLastFive?: string;
  receiptMediaId?: string;
  studentNote?: string;
}): Promise<Enrollment> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('請先完成安全連線授權');

  const code = `MA-${new Date().getFullYear().toString().slice(-2)}${String(
    Math.floor(100000 + Math.random() * 900000)
  )}`;
  const totalAmount = Number(params.course.price) * Number(params.seats);
  let paymentStatus: PaymentStatus = 'pending_payment';
  if (params.paymentMethod === 'online_card') {
    paymentStatus = 'paid';
  } else if (params.transferLastFive?.trim() || params.receiptMediaId) {
    paymentStatus = 'awaiting_verification';
  }

  const enrollmentPayload = {
    enrollmentCode: code,
    ownerUid: uid,
    memberId: params.member.id,
    memberName: params.member.name,
    memberPhone: params.member.phone,
    courseId: params.course.id,
    courseTitle: params.course.title,
    courseCategory: params.course.category,
    sessionDate: params.sessionDate || params.course.scheduleText,
    seats: Number(params.seats),
    totalAmount,
    paymentMethod: params.paymentMethod,
    paymentStatus,
    cardLastFour: params.cardLastFour ? params.cardLastFour.slice(-4) : '',
    transferLastFive: params.transferLastFive ? params.transferLastFive.trim().slice(0, 10) : '',
    receiptMediaId: params.receiptMediaId || '',
    studentNote: (params.studentNote || '').trim().slice(0, 500),
    adminNote: '',
    verifiedBy: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  let enrollmentId = '';
  try {
    const ref = await addDoc(collection(db, 'enrollments'), enrollmentPayload);
    enrollmentId = ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'enrollments');
  }

  // Create student confirmation notification
  try {
    const title =
      paymentStatus === 'paid'
        ? `報名與線上付款完成：${params.course.title}`
        : `已收到課程報名預約：${params.course.title}`;
    const message =
      paymentStatus === 'paid'
        ? `訂單編號 ${code}（${params.seats} 名，港幣 HK$ ${totalAmount.toLocaleString()}）已完成線上模擬即時付款，期待您在開課日蒞臨工坊。`
        : `訂單編號 ${code} 已成立。${
            paymentStatus === 'awaiting_verification'
              ? '您提交的銀行轉帳資訊已進入管理員核帳佇列，確認後將立即通知您。'
              : '請於 48 小時內完成轉帳並於會員中心補填帳號後五碼或上傳匯款截圖。'
          }`;

    await addDoc(collection(db, 'notifications'), {
      ownerUid: uid,
      memberId: params.member.id,
      enrollmentId,
      title,
      message,
      type: 'enrollment_created',
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications');
  }

  return {
    id: enrollmentId,
    ...enrollmentPayload,
  };
}

export async function submitStudentTransferProof(
  enrollmentId: string,
  transferLastFive: string,
  receiptMediaId: string,
  studentNote: string
): Promise<void> {
  const path = `enrollments/${enrollmentId}`;
  try {
    await updateDoc(doc(db, 'enrollments', enrollmentId), {
      transferLastFive: transferLastFive.trim().slice(0, 10),
      receiptMediaId: receiptMediaId || '',
      paymentStatus: 'awaiting_verification',
      studentNote: studentNote.trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchEnrollmentsByMember(memberId: string): Promise<Enrollment[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const path = 'enrollments';
  try {
    const q = query(
      collection(db, path),
      where('ownerUid', '==', uid),
      where('memberId', '==', memberId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Enrollment, 'id'>) }))
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchAllEnrollments(): Promise<Enrollment[]> {
  const path = 'enrollments';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Enrollment, 'id'>) }))
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminVerifyEnrollmentPayment(params: {
  enrollment: Enrollment;
  newStatus: PaymentStatus;
  adminNote: string;
  adminName: string;
  refundAmount?: number;
  refundReason?: string;
}): Promise<void> {
  const { enrollment, newStatus, adminNote, adminName, refundAmount, refundReason } = params;
  const path = `enrollments/${enrollment.id}`;
  const isRefund = newStatus === 'refunded';
  const cleanRefundAmt = isRefund
    ? Math.max(0, Number(refundAmount ?? enrollment.totalAmount))
    : Number(enrollment.refundAmount ?? 0);
  const cleanRefundReason = isRefund
    ? (refundReason || adminNote || '工坊辦理退款').trim().slice(0, 300)
    : (enrollment.refundReason || '').slice(0, 300);

  try {
    await updateDoc(doc(db, 'enrollments', enrollment.id), {
      paymentStatus: newStatus,
      refundAmount: cleanRefundAmt,
      refundReason: cleanRefundReason,
      refundedAt: isRefund ? new Date().toISOString().slice(0, 10) : enrollment.refundedAt || '',
      adminNote: adminNote.trim().slice(0, 500),
      verifiedBy: adminName.slice(0, 80),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  // Synchronize notification to the member
  const notifTitle =
    newStatus === 'paid'
      ? `繳費確認成功：${enrollment.courseTitle}`
      : newStatus === 'needs_revision'
      ? `匯款資訊需補件：${enrollment.courseTitle}`
      : newStatus === 'refunded'
      ? `退款處理通知：${enrollment.courseTitle}`
      : `報名狀態更新：${enrollment.courseTitle}`;

  const notifMessage =
    newStatus === 'paid'
      ? `管理員 ${adminName} 已確認您的訂單 ${enrollment.enrollmentCode}（港幣 HK$ ${enrollment.totalAmount.toLocaleString()}）繳費成功，您的上課名額已正式保留！${
          adminNote ? ` 備註：${adminNote}` : ''
        }`
      : newStatus === 'needs_revision'
      ? `您的訂單 ${enrollment.enrollmentCode} 轉帳資料尚需補件確認。${
          adminNote ? `管理員說明：${adminNote}` : '請至會員中心重新確認後五碼或憑證截圖。'
        }`
      : newStatus === 'refunded'
      ? `您的訂單 ${enrollment.enrollmentCode} 已辦理退款港幣 HK$ ${cleanRefundAmt.toLocaleString()}。${
          cleanRefundReason ? `說明：${cleanRefundReason}` : ''
        }`
      : `您的訂單 ${enrollment.enrollmentCode} 狀態已更新為「已取消」。${
          adminNote ? `說明：${adminNote}` : ''
        }`;

  try {
    await addDoc(collection(db, 'notifications'), {
      ownerUid: enrollment.ownerUid,
      memberId: enrollment.memberId,
      enrollmentId: enrollment.id,
      title: notifTitle.slice(0, 120),
      message: notifMessage.slice(0, 600),
      type: newStatus === 'paid' ? 'payment_verified' : 'payment_rejected',
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications');
  }
}

export async function deleteEnrollment(id: string): Promise<void> {
  const path = `enrollments/${id}`;
  try {
    await deleteDoc(doc(db, 'enrollments', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Instructor Sessions, Attendance, Payroll & Monthly Class Records
export async function fetchInstructorSessions(): Promise<InstructorSessionRecord[]> {
  const path = 'instructor_sessions';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<InstructorSessionRecord, 'id'>) }))
      .sort((a, b) => (b.sessionDate || '').localeCompare(a.sessionDate || ''));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveInstructorSession(
  record: Omit<InstructorSessionRecord, 'id'> & { id?: string }
): Promise<string> {
  const isEdit = Boolean(record.id);
  const path = isEdit ? `instructor_sessions/${record.id}` : 'instructor_sessions';
  const cleanDate = record.sessionDate.trim().slice(0, 20);
  const cleanMonth = cleanDate.length >= 7 ? cleanDate.slice(0, 7) : record.monthKey.slice(0, 7);
  try {
    const payload = {
      artisanId: (record.artisanId || '').slice(0, 128),
      artisanName: (record.artisanName || '未指定導師').slice(0, 80),
      courseId: (record.courseId || '').slice(0, 128),
      courseTitle: (record.courseTitle || '未指定課程').slice(0, 120),
      sessionDate: cleanDate,
      monthKey: cleanMonth,
      startTime: (record.startTime || '').slice(0, 10),
      endTime: (record.endTime || '').slice(0, 10),
      durationText: (record.durationText || '').slice(0, 60),
      attendanceStatus: (record.attendanceStatus || 'present') as InstructorAttendanceStatus,
      substituteName: (record.substituteName || '').slice(0, 80),
      payAmount: Math.max(0, Number(record.payAmount ?? 0)),
      payStatus: (record.payStatus || 'unpaid') as 'unpaid' | 'paid',
      note: (record.note || '').slice(0, 500),
      updatedAt: serverTimestamp(),
    };
    if (isEdit && record.id) {
      await updateDoc(doc(db, 'instructor_sessions', record.id), {
        ...payload,
        createdAt: record.createdAt || serverTimestamp(),
      });
      return record.id;
    } else {
      const ref = await addDoc(collection(db, 'instructor_sessions'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    }
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteInstructorSession(id: string): Promise<void> {
  const path = `instructor_sessions/${id}`;
  try {
    await deleteDoc(doc(db, 'instructor_sessions', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Notifications
export async function fetchNotificationsByMember(memberId: string): Promise<MemberNotification[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const path = 'notifications';
  try {
    const q = query(
      collection(db, path),
      where('ownerUid', '==', uid),
      where('memberId', '==', memberId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<MemberNotification, 'id'>) }))
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await updateDoc(doc(db, 'notifications', id), {
      isRead: true,
      readAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Contact Form Submissions
export async function createContactSubmission(params: {
  name: string;
  phone: string;
  email: string;
  inquiryType: string;
  message: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('請先點擊安全連線驗證後再送出表單');
  const path = 'contact_submissions';
  try {
    await addDoc(collection(db, path), {
      ownerUid: uid,
      name: params.name.trim().slice(0, 80),
      phone: normalizePhone(params.phone).slice(0, 30),
      email: params.email.trim().slice(0, 120),
      inquiryType: params.inquiryType.trim().slice(0, 60),
      message: params.message.trim().slice(0, 2000),
      status: 'new',
      adminReplyNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchAllContactSubmissions(): Promise<ContactSubmission[]> {
  const path = 'contact_submissions';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ContactSubmission, 'id'>) }))
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updateContactSubmission(
  submission: ContactSubmission,
  status: ContactSubmission['status'],
  adminReplyNote: string
): Promise<void> {
  const path = `contact_submissions/${submission.id}`;
  try {
    await updateDoc(doc(db, 'contact_submissions', submission.id), {
      status,
      adminReplyNote: adminReplyNote.trim().slice(0, 1000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteContactSubmission(id: string): Promise<void> {
  const path = `contact_submissions/${id}`;
  try {
    await deleteDoc(doc(db, 'contact_submissions', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Admin Users & RBAC
export async function fetchAllAdminUsers(): Promise<AdminUser[]> {
  const path = 'admin_users';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<AdminUser, 'id'>) }))
      .sort((a, b) => (a.isSuperAdmin ? -1 : b.isSuperAdmin ? 1 : 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

function toAdminEmailKey(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

async function syncAdminEmailEntry(
  email: string,
  adminUserId: string,
  isActive: boolean
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return;
  const key = toAdminEmailKey(cleanEmail);
  if (!key) return;
  const ref = doc(db, 'admin_emails', key);
  const existing = await getDoc(ref);
  await setDoc(ref, {
    email: cleanEmail.slice(0, 120),
    adminUserId: adminUserId.slice(0, 128),
    isActive: Boolean(isActive),
    createdAt: existing.exists() ? existing.data().createdAt || serverTimestamp() : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function checkAdminPasscodeSyncStatus(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'system_meta', 'passcode_sync'));
    return snap.exists() && snap.data()?.synced === true;
  } catch {
    return false;
  }
}

export async function syncAllAdminPasscodes(): Promise<void> {
  const path = 'admin_passcodes';
  try {
    const adminsSnap = await getDocs(collection(db, 'admin_users'));
    const batch = writeBatch(db);
    for (const d of adminsSnap.docs) {
      const data = d.data() as Partial<AdminUser>;
      if (data.pinHash && typeof data.pinHash === 'string' && data.pinHash.length >= 32) {
        batch.set(doc(db, 'admin_passcodes', data.pinHash), {
          adminUserId: d.id,
          isActive: data.isActive !== false,
          updatedAt: serverTimestamp(),
        });
      }
    }
    batch.set(doc(db, 'system_meta', 'passcode_sync'), {
      synced: true,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveAdminUser(params: {
  id?: string;
  phone: string;
  name: string;
  roleTitle: string;
  boundEmail: string;
  newPin?: string;
  existingPinHash?: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  permissions: AdminPermissions;
  createdAt?: unknown;
}): Promise<string> {
  const phone = normalizePhone(params.phone);
  if (!/^[0-9+\-\s]{6,20}$/.test(phone)) {
    throw new Error('管理員手提電話格式不正確');
  }
  let pinHash = params.existingPinHash || '';
  if (params.newPin && params.newPin.trim()) {
    if (!/^\d{6}$/.test(params.newPin.trim())) {
      throw new Error('管理員 PIN 碼必須為 6 位數數字');
    }
    pinHash = await hashPin(params.newPin, phone);
  }
  if (!pinHash) {
    throw new Error('請為新管理員設定 6 位數 PIN 碼');
  }

  const isEdit = Boolean(params.id);
  const path = isEdit ? `admin_users/${params.id}` : 'admin_users';
  try {
    let previousEmail = '';
    let previousPinHash = '';
    if (isEdit && params.id) {
      const prevSnap = await getDoc(doc(db, 'admin_users', params.id));
      if (prevSnap.exists()) {
        const prevData = prevSnap.data();
        previousEmail = String(prevData.boundEmail || '').trim().toLowerCase();
        previousPinHash = String(prevData.pinHash || '').trim();
        const prevPhone = normalizePhone(String(prevData.phone || ''));
        if (prevPhone && prevPhone !== phone && !(params.newPin && params.newPin.trim())) {
          throw new Error('更改管理員登入電話號碼時，請同時輸入新的 6 位數 PIN 碼');
        }
      }
    }

    const cleanBoundEmail = params.boundEmail.trim().toLowerCase();
    const payload = {
      phone,
      name: params.name.trim(),
      roleTitle: params.roleTitle.trim(),
      boundEmail: params.boundEmail.trim(),
      pinHash,
      isSuperAdmin: Boolean(params.isSuperAdmin),
      isActive: Boolean(params.isActive),
      permissions: params.permissions,
      updatedAt: serverTimestamp(),
    };
    let savedId = params.id || '';
    if (isEdit && params.id) {
      await updateDoc(doc(db, 'admin_users', params.id), {
        ...payload,
        createdAt: params.createdAt || serverTimestamp(),
      });
      savedId = params.id;
    } else {
      const ref = await addDoc(collection(db, 'admin_users'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      savedId = ref.id;
    }

    if (previousEmail && previousEmail !== cleanBoundEmail) {
      await deleteDoc(doc(db, 'admin_emails', toAdminEmailKey(previousEmail))).catch(() => {});
    }
    if (cleanBoundEmail) {
      await syncAdminEmailEntry(cleanBoundEmail, savedId, params.isActive);
    }

    if (previousPinHash && previousPinHash !== pinHash) {
      await deleteDoc(doc(db, 'admin_passcodes', previousPinHash)).catch(() => {});
    }
    await setDoc(doc(db, 'admin_passcodes', pinHash), {
      adminUserId: savedId,
      isActive: Boolean(params.isActive),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'system_meta', 'passcode_sync'), {
      synced: true,
      updatedAt: serverTimestamp(),
    });

    return savedId;
  } catch (error) {
    if (error instanceof Error && error.message.includes('更改管理員登入電話號碼')) {
      throw error;
    }
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteAdminUser(id: string): Promise<void> {
  const path = `admin_users/${id}`;
  try {
    const snap = await getDoc(doc(db, 'admin_users', id));
    const boundEmail = snap.exists() ? String(snap.data().boundEmail || '').trim().toLowerCase() : '';
    const pinHash = snap.exists() ? String(snap.data().pinHash || '').trim() : '';
    await deleteDoc(doc(db, 'admin_users', id));
    if (boundEmail) {
      await deleteDoc(doc(db, 'admin_emails', toAdminEmailKey(boundEmail))).catch(() => {});
    }
    if (pinHash) {
      await deleteDoc(doc(db, 'admin_passcodes', pinHash)).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function loginAdminWithPhonePin(phoneInput: string, pin: string): Promise<AdminUser> {
  const phone = normalizePhone(phoneInput);
  if (!/^[0-9+\-\s]{6,20}$/.test(phone)) {
    throw new Error('請輸入正確的管理員手提電話號碼');
  }
  if (!/^\d{6}$/.test(pin.trim())) {
    throw new Error('PIN 碼必須為 6 位數數字');
  }

  const user = await ensureAnonymousSession();
  const uid = user.uid;
  const pinHash = await hashPin(pin, phone);

  const isVerifiedSuperAdmin =
    !user.isAnonymous &&
    user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() &&
    user.emailVerified;

  if (isVerifiedSuperAdmin) {
    await seedDatabaseIfEmpty();
    const admins = await fetchAllAdminUsers();
    const target = admins.find((a) => normalizePhone(a.phone) === phone);
    if (!target) {
      throw new Error('找不到此管理員手提電話帳號');
    }
    if (!target.isActive) {
      throw new Error('此管理員帳號已被停用');
    }
    if (pinHash !== target.pinHash) {
      throw new Error('管理員 6 位數 PIN 碼不正確');
    }
    await setDoc(doc(db, 'admin_passcodes', pinHash), {
      adminUserId: target.id,
      isActive: Boolean(target.isActive),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'admin_identities', uid), {
      uid,
      email: user.email || '',
      adminUserId: target.id,
      credentialHash: pinHash,
      createdAt: serverTimestamp(),
    });
    return target;
  }

  const passSnap = await getDoc(doc(db, 'admin_passcodes', pinHash));
  if (!passSnap.exists()) {
    const isSynced = await checkAdminPasscodeSyncStatus();
    if (!isSynced) {
      throw new Error('NEED_LEGACY_PASSCODE_SYNC');
    }
    throw new Error('管理員手提電話或 6 位數 PIN 碼不正確');
  }

  const passData = passSnap.data() as { adminUserId?: string; isActive?: boolean };
  if (!passData.isActive || !passData.adminUserId) {
    throw new Error('此管理員帳號已被停用');
  }

  const identityRef = doc(db, 'admin_identities', uid);
  await setDoc(identityRef, {
    uid,
    email: user.email || '',
    adminUserId: passData.adminUserId,
    credentialHash: pinHash,
    createdAt: serverTimestamp(),
  });

  const adminSnap = await getDoc(doc(db, 'admin_users', passData.adminUserId));
  if (!adminSnap.exists()) {
    await deleteDoc(identityRef).catch(() => {});
    throw new Error('找不到對應的管理員帳號資料');
  }

  const target = {
    id: adminSnap.id,
    ...(adminSnap.data() as Omit<AdminUser, 'id'>),
  };
  if (!target.isActive) {
    await deleteDoc(identityRef).catch(() => {});
    throw new Error('此管理員帳號已被停用');
  }
  if (pinHash !== target.pinHash) {
    await deleteDoc(identityRef).catch(() => {});
    throw new Error('管理員 6 位數 PIN 碼不正確');
  }
  return target;
}

export async function logoutAdminSession(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid) {
    await deleteDoc(doc(db, 'admin_identities', uid)).catch(() => {});
  }
}

export async function changeOwnAdminPin(params: {
  adminId: string;
  currentPin: string;
  newPin: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('安全連線工作階段已失效，請重新登入後再修改 PIN 碼');
  }

  const currentPin = params.currentPin.trim();
  const newPin = params.newPin.trim();
  if (!/^\d{6}$/.test(currentPin)) {
    throw new Error('請輸入目前的 6 位數純數字 PIN 碼');
  }
  if (!/^\d{6}$/.test(newPin)) {
    throw new Error('新 PIN 碼必須為 6 位數純數字');
  }
  if (currentPin === newPin) {
    throw new Error('新 6 位數 PIN 碼不可與目前的 PIN 碼相同');
  }

  const path = `admin_users/${params.adminId}`;
  try {
    const isVerifiedSuperAdmin =
      !user.isAnonymous &&
      user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() &&
      user.emailVerified;

    const identityRef = doc(db, 'admin_identities', user.uid);
    const identitySnap = await getDoc(identityRef);
    if (!isVerifiedSuperAdmin) {
      if (!identitySnap.exists() || identitySnap.data()?.adminUserId !== params.adminId) {
        throw new Error('目前登入的工作階段與此管理員帳號不符，請重新登入後再修改 PIN 碼');
      }
    }

    const ref = doc(db, 'admin_users', params.adminId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('找不到您的管理員帳號資料，請重新登入後再試');
    }
    const data = snap.data() as Omit<AdminUser, 'id'>;
    if (!data.isActive) {
      throw new Error('此管理員帳號已被停用，無法修改 PIN 碼');
    }

    const currentHash = await hashPin(currentPin, data.phone);
    if (currentHash !== data.pinHash) {
      throw new Error('目前的 6 位數 PIN 碼不正確，請重新確認');
    }

    const newPinHash = await hashPin(newPin, data.phone);
    await updateDoc(ref, {
      pinHash: newPinHash,
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'admin_passcodes', newPinHash), {
      adminUserId: params.adminId,
      isActive: Boolean(data.isActive),
      updatedAt: serverTimestamp(),
    });
    if (data.pinHash && data.pinHash !== newPinHash) {
      await deleteDoc(doc(db, 'admin_passcodes', data.pinHash)).catch(() => {});
    }
    if (identitySnap.exists()) {
      await setDoc(identityRef, {
        uid: user.uid,
        email: user.email || '',
        adminUserId: params.adminId,
        credentialHash: newPinHash,
        createdAt: serverTimestamp(),
      });
    }

    return newPinHash;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('PIN') ||
        error.message.includes('找不到') ||
        error.message.includes('停用') ||
        error.message.includes('不符'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Seed initial catalog + default Super Admin when owner first accesses database
export async function seedDatabaseIfEmpty(): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase() || !user.emailVerified) return;

  try {
    const siteSnap = await getDoc(doc(db, 'site_content', 'published'));
    if (!siteSnap.exists()) {
      await setDoc(doc(db, 'site_content', 'published'), {
        ...sanitizeSiteContentForWrite(DEFAULT_SITE_CONTENT, '系統初始化'),
        updatedAt: serverTimestamp(),
      });
    }

    const coursesSnap = await getDocs(collection(db, 'courses'));
    if (coursesSnap.empty) {
      const batch = writeBatch(db);
      DEFAULT_COURSES.forEach((c) => {
        const ref = doc(collection(db, 'courses'));
        batch.set(ref, { ...c, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      await batch.commit();
    }

    const artisansSnap = await getDocs(collection(db, 'artisans'));
    if (artisansSnap.empty) {
      const batch = writeBatch(db);
      DEFAULT_ARTISANS.forEach((a) => {
        const ref = doc(collection(db, 'artisans'));
        batch.set(ref, { ...a, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      await batch.commit();
    }

    const gallerySnap = await getDocs(collection(db, 'gallery_works'));
    if (gallerySnap.empty) {
      const batch = writeBatch(db);
      DEFAULT_GALLERY.forEach((g) => {
        const ref = doc(collection(db, 'gallery_works'));
        batch.set(ref, { ...g, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      await batch.commit();
    }

    const adminSnap = await getDocs(collection(db, 'admin_users'));
    if (adminSnap.empty) {
      const defaultPhone = '0900000000';
      const pinHash = await hashPin('000000', defaultPhone);
      const ref = await addDoc(collection(db, 'admin_users'), {
        phone: defaultPhone,
        name: '總監主理人',
        roleTitle: '系統超級管理員',
        boundEmail: SUPER_ADMIN_EMAIL,
        pinHash,
        isSuperAdmin: true,
        isActive: true,
        permissions: {
          cms: true,
          media: true,
          courses: true,
          members: true,
          payments: true,
          accounting: true,
          forms: true,
          analytics: true,
          admins: true,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await syncAdminEmailEntry(SUPER_ADMIN_EMAIL, ref.id, true);
    } else {
      for (const d of adminSnap.docs) {
        const data = d.data() as Partial<AdminUser>;
        if (data.boundEmail && String(data.boundEmail).includes('@')) {
          await syncAdminEmailEntry(String(data.boundEmail), d.id, data.isActive !== false).catch(
            () => {}
          );
        }
      }
    }

    await syncAllAdminPasscodes();
  } catch (error) {
    console.warn('Initial seed check skipped or partial:', error);
  }
}

export function getTimeMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'string') return Date.parse(ts) || 0;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

export function formatDateTime(ts: unknown): string {
  const ms = getTimeMs(ts);
  if (!ms) return '剛剛';
  return new Date(ms).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
