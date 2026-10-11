'use strict';
// Uploaded photos go to Supabase Storage (a public bucket). Without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// they are saved to data/uploads on this computer instead (fine for local testing, not for Vercel).
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';
const LOCAL_DIR = path.join(__dirname, '..', 'data', 'uploads');
const useSupabase = Boolean(SUPABASE_URL && KEY);

function headers(extra = {}) {
  // Legacy service_role keys are JWTs ("eyJ…") and also go in Authorization; new "sb_secret_…" keys only in apikey.
  return { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}), ...extra };
}

let bucketReady = null;
function ensureBucket() {
  bucketReady ||= fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 10 * 1024 * 1024 }),
  }).then(async (res) => {
    if (res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (/already exists/i.test(body.message || body.error || '')) return;
    throw new Error(`Could not create storage bucket "${BUCKET}": ${body.message || res.statusText}`);
  }).catch((e) => { bucketReady = null; throw e; });
  return bucketReady;
}

/** Save an image and return its public URL. */
async function saveImage(name, buf, contentType) {
  if (!useSupabase) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_DIR, name), buf);
    return `/uploads/${name}`;
  }
  await ensureBucket();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' }),
    body: buf,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Photo upload failed: ${body.message || res.statusText}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`;
}

module.exports = { saveImage, useSupabase, LOCAL_DIR };
