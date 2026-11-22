import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const SUPER_ADMIN_EMAIL = 'timelessinheritancemission@gmail.com';

export async function ensureAnonymousSession(): Promise<User> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function signInOwnerForOneTimePasscodeSync(): Promise<User> {
  if (
    auth.currentUser &&
    !auth.currentUser.isAnonymous &&
    auth.currentUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() &&
    auth.currentUser.emailVerified
  ) {
    return auth.currentUser;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export function formatFrontAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '連線驗證失敗');
  if (raw.includes('auth/operation-not-allowed') || raw.includes('auth/admin-restricted-operation')) {
    return '系統尚未於 Firebase Console 開啟「匿名驗證（Anonymous）」連線方式，請管理員先至 Firebase Console → Authentication → Sign-in method 啟用「Anonymous」。';
  }
  if (raw.includes('auth/network-request-failed')) {
    return '網路連線暫時中斷，請確認網路狀態後重試。';
  }
  return raw;
}

export function formatAdminAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '管理員登入失敗');

  if (raw.includes('NEED_LEGACY_PASSCODE_SYNC')) {
    return '系統已升級為「純手機號碼＋6 位數 PIN 碼」免彈窗登入。偵測到舊版管理員資料尚未同步登入索引，請點擊下方「一鍵同步現有管理員資料（只需執行一次）」即可完成啟用。';
  }
  if (raw.includes('auth/operation-not-allowed') || raw.includes('auth/admin-restricted-operation')) {
    return '系統尚未於 Firebase Console 開啟「匿名驗證（Anonymous）」連線方式，請先於 Firebase Console → Authentication → Sign-in method 開啟「Anonymous」。';
  }
  if (raw.includes('auth/popup-closed-by-user')) {
    return '已取消一次性資料同步驗證視窗。';
  }
  if (raw.includes('auth/popup-blocked')) {
    return '瀏覽器封鎖了同步授權視窗，請允許彈出視窗後再試一次。';
  }
  if (raw.includes('auth/too-many-requests')) {
    return '嘗試次數過多，請稍候幾分鐘後再試。';
  }
  if (raw.includes('auth/network-request-failed')) {
    return '網路連線暫時中斷，無法連線至驗證服務，請確認網路狀態後重試。';
  }
  if (raw.includes('Missing or insufficient permissions') || raw.includes('PERMISSION_DENIED')) {
    return '管理員驗證尚未通過或帳號權限已變更，請重新確認手提電話與 6 位數 PIN 碼後再試。';
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
