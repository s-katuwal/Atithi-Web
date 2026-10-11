'use strict';
// Uploaded photos go to Supabase Storage (a public bucket). Without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// they are saved to data/uploads on this computer instead (fine for local testing, not for Vercel).
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';
const PRIVATE_BUCKET = 'private-files'; // CVs etc. — only readable through the admin panel
const LOCAL_DIR = path.join(__dirname, '..', 'data', 'uploads');
const LOCAL_PRIVATE_DIR = path.join(__dirname, '..', 'data', 'private');
const useSupabase = Boolean(SUPABASE_URL && KEY);

function headers(extra = {}) {
  // Legacy service_role keys are JWTs ("eyJ…") and also go in Authorization; new "sb_secret_…" keys only in apikey.
  return { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}), ...extra };
}

const bucketReady = {};
function ensureBucket(id = BUCKET, isPublic = true) {
  bucketReady[id] ||= fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id, name: id, public: isPublic, file_size_limit: 10 * 1024 * 1024 }),
  }).then(async (res) => {
    if (res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (/already exists/i.test(body.message || body.error || '')) return;
    throw new Error(`Could not create storage bucket "${id}": ${body.message || res.statusText}`);
  }).catch((e) => { delete bucketReady[id]; throw e; });
  return bucketReady[id];
}

async function upload(bucket, name, buf, contentType) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${name}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' }),
    body: buf,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Upload failed: ${body.message || res.statusText}`);
  }
}

/** Save an image and return its public URL. */
async function saveImage(name, buf, contentType) {
  if (!useSupabase) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_DIR, name), buf);
    return `/uploads/${name}`;
  }
  await ensureBucket(BUCKET, true);
  await upload(BUCKET, name, buf, contentType);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`;
}

/** Save a private file (e.g. a CV). Returns a storage path, not a public URL. */
async function savePrivate(name, buf, contentType) {
  if (!useSupabase) {
    fs.mkdirSync(LOCAL_PRIVATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_PRIVATE_DIR, name), buf);
    return `local:${name}`;
  }
  await ensureBucket(PRIVATE_BUCKET, false);
  await upload(PRIVATE_BUCKET, name, buf, contentType);
  return `sb:${name}`;
}

/** Read a private file saved with savePrivate(). */
async function readPrivate(stored) {
  const [kind, name] = String(stored).split(':');
  if (!name || !/^[\w.-]+$/.test(name)) throw new Error('File not found');
  if (kind === 'local') return fs.readFileSync(path.join(LOCAL_PRIVATE_DIR, name));
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${PRIVATE_BUCKET}/${name}`, { headers: headers() });
  if (!res.ok) throw new Error('File not found');
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { saveImage, savePrivate, readPrivate, useSupabase, LOCAL_DIR };
