import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
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

export async function signInAdminWithEmailPassword(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function registerAdminWithEmailPassword(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function sendAdminPasswordSetupEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
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

  if (raw.includes('auth/operation-not-allowed') || raw.includes('auth/admin-restricted-operation')) {
    return 'Firebase Authentication 尚未開啟「電子郵件／密碼（Email/Password）」登入功能。請前往 Firebase Console → Authentication → Sign-in method 開啟「Email/Password」後重試。';
  }
  if (
    raw.includes('auth/invalid-credential') ||
    raw.includes('auth/wrong-password') ||
    raw.includes('auth/user-not-found')
  ) {
    return '管理員電郵或密碼不正確。若此信箱過去曾以 Google 登入過而尚未設定專屬密碼，請先點擊下方「寄送設定／重設密碼信」完成密碼設定。';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return '此電郵已在帳號系統中存在（可能曾使用 Google 驗證過），請切換為「電郵密碼登入」，或點擊「寄送設定／重設密碼信」來設定密碼。';
  }
  if (raw.includes('auth/weak-password')) {
    return '密碼強度不足，請設定至少 6 個字元以上的密碼。';
  }
  if (raw.includes('auth/invalid-email')) {
    return '管理員電郵格式不正確，請重新確認。';
  }
  if (raw.includes('auth/too-many-requests')) {
    return '嘗試次數過多，請稍候幾分鐘後再試。';
  }
  if (raw.includes('auth/network-request-failed')) {
    return '網路連線暫時中斷，無法連線至驗證服務，請確認網路狀態後重試。';
  }
  if (raw.includes('Missing or insufficient permissions') || raw.includes('PERMISSION_DENIED')) {
    if (auth.currentUser?.isAnonymous) {
      return '目前為前台訪客匿名連線狀態，請先於上方輸入「管理員電郵與密碼」完成驗證後再登入後台。';
    }
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      return '您的管理員電郵尚未完成信箱驗證，請至信箱點擊驗證連結後，再按「我已完成驗證，重新檢查」。';
    }
    let signedEmail = auth.currentUser?.email || '';
    try {
      const parsed = JSON.parse(raw) as { authInfo?: { email?: string } };
      if (parsed?.authInfo?.email) signedEmail = parsed.authInfo.email;
    } catch {
      // ignore non-JSON
    }
    return `目前登入的管理員帳號（${signedEmail || '未登入'}）尚無後台資料庫存取權限。請改用總監信箱「${SUPER_ADMIN_EMAIL}」或已綁定權限的管理員電郵登入。`;
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
