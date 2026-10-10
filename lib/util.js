'use strict';
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}
const bad = (msg) => new HttpError(400, msg);

// ---------- Dates (all business dates are in Nepal time) ----------
const TZ = 'Asia/Kathmandu';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function nowTime() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}
function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

// ---------- Input validation ----------
function str(v, { field = 'Field', max = 200, required = false } = {}) {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw bad(`${field} is required`);
  if (s.length > max) throw bad(`${field} is too long (max ${max} characters)`);
  return s;
}
function int(v, { field = 'Value', min = 0, max = 1e9, required = true } = {}) {
  if (v === '' || v == null) {
    if (required) throw bad(`${field} is required`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${field} must be a whole number between ${min} and ${max}`);
  return n;
}
function phone(v) {
  const s = str(v, { field: 'Phone number', max: 20, required: true });
  if (!/^\+?[0-9][0-9\s-]{6,17}$/.test(s)) throw bad('Please enter a valid phone number');
  return s;
}
function email(v) {
  const s = str(v, { field: 'Email', max: 120 });
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad('Please enter a valid email address');
  return s;
}
function time(v, field = 'Time') {
  const s = str(v, { field, max: 5, required: true });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw bad(`${field} must be in HH:MM format`);
  return s;
}
function oneOf(v, list, field) {
  if (!list.includes(v)) throw bad(`Invalid ${field}`);
  return v;
}
// Compare phone numbers by their last 10 digits so "+977 98..." matches "98...".
const phoneKey = (s) => String(s || '').replace(/\D/g, '').slice(-10);

// ---------- Booking reference, e.g. BK-LX-7K3P9Q ----------
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/O/1/I
function makeRef(prefix, code) {
  let r = '';
  for (const b of crypto.randomBytes(6)) r += REF_ALPHABET[b % 32];
  return `${prefix}-${code}-${r}`;
}

// ---------- Simple in-memory rate limiter ----------
function rateLimit({ max, windowMs }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Too many requests. Please try again in a few minutes.' });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    if (hits.size > 5000) hits.clear();
    next();
  };
}

module.exports = {
  HttpError, bad, today, nowTime, isDate, addDays, diffDays,
  str, int, phone, email, time, oneOf, phoneKey, makeRef, rateLimit,
};
