'use strict';
const path = require('path');
const express = require('express');
const { ready } = require('./db');
const storage = require('./lib/storage');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', process.env.VERCEL ? true : 'loopback'); // real visitor IP for rate limiting
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/public'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Friendly URLs: /branches/laxmipur → branch page
app.get('/branches/:id', (req, res) => res.sendFile(path.join(PUBLIC, 'branch.html')));
// Photos uploaded while Supabase Storage is not set up (local testing only).
if (!storage.useSupabase) app.use('/uploads', express.static(storage.LOCAL_DIR, { maxAge: '30d', immutable: true, index: false }));
// On Vercel, files in public/ are served by its CDN and express.static is ignored; this is for local runs.
app.use(express.static(PUBLIC, { extensions: ['html'], maxAge: '1h' }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, '404.html'), (err) => { if (err) res.end('Page not found'); }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  if (res.headersSent) return;
  res.status(status).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
});

// Vercel imports the app and runs it as a function; everywhere else, start a normal server.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Atithi website running → http://localhost:${PORT}`);
    console.log(`Admin panel            → http://localhost:${PORT}/admin`);
    ready().then(() => console.log('Connected to the database.')).catch(() => { /* logged in db.js; retried on next request */ });
  });
}

module.exports = app;
