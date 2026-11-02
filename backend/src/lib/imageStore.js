// Stores product photos.
// - On Netlify: Netlify Blobs (store "product-images"), enabled by the function wrapper.
// - Locally (npm run dev): files in backend/uploads/.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCAL_DIR = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
const STORE_NAME = 'product-images';

const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const KEY_RE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

function useBlobs() {
  return process.env.NEWEXIT_IMAGE_STORE === 'blobs';
}

function blobStore() {
  const { getStore } = require('@netlify/blobs');
  return getStore(STORE_NAME);
}

async function save(buffer, contentType) {
  const ext = TYPES[contentType];
  if (!ext) throw new Error(`Unsupported image type: ${contentType}`);
  const key = `${crypto.randomUUID()}.${ext}`;

  if (useBlobs()) {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    await blobStore().set(key, arrayBuffer, { metadata: { contentType } });
  } else {
    await fs.promises.mkdir(LOCAL_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(LOCAL_DIR, key), buffer);
  }
  return key;
}

async function load(key) {
  if (!KEY_RE.test(key)) return null;
  const ext = key.split('.').pop();
  const contentType = Object.keys(TYPES).find((t) => TYPES[t] === ext);

  if (useBlobs()) {
    const data = await blobStore().get(key, { type: 'arrayBuffer' });
    return data ? { data: Buffer.from(data), contentType } : null;
  }
  try {
    return { data: await fs.promises.readFile(path.join(LOCAL_DIR, key)), contentType };
  } catch {
    return null;
  }
}

module.exports = { save, load, TYPES };
