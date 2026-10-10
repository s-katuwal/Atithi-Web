'use strict';
const path = require('path');
const express = require('express');
require('./db'); // creates tables, seeds data and the first admin account

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
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
app.use(express.static(PUBLIC, { extensions: ['html'], maxAge: '1h' }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, '404.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Atithi website running → http://localhost:${PORT}`);
  console.log(`Admin panel            → http://localhost:${PORT}/admin`);
});
