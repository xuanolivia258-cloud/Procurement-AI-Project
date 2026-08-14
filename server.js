'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_HOURS = Math.max(1, Number(process.env.SESSION_HOURS) || 8);
const SESSION_COOKIE = 'cari_session';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'cari.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_priority TEXT,
    ceg TEXT,
    requestor TEXT,
    bu TEXT,
    request_date TEXT,
    budget REAL CHECK (budget IS NULL OR budget >= 0),
    description TEXT,
    supplier_name TEXT,
    supplier_type TEXT,
    procurement_strategy TEXT,
    procurement_status TEXT,
    ec_form TEXT,
    pr_approved_date TEXT,
    po_release_date TEXT,
    estimated_closing_date TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS legacy_imports (
    import_id TEXT PRIMARY KEY,
    imported_by INTEGER NOT NULL REFERENCES users(id),
    project_count INTEGER NOT NULL,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
`);

function seedAdmin() {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (existing > 0) return;

  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) {
    throw new Error('Empty database: set ADMIN_EMAIL and ADMIN_PASSWORD before starting the server.');
  }
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must contain at least 10 characters.');

  db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
    .run(email, bcrypt.hashSync(password, 12), 'admin');
}

seedAdmin();
db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());

const PROJECT_FIELDS = {
  projectPriority: 'project_priority',
  ceg: 'ceg',
  requestor: 'requestor',
  bu: 'bu',
  requestDate: 'request_date',
  budget: 'budget',
  description: 'description',
  supplierName: 'supplier_name',
  supplierType: 'supplier_type',
  procurementStrategy: 'procurement_strategy',
  procurementStatus: 'procurement_status',
  ecForm: 'ec_form',
  prApprovedDate: 'pr_approved_date',
  poReleaseDate: 'po_release_date',
  estimatedClosingDate: 'estimated_closing_date'
};
const DATE_FIELDS = new Set(['requestDate', 'prApprovedDate', 'poReleaseDate', 'estimatedClosingDate']);
const ALLOWED_VALUES = {
  projectPriority: new Set(['Normal', 'Medium', 'High']),
  supplierType: new Set(['Payment Only', 'Simplified', 'Sporadic', 'Official']),
  procurementStrategy: new Set(['Negotiation', 'Cost Comparison', 'Bidding']),
  procurementStatus: new Set(['Sourcing', 'Qualification', 'Supplier Selection', 'Contract Review', 'PO Release']),
  ecForm: new Set(['Y', 'N'])
};

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? [part, ''] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  }));
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function authRequired(req, res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  const session = db.prepare(`
    SELECT users.id, users.email, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashToken(token), new Date().toISOString());
  if (!session) return res.status(401).json({ error: 'Session expired.' });
  req.user = session;
  req.sessionTokenHash = hashToken(token);
  next();
}

function sameOriginRequired(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
    return res.status(403).json({ error: 'Cross-origin request rejected.' });
  }
  next();
}

function normalizeProject(input) {
  const project = {};
  for (const key of Object.keys(PROJECT_FIELDS)) {
    const raw = input?.[key];
    if (key === 'budget') {
      if (raw === '' || raw === null || raw === undefined) project[key] = null;
      else {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) throw new Error('Budget must be a non-negative number.');
        project[key] = value;
      }
      continue;
    }
    const value = raw === null || raw === undefined ? '' : String(raw).trim();
    if (DATE_FIELDS.has(key) && value) {
      const date = new Date(`${value}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new Error(`Invalid date for ${key}.`);
      }
    }
    if (ALLOWED_VALUES[key] && value && !ALLOWED_VALUES[key].has(value)) throw new Error(`Invalid value for ${key}.`);
    project[key] = value || null;
  }
  return project;
}

function serializeProject(row) {
  const project = { id: row.id };
  for (const [key, column] of Object.entries(PROJECT_FIELDS)) {
    project[key] = row[column] === null ? '' : row[column];
  }
  project.createdAt = row.created_at;
  project.updatedAt = row.updated_at;
  return project;
}

const columns = Object.values(PROJECT_FIELDS);
const insertProject = db.prepare(`
  INSERT INTO projects (${columns.join(', ')}, created_by)
  VALUES (${columns.map(() => '?').join(', ')}, ?)
`);
const updateProject = db.prepare(`
  UPDATE projects SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use('/api', sameOriginRequired);

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), user.id, expires.toISOString());
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires,
    path: '/'
  });
  res.json({ user: { id: user.id, email: user.email, role: user.role } });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', authRequired, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.status(204).end();
});

app.get('/api/projects', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC, id DESC').all();
  res.json({ projects: rows.map(serializeProject) });
});

app.post('/api/projects', authRequired, (req, res) => {
  try {
    const project = normalizeProject(req.body);
    const result = insertProject.run(...Object.keys(PROJECT_FIELDS).map((key) => project[key]), req.user.id);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ project: serializeProject(row) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/projects/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid project ID.' });
  if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(id)) return res.status(404).json({ error: 'Project not found.' });
  try {
    const project = normalizeProject(req.body);
    updateProject.run(...Object.keys(PROJECT_FIELDS).map((key) => project[key]), id);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.json({ project: serializeProject(row) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/projects/import', authRequired, (req, res) => {
  const importId = String(req.body?.importId || '').trim();
  const items = req.body?.projects;
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(importId) || !Array.isArray(items) || items.length > 1000) {
    return res.status(400).json({ error: 'Invalid import request.' });
  }
  try {
    const imported = db.transaction(() => {
      const previous = db.prepare('SELECT project_count FROM legacy_imports WHERE import_id = ?').get(importId);
      if (previous) return previous.project_count;
      for (const item of items) {
        const project = normalizeProject(item);
        insertProject.run(...Object.keys(PROJECT_FIELDS).map((key) => project[key]), req.user.id);
      }
      db.prepare('INSERT INTO legacy_imports (import_id, imported_by, project_count) VALUES (?, ?, ?)')
        .run(importId, req.user.id, items.length);
      return items.length;
    })();
    res.json({ imported });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(ROOT, 'styles.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(ROOT, 'script.js')));
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

app.listen(PORT, () => {
  console.log(`CARI Procurement Tracker running at http://localhost:${PORT}`);
});
