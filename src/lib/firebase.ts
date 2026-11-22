import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const SUPER_ADMIN_EMAIL = 'timelessinheritancemission@gmail.com';

export async function signInWithGoogleSelectAccount(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export function formatAdminAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '管理員登入失敗');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  if (raw.includes('auth/unauthorized-domain')) {
    return `此發佈網域（${host || '目前網址'}）尚未加入 Firebase Authentication「已授權網域 (Authorized domains)」白名單，因此無法開啟 Google 安全驗證。請前往 Firebase Console → Authentication → Settings → Authorized domains 新增「${host}」後重新整理即可登入。`;
  }
  if (raw.includes('auth/popup-blocked')) {
    return '瀏覽器封鎖了 Google 安全驗證彈跳視窗。請允許本網站顯示彈跳視窗，或改用 Chrome／Safari 原生瀏覽器開啟（避免於 LINE／IG／WeChat 內建瀏覽器開啟）。';
  }
  if (raw.includes('auth/popup-closed-by-user') || raw.includes('auth/cancelled-popup-request')) {
    return 'Google 驗證視窗尚未完成即被關閉，請點擊「切換／驗證 Google 帳號」或重新送出並完成授權。';
  }
  if (raw.includes('auth/network-request-failed')) {
    return '網路連線暫時中斷，無法連線至 Google 驗證服務，請確認網路狀態後重試。';
  }
  if (raw.includes('Missing or insufficient permissions') || raw.includes('PERMISSION_DENIED')) {
    let signedEmail = auth.currentUser?.email || '';
    try {
      const parsed = JSON.parse(raw) as { authInfo?: { email?: string } };
      if (parsed?.authInfo?.email) signedEmail = parsed.authInfo.email;
    } catch {
      // ignore non-JSON
    }
    return `目前 Google 帳號（${signedEmail || '未登入'}）尚無後台資料庫存取權限。請點擊「切換 Google 帳號」改用主理人信箱「${SUPER_ADMIN_EMAIL}」或已綁定權限的管理員信箱登入。`;
  }
  return raw;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function normalizePhone(rawPhone: string): string {
  return rawPhone.replace(/[\s\-()]/g, '').trim();
}

export async function hashPin(pin: string, phone: string): Promise<string> {
  const normalized = normalizePhone(phone);
  const payload = new TextEncoder().encode(`ma-craft-atelier:${normalized}:${pin.trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
