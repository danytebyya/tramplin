const CHAT_CRYPTO_STORAGE_KEY = "tramplin.chat.keypair.v1";
const CHAT_CRYPTO_ALGORITHM = "ECDH_P256";

type StoredKeyPair = {
  algorithm: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

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

function readStoredKeyPair(): StoredKeyPair | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(CHAT_CRYPTO_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoredKeyPair;
  } catch {
    return null;
  }
}

function writeStoredKeyPair(value: StoredKeyPair) {
  window.localStorage.setItem(CHAT_CRYPTO_STORAGE_KEY, JSON.stringify(value));
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

export async function ensureChatKeyPair() {
  const stored = readStoredKeyPair();
  if (stored) {
    return stored;
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
  writeStoredKeyPair(nextValue);
  return nextValue;
}

export async function encryptChatMessage(params: {
  plaintext: string;
  ownPrivateKeyJwk: JsonWebKey;
  counterpartPublicKeyJwk: JsonWebKey;
  conversationId: string;
}) {
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
  ownPrivateKeyJwk: JsonWebKey;
  counterpartPublicKeyJwk: JsonWebKey;
  conversationId: string;
}) {
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
