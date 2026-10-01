require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || '';
const databasePath = path.resolve(process.env.DATABASE_PATH || './data/site.sqlite');
const databaseDirectory = path.dirname(databasePath);
const publicPages = new Set(['index.html', 'About.html', 'Program.html', 'Contact.html', 'Donate.html', 'Admin.html']);
const roles = new Set(['Administrator', 'Editor', 'Reporter']);
const siteContentFields = {
    'home.hero.title': { label: 'Home: hero headline', defaultValue: "Healing God's Creation" },
    'home.hero.summary': { label: 'Home: hero introduction', defaultValue: 'Empowering communities in Uganda to embrace the biblical mandate of stewardship through sustainable action, education, and deep connection with the natural world.' },
    'about.hero.title': { label: 'About: page headline', defaultValue: 'Stewards of Creation' },
    'about.hero.summary': { label: 'About: introduction', defaultValue: "We are a passionate community dedicated to restoring Uganda's landscapes through faith-driven action and professional stewardship." },
    'program.hero.title': { label: 'Program: page headline', defaultValue: 'Our Program' },
    'program.hero.summary': { label: 'Program: introduction', defaultValue: 'Cultivating a sustainable future through faith-based ecological action in Uganda.' },
    'contact.hero.title': { label: 'Contact: page headline', defaultValue: 'Get in Touch' },
    'contact.hero.summary': { label: 'Contact: introduction', defaultValue: 'We are dedicated to sustainable stewardship. Reach out to us for inquiries, partnerships, or to learn more about our programs in Uganda.' },
    'donate.hero.title': { label: 'Donate: page headline', defaultValue: 'Invest in the Soil of Our Communities' },
    'donate.hero.summary': { label: 'Donate: introduction', defaultValue: 'Your contribution plants hope, sustains life, and empowers local stewardship for a greener tomorrow.' }
};

if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
}
if (isProduction && !process.env.APP_ORIGIN) {
    throw new Error('Set APP_ORIGIN to the public HTTPS origin in production.');
}

fs.mkdirSync(databaseDirectory, { recursive: true });
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('Administrator', 'Editor', 'Reporter')),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS site_content (
        content_key TEXT PRIMARY KEY,
        content_value TEXT NOT NULL,
        updated_by INTEGER NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        donor TEXT NOT NULL,
        campaign TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`);

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(session({
    name: 'creation-stewards.sid',
    secret: sessionSecret,
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: databaseDirectory }),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction,
        maxAge: 2 * 60 * 60 * 1000
    }
}));

function sameOrigin(req, res, next) {
    const origin = req.get('origin');
    const expectedOrigin = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if (!origin || origin !== expectedOrigin) {
        return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
    next();
}

function requireAuthentication(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Sign in required.' });
    const user = db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(req.session.userId);
    if (!user || !user.active) {
        return req.session.destroy(() => res.status(401).json({ error: 'Sign in required.' }));
    }
    req.user = user;
    next();
}

function requireRoles(...allowedRoles) {
    return function (req, res, next) {
        if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Your role cannot perform this action.' });
        next();
    };
}

function requiredText(value, maxLength) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function publicUpdate(update) {
    return {
        id: update.id,
        category: update.category,
        title: update.title,
        summary: update.summary,
        author: update.author,
        createdAt: update.created_at
    };
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again later.' }
});

app.post('/api/auth/login', sameOrigin, loginLimiter, async (req, res, next) => {
    try {
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        const user = db.prepare('SELECT id, name, email, password_hash, role, active FROM users WHERE email = ?').get(email);
        const matches = user && user.active ? await bcrypt.compare(password, user.password_hash) : false;
        if (!matches) return res.status(401).json({ error: 'Email or password is incorrect.' });

        req.session.regenerate((error) => {
            if (error) return next(error);
            req.session.userId = user.id;
            req.session.save((saveError) => {
                if (saveError) return next(saveError);
                res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
            });
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/auth/session', requireAuthentication, (req, res) => {
    res.json({ user: req.user });
});

app.post('/api/auth/logout', sameOrigin, requireAuthentication, (req, res, next) => {
    req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie('creation-stewards.sid', { httpOnly: true, sameSite: 'strict', secure: isProduction });
        res.status(204).end();
    });
});

app.get('/api/updates', (req, res) => {
    const updates = db.prepare(`
        SELECT updates.id, updates.category, updates.title, updates.summary, updates.created_at,
               users.name AS author
        FROM updates JOIN users ON users.id = updates.created_by
        ORDER BY updates.created_at DESC, updates.id DESC LIMIT 50
    `).all();
    res.json({ updates: updates.map(publicUpdate) });
});

app.get('/api/site-content', (req, res) => {
    const savedValues = Object.fromEntries(db.prepare('SELECT content_key, content_value FROM site_content').all()
        .map((item) => [item.content_key, item.content_value]));
    const fields = Object.entries(siteContentFields).map(([key, field]) => ({
        key,
        label: field.label,
        defaultValue: field.defaultValue,
        value: savedValues[key] ?? field.defaultValue
    }));
    res.json({ fields });
});

app.put('/api/site-content/:key', sameOrigin, requireAuthentication, requireRoles('Administrator', 'Editor'), (req, res) => {
    const field = siteContentFields[req.params.key];
    const value = req.body.value;
    if (!field) return res.status(404).json({ error: 'Page content field not found.' });
    if (!requiredText(value, 3000)) return res.status(400).json({ error: 'Enter page text up to 3,000 characters.' });
    db.prepare(`
        INSERT INTO site_content (content_key, content_value, updated_by) VALUES (?, ?, ?)
        ON CONFLICT(content_key) DO UPDATE SET content_value = excluded.content_value,
            updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
    `).run(req.params.key, value.trim(), req.user.id);
    res.json({ key: req.params.key, value: value.trim() });
});

app.post('/api/updates', sameOrigin, requireAuthentication, requireRoles('Administrator', 'Editor'), (req, res) => {
    const { category, title, summary } = req.body;
    if (!requiredText(title, 120) || !requiredText(summary, 1000) || !['Reforestation', 'Community', 'Education'].includes(category)) {
        return res.status(400).json({ error: 'Enter a title, valid category, and summary.' });
    }
    const result = db.prepare('INSERT INTO updates (category, title, summary, created_by) VALUES (?, ?, ?, ?)')
        .run(category, title.trim(), summary.trim(), req.user.id);
    const update = db.prepare(`
        SELECT updates.id, updates.category, updates.title, updates.summary, updates.created_at,
               users.name AS author
        FROM updates JOIN users ON users.id = updates.created_by WHERE updates.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json({ update: publicUpdate(update) });
});

app.patch('/api/updates/:id', sameOrigin, requireAuthentication, requireRoles('Administrator', 'Editor'), (req, res) => {
    const { category, title, summary } = req.body;
    if (!requiredText(title, 120) || !requiredText(summary, 1000) || !['Reforestation', 'Community', 'Education'].includes(category)) {
        return res.status(400).json({ error: 'Enter a title, valid category, and summary.' });
    }
    const result = db.prepare(`
        UPDATE updates SET category = ?, title = ?, summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(category, title.trim(), summary.trim(), Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Update not found.' });
    res.json({ ok: true });
});

app.delete('/api/updates/:id', sameOrigin, requireAuthentication, requireRoles('Administrator', 'Editor'), (req, res) => {
    const result = db.prepare('DELETE FROM updates WHERE id = ?').run(Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Update not found.' });
    res.status(204).end();
});

app.get('/api/users', requireAuthentication, requireRoles('Administrator'), (req, res) => {
    const users = db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY name COLLATE NOCASE').all();
    res.json({ users });
});

app.post('/api/users', sameOrigin, requireAuthentication, requireRoles('Administrator'), async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!requiredText(name, 100) || !requiredText(email, 254) || !/^\S+@\S+\.\S+$/.test(email) ||
        typeof password !== 'string' || password.length < 12 || !roles.has(role)) {
        return res.status(400).json({ error: 'Provide a name, valid email, 12-character password, and valid role.' });
    }
    try {
        const result = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
            .run(name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 12), role);
        res.status(201).json({ user: db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(result.lastInsertRowid) });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account already uses that email.' });
        throw error;
    }
});

app.patch('/api/users/:id', sameOrigin, requireAuthentication, requireRoles('Administrator'), (req, res) => {
    const userId = Number(req.params.id);
    const target = db.prepare('SELECT id, role, active FROM users WHERE id = ?').get(userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (userId === req.user.id && req.body.active === false) return res.status(400).json({ error: 'You cannot deactivate your own account.' });

    const role = req.body.role === undefined ? target.role : req.body.role;
    const active = req.body.active === undefined ? target.active : (req.body.active ? 1 : 0);
    if (!roles.has(role) || ![0, 1].includes(active)) return res.status(400).json({ error: 'Invalid role or account status.' });
    if (target.role === 'Administrator' && target.active && (role !== 'Administrator' || !active)) {
        const activeAdmins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'Administrator' AND active = 1").get().count;
        if (activeAdmins <= 1) return res.status(400).json({ error: 'Keep at least one active Administrator account.' });
    }
    db.prepare('UPDATE users SET role = ?, active = ? WHERE id = ?').run(role, active, userId);
    res.json({ user: db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(userId) });
});

app.get('/api/reports', requireAuthentication, requireRoles('Administrator', 'Reporter'), (req, res) => {
    const donations = db.prepare('SELECT id, donor, campaign, amount_cents, status, created_at FROM donations ORDER BY created_at DESC').all();
    const totals = db.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS amount_cents,
               COALESCE(SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END), 0) AS completed
        FROM donations
    `).get();
    res.json({ donations, totals });
});

app.get('/api/reports.csv', requireAuthentication, requireRoles('Administrator', 'Reporter'), (req, res) => {
    const donations = db.prepare('SELECT donor, campaign, amount_cents, status, created_at FROM donations ORDER BY created_at DESC').all();
    const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [
        ['Donor', 'Campaign', 'Amount (UGX)', 'Status', 'Date'],
        ...donations.map((donation) => [donation.donor, donation.campaign, (donation.amount_cents / 100).toFixed(2), donation.status, donation.created_at])
    ];
    res.type('text/csv').attachment('creation-stewards-donor-report.csv').send(rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n'));
});

app.get('/admin.js', (req, res) => res.sendFile(path.join(__dirname, 'admin.js')));
app.get('/public-updates.js', (req, res) => res.sendFile(path.join(__dirname, 'public-updates.js')));
app.get('/site-content.js', (req, res) => res.sendFile(path.join(__dirname, 'site-content.js')));
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

app.get(['/', '/:page'], (req, res, next) => {
    const page = req.params.page || 'index.html';
    if (!publicPages.has(page)) return next();
    res.sendFile(path.join(__dirname, page));
});

app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
});

const server = app.listen(port, () => console.log(`Creation Stewards site running at http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => {
        db.close();
        process.exit(0);
    }));
}