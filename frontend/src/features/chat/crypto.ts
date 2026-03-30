const CHAT_CRYPTO_STORAGE_KEY = "tramplin.chat.keypair.v1";
const CHAT_CRYPTO_ALGORITHM = "ECDH_P256";
const CHAT_PLAINTEXT_PREFIX = "plain:";
const CHAT_PLAINTEXT_IV = "plain-iv-000";
const CHAT_PLAINTEXT_SALT = "plain-salt-000";

type StoredKeyPair = {
  algorithm: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

export function canUseChatCrypto() {
  return typeof window !== "undefined" && Boolean(window.crypto?.subtle);
}

export function isPlaintextChatMessage(ciphertext: string) {
  return ciphertext.startsWith(CHAT_PLAINTEXT_PREFIX);
}

function encodeText(value: string) {
  return new TextEncoder().encode(value);
}

function encodeBase64(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function decodeBase64(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBufferSource(value: Uint8Array) {
  return new Uint8Array(value);
}

function getChatKeyStorageKey(scope?: string | null) {
  return scope ? `${CHAT_CRYPTO_STORAGE_KEY}:${scope}` : CHAT_CRYPTO_STORAGE_KEY;
}

function readLegacyStoredKeyPair() {
  return readStoredKeyPair(null);
}

function readStoredKeyPair(scope?: string | null): StoredKeyPair | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(getChatKeyStorageKey(scope));
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoredKeyPair;
  } catch {
    return null;
  }
}

function writeStoredKeyPair(value: StoredKeyPair, scope?: string | null) {
  window.localStorage.setItem(getChatKeyStorageKey(scope), JSON.stringify(value));
}

export function clearStoredChatKeyPair(scope?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getChatKeyStorageKey(scope));
}

export function migrateLegacyStoredChatKeyPair(scope: string, expectedPublicKeyJwk?: JsonWebKey | null) {
  if (typeof window === "undefined" || !scope) {
    return null;
  }

  const scopedStorageKey = getChatKeyStorageKey(scope);
  const legacyStorageKey = getChatKeyStorageKey();
  const scopedRawValue = window.localStorage.getItem(scopedStorageKey);

  if (scopedRawValue) {
    window.localStorage.removeItem(legacyStorageKey);
    return readStoredKeyPair(scope);
  }

  const legacyPair = readLegacyStoredKeyPair();
  if (!legacyPair) {
    return null;
  }

  if (expectedPublicKeyJwk && !areChatKeysEqual(legacyPair.publicKeyJwk, expectedPublicKeyJwk)) {
    window.localStorage.removeItem(legacyStorageKey);
    return null;
  }

  writeStoredKeyPair(legacyPair, scope);
  window.localStorage.removeItem(legacyStorageKey);
  return legacyPair;
}

export function getStoredChatKeyPair(scope?: string | null) {
  return readStoredKeyPair(scope);
}

export function storeChatKeyPair(value: StoredKeyPair, scope?: string | null) {
  writeStoredKeyPair(value, scope);
}

export function areChatKeysEqual(left?: JsonWebKey | null, right?: JsonWebKey | null) {
  if (!left || !right) {
    return left === right;
  }

  return JSON.stringify(left) === JSON.stringify(right);
}

async function importPrivateKey(privateKeyJwk: JsonWebKey) {
  return window.crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

async function importPublicKey(publicKeyJwk: JsonWebKey) {
  return window.crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

async function deriveEncryptionKey(privateKeyJwk: JsonWebKey, publicKeyJwk: JsonWebKey, salt: Uint8Array, info: string) {
  const privateKey = await importPrivateKey(privateKeyJwk);
  const publicKey = await importPublicKey(publicKeyJwk);
  const sharedBits = await window.crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    256,
  );
  const hkdfKey = await window.crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  return window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBufferSource(salt),
      info: encodeText(info),
    },
    hkdfKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function ensureChatKeyPair(scope?: string | null) {
  const stored = readStoredKeyPair(scope);
  if (stored) {
    return stored;
  }

  if (!canUseChatCrypto()) {
    throw new Error("Web Crypto API is unavailable in the current context");
  }

  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"],
  );

  const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const nextValue = {
    algorithm: CHAT_CRYPTO_ALGORITHM,
    publicKeyJwk,
    privateKeyJwk,
  };
  writeStoredKeyPair(nextValue, scope);
  return nextValue;
}

export async function encryptChatMessage(params: {
  plaintext: string;
  ownPrivateKeyJwk?: JsonWebKey | null;
  counterpartPublicKeyJwk?: JsonWebKey | null;
  conversationId: string;
}) {
  if (!canUseChatCrypto() || !params.counterpartPublicKeyJwk || !params.ownPrivateKeyJwk) {
    return {
      ciphertext: `${CHAT_PLAINTEXT_PREFIX}${encodeBase64(encodeText(params.plaintext))}`,
      iv: CHAT_PLAINTEXT_IV,
      salt: CHAT_PLAINTEXT_SALT,
    };
  }

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveEncryptionKey(
    params.ownPrivateKeyJwk,
    params.counterpartPublicKeyJwk,
    salt,
    `tramplin-chat:${params.conversationId}`,
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toBufferSource(iv),
    },
    key,
    encodeText(params.plaintext),
  );
  return {
    ciphertext: encodeBase64(ciphertext),
    iv: encodeBase64(iv),
    salt: encodeBase64(salt),
  };
}

export async function decryptChatMessage(params: {
  ciphertext: string;
  iv: string;
  salt: string;
  ownPrivateKeyJwk?: JsonWebKey | null;
  counterpartPublicKeyJwk?: JsonWebKey | null;
  conversationId: string;
}) {
  if (params.ciphertext.startsWith(CHAT_PLAINTEXT_PREFIX)) {
    return new TextDecoder().decode(decodeBase64(params.ciphertext.slice(CHAT_PLAINTEXT_PREFIX.length)));
  }

  if (!canUseChatCrypto()) {
    throw new Error("Web Crypto API is unavailable in the current context");
  }

  if (!params.counterpartPublicKeyJwk) {
    throw new Error("Missing counterpart key");
  }

  if (!params.ownPrivateKeyJwk) {
    throw new Error("Missing own private key");
  }

  const key = await deriveEncryptionKey(
    params.ownPrivateKeyJwk,
    params.counterpartPublicKeyJwk,
    decodeBase64(params.salt),
    `tramplin-chat:${params.conversationId}`,
  );
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toBufferSource(decodeBase64(params.iv)),
    },
    key,
    decodeBase64(params.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
