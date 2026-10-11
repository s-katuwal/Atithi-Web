'use strict';
const nodemailer = require('nodemailer');
const { get, run, getSettings } = require('../db');

// Mail settings come from Admin → Settings; environment variables are used for anything left blank there.
// Resend (https://resend.com) is used when an API key is set; otherwise SMTP.
async function config() {
  const s = await getSettings();
  const pick = (key, env) => (s[key] || process.env[env] || '').trim();
  const port = Number(pick('smtp_port', 'SMTP_PORT')) || 587;
  return {
    resendKey: (s.resend_api_key || process.env.RESEND_API_KEY || '').trim(),
    host: pick('smtp_host', 'SMTP_HOST'),
    port,
    secure: port === 465,
    user: pick('smtp_user', 'SMTP_USER'),
    pass: s.smtp_pass || process.env.SMTP_PASS || '',
    from: pick('mail_from', 'MAIL_FROM') || pick('smtp_user', 'SMTP_USER'),
    fromName: pick('mail_from_name', 'MAIL_FROM_NAME') || 'Atithi Restro & Lodge',
    notify: pick('notify_email', 'NOTIFY_EMAIL'),
    siteUrl: pick('site_url', 'SITE_URL').replace(/\/+$/, ''),
  };
}
const isConfigured = (c) => Boolean(c.from && (c.resendKey || c.host));
const provider = (c) => (c.resendKey ? 'resend' : c.host ? 'smtp' : '');

async function sendViaResend(c, { to, subject, html, text, replyTo }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `"${c.fromName.replace(/["<>\r\n]/g, '')}" <${c.from}>`,
      to: to.split(',').map((x) => x.trim()).filter(Boolean),
      subject, html, text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Resend: ${body.message || res.statusText} (HTTP ${res.status})`);
  }
}

async function send({ to, subject, html, text, replyTo = '', ref = '', kind = 'other' }) {
  const c = await config();
  if (!to) return { ok: false, error: 'No email address' };
  if (!isConfigured(c)) return { ok: false, error: 'Email is not set up (Admin → Settings & email)' };
  try {
    if (c.resendKey) {
      await sendViaResend(c, { to, subject, html, text, replyTo });
    } else {
      const transport = nodemailer.createTransport({
        host: c.host, port: c.port, secure: c.secure,
        auth: c.user ? { user: c.user, pass: c.pass } : undefined,
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
      });
      await transport.sendMail({ from: { name: c.fromName, address: c.from }, to, subject, html, text, replyTo: replyTo || undefined });
    }
    await run('INSERT INTO email_log (ref, kind, recipient, subject, ok) VALUES (?,?,?,?,1)', ref, kind, to, subject);
    return { ok: true };
  } catch (e) {
    console.error(`Email "${kind}" to ${to} failed:`, e.message);
    await run('INSERT INTO email_log (ref, kind, recipient, subject, ok, error) VALUES (?,?,?,?,0,?)', ref, kind, to, subject, String(e.message).slice(0, 500));
    return { ok: false, error: e.message };
  }
}

// ---------------- Templates ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const rs = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN');
const fmtDate = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (t) => { const [h, m] = String(t).split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

async function layout({ heading, intro, rows, outro, color = '#1774BC' }) {
  const c = await config();
  const table = rows.filter(Boolean).map(([k, v]) =>
    `<tr><td style="padding:8px 0;color:#6b7785;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;color:#14212e;font-weight:600">${esc(v)}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 12px">
    <div style="background:${color};color:#fff;border-radius:14px 14px 0 0;padding:22px 26px">
      <div style="font-size:13px;opacity:.85">अतिथि देवो भवः</div>
      <div style="font-size:22px;font-weight:bold;margin-top:4px">${esc(heading)}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 14px 14px;padding:24px 26px;border:1px solid #e3e9ef;border-top:0">
      <p style="color:#14212e;font-size:15px;line-height:1.55;margin-top:0">${intro}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e3e9ef;border-bottom:1px solid #e3e9ef;margin:16px 0">${table}</table>
      <p style="color:#14212e;font-size:14px;line-height:1.55">${outro}</p>
      ${c.siteUrl ? `<p style="margin:22px 0 0"><a href="${esc(c.siteUrl)}/track" style="background:#F5A11C;color:#1d1606;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold;font-size:14px">View or manage my booking</a></p>` : ''}
    </div>
    <p style="text-align:center;color:#8a96a3;font-size:12px;margin-top:16px">Atithi Restro &amp; Lodge · Atithi Food Garden</p>
  </div></body></html>`;
  const text = [heading, '', intro.replace(/<[^>]+>/g, ''), '', ...rows.filter(Boolean).map(([k, v]) => `${k}: ${v}`), '',
    outro.replace(/<[^>]+>/g, ''), c.siteUrl ? `\nManage your booking: ${c.siteUrl}/track` : ''].join('\n');
  return { html, text };
}

const branchOf = async (id) => (await get('SELECT * FROM branches WHERE id = ?', id)) || {};
const contactLine = (b) => [b.phone && `call us on ${esc(b.phone)}`, b.email && `email ${esc(b.email)}`].filter(Boolean).join(' or ');

function bookingRows(bk, b) {
  return [
    ['Booking reference', bk.ref],
    ['Branch', `${b.name} — ${b.location}`],
    b.address && ['Address', b.address],
    ['Room', `${bk.rooms} × ${bk.room_name}`],
    ['Check-in', `${fmtDate(bk.check_in)} (from ${fmtTime(b.checkin_time || '12:00')})`],
    ['Check-out', `${fmtDate(bk.check_out)} (by ${fmtTime(b.checkout_time || '11:00')})`],
    ['Nights', String(bk.nights)],
    ['Guests', `${bk.adults} adult(s)${bk.children ? `, ${bk.children} child(ren)` : ''}`],
    ['Total (pay at branch)', rs(bk.total)],
  ];
}
function reservationRows(r, b) {
  return [
    ['Reservation reference', r.ref],
    ['Branch', `${b.name} — ${b.location}`],
    b.address && ['Address', b.address],
    ['Date', fmtDate(r.date)],
    ['Time', fmtTime(r.time)],
    ['Guests', String(r.guests)],
    r.seating && ['Seating', r.seating],
    r.occasion && ['Occasion', r.occasion],
  ];
}

const TEMPLATES = {
  received: (x, b, isRoom) => ({
    subject: `We received your ${isRoom ? 'booking' : 'reservation'} ${x.ref} — ${b.name}, ${b.location}`,
    heading: `${isRoom ? 'Booking' : 'Reservation'} received`,
    intro: `Namaste ${esc(isRoom ? x.guest_name : x.name)},<br>Thank you for choosing ${esc(b.name)}. We have received your request. It is <strong>waiting for confirmation</strong> from our team.`,
    outro: `You will get another email as soon as we confirm it. Questions? ${contactLine(b) || 'Reply to this email.'}`,
  }),
  confirmed: (x, b, isRoom) => ({
    subject: `Confirmed: your ${isRoom ? 'booking' : 'reservation'} ${x.ref} at ${b.name}, ${b.location}`,
    heading: `Your ${isRoom ? 'booking' : 'reservation'} is confirmed ✓`,
    intro: `Namaste ${esc(isRoom ? x.guest_name : x.name)},<br>Good news: your ${isRoom ? 'stay' : 'table'} is <strong>confirmed</strong>. We look forward to welcoming you.`,
    outro: `${isRoom ? 'No advance payment is needed. Pay at the branch by cash, eSewa, Khalti or Fonepay. ' : ''}Please show your reference on arrival. Need to change anything? ${contactLine(b) || 'Reply to this email.'}`,
    color: '#1d8a4e',
  }),
  cancelled: (x, b, isRoom) => ({
    subject: `Cancelled: your ${isRoom ? 'booking' : 'reservation'} ${x.ref} — ${b.name}, ${b.location}`,
    heading: `${isRoom ? 'Booking' : 'Reservation'} cancelled`,
    intro: `Namaste ${esc(isRoom ? x.guest_name : x.name)},<br>Your ${isRoom ? 'booking' : 'reservation'} below has been <strong>cancelled</strong>.`,
    outro: `If this is a mistake or you would like to book again, ${contactLine(b) || 'reply to this email'}.`,
    color: '#b23b3b',
  }),
};

/** Email the guest about a room booking or table reservation. kind: received | confirmed | cancelled */
async function notifyGuest(kind, x, isRoom) {
  if (!x.email) return { ok: false, error: 'Guest did not give an email address' };
  const b = await branchOf(x.branch_id);
  const t = TEMPLATES[kind](x, b, isRoom);
  const { html, text } = await layout({ ...t, rows: isRoom ? bookingRows(x, b) : reservationRows(x, b) });
  return send({ to: x.email, subject: t.subject, html, text, replyTo: b.email, ref: x.ref, kind });
}

/** Tell staff about a new online booking or reservation. */
async function notifyStaff(x, isRoom) {
  const c = await config();
  const b = await branchOf(x.branch_id);
  const to = [c.notify, b.email].filter(Boolean).join(', ');
  if (!to) return { ok: false, error: 'No staff email set' };
  const name = isRoom ? x.guest_name : x.name;
  const { html, text } = await layout({
    heading: `New ${isRoom ? 'room booking' : 'table reservation'} — ${b.location}`,
    intro: `${esc(name)} (${esc(x.phone)}${x.email ? `, ${esc(x.email)}` : ''}) made a new request on the website. Please confirm it in the admin panel.`,
    rows: isRoom ? bookingRows(x, b) : reservationRows(x, b),
    outro: (isRoom ? x.special_requests : x.notes) ? `Notes from guest: ${esc(isRoom ? x.special_requests : x.notes)}` : '',
  });
  return send({ to, subject: `New ${isRoom ? 'booking' : 'reservation'} ${x.ref} — ${name}`, html, text, replyTo: x.email, ref: x.ref, kind: 'staff_alert' });
}

/** Send several emails; a failed email never breaks the request that triggered it.
 * (Awaited rather than fire-and-forget: on Vercel, work left running after the response may be stopped.) */
const sendAll = (...promises) => Promise.all(promises.map((p) => p.catch((e) => console.error('Email error:', e))));

module.exports = { config, isConfigured, provider, send, notifyGuest, notifyStaff, sendAll, layout };
