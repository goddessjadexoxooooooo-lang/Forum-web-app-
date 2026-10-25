import { neon } from '@neondatabase/serverless';
import { sendStatusEmail } from './email.js';

const sql = neon(process.env.DATABASE_URL);

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function requireAdmin(req) {
  if (!ADMIN_SECRET) return true;
  const header = req.headers['x-admin-secret'] || req.headers.authorization;
  const token = typeof header === 'string'
    ? header.replace(/^Bearer\s+/i, '').trim()
    : '';
  return token === ADMIN_SECRET;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function getList() {
  return sql`
    SELECT id, name, email, data, signature, status, payment_status, approval_status, access_status, created_at, updated_at
    FROM applications
    ORDER BY created_at DESC
    LIMIT 100
  `;
}

async function getOne(id) {
  const [row] = await sql`
    SELECT id, name, email, data, signature, status, payment_status, approval_status, access_status, created_at, updated_at
    FROM applications
    WHERE id = ${id}
    LIMIT 1
  `;
  return row || null;
}

async function updateStatus(id, updates) {
  const payload = {
    status: updates.status ?? 'submitted',
    payment_status: updates.payment_status ?? 'pending',
    approval_status: updates.approval_status ?? 'pending',
    access_status: updates.access_status ?? 'not_authorized',
  };

  const [row] = await sql`
    UPDATE applications
    SET status = ${payload.status},
        payment_status = ${payload.payment_status},
        approval_status = ${payload.approval_status},
        access_status = ${payload.access_status},
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, name, email, data, signature, status, payment_status, approval_status, access_status, created_at, updated_at
  `;

  return row || null;
}

async function notifyStatusChange(app, action) {
  if (!app || !app.email) return;

  const messages = {
    approve: {
      status: 'approved',
      message: 'Your application has been approved. Payment verification and review are complete.',
    },
    'payment-verified': {
      status: 'payment_verified',
      message: 'Your payment has been verified. We are finalizing the review of your application.',
    },
    reject: {
      status: 'rejected',
      message: 'Your application was not approved at this time. Please contact support for more information.',
    },
    authorize: {
      status: 'access_authorized',
      message: 'Your access has been authorized. Your app link is now available.',
    },
  };

  const config = messages[action];
  if (!config) return;

  try {
    await sendStatusEmail({
      email: app.email,
      name: app.name || 'Applicant',
      status: config.status,
      message: config.message,
    });
  } catch (error) {
    console.error(`Email send failed for ${action}:`, error);
  }
}

export default async function handler(req, res) {
  if (!requireAdmin(req)) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const pathParts = pathname.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    if (!pathParts.length) {
      const rows = await getList();
      return res.json(rows);
    }

    const application = await getOne(pathParts[0]);
    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    return res.json(application);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await readBody(req).catch(() => ({}));
  const id = pathParts[0];
  const action = pathParts[1] || normalizeStatus(body.action || body.type || '');

  if (!id) {
    return res.status(400).json({ error: 'Application id is required.' });
  }

  const current = await getOne(id);
  if (!current) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  let updated;

  if (action === 'approve') {
    updated = await updateStatus(id, {
      approval_status: 'approved',
      payment_status: current.payment_status || 'pending',
      access_status: 'not_authorized',
      status: 'approved',
    });
    await notifyStatusChange(updated || current, 'approve');
    return res.json({ ok: true, application: updated });
  }

  if (action === 'payment-verified' || action === 'payment_verified') {
    updated = await updateStatus(id, {
      payment_status: 'verified',
      approval_status: current.approval_status || 'pending',
      access_status: 'not_authorized',
      status: 'payment_verified',
    });
    await notifyStatusChange(updated || current, 'payment-verified');
    return res.json({ ok: true, application: updated });
  }

  if (action === 'reject') {
    updated = await updateStatus(id, {
      approval_status: 'rejected',
      payment_status: current.payment_status || 'pending',
      access_status: 'not_authorized',
      status: 'rejected',
    });
    await notifyStatusChange(updated || current, 'reject');
    return res.json({ ok: true, application: updated });
  }

  if (action === 'authorize' || action === 'access-authorized') {
    if (current.payment_status !== 'verified' || current.approval_status !== 'approved') {
      return res.status(400).json({
        error: 'Access can only be authorized after payment verification and approval.',
      });
    }

    updated = await updateStatus(id, {
      access_status: 'authorized',
      payment_status: 'verified',
      approval_status: 'approved',
      status: 'access_authorized',
    });
    await notifyStatusChange(updated || current, 'authorize');
    return res.json({ ok: true, application: updated });
  }

  return res.status(400).json({ error: 'Unknown admin action.' });
}
