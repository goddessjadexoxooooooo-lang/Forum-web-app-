import { neon } from '@neondatabase/serverless';

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
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
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
  const [row] = await sql`
    UPDATE applications
    SET ${sql(updateStatusToColumnName(updates))}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, name, email, data, signature, status, payment_status, approval_status, access_status, created_at, updated_at
  `;
  return row || null;
}

function updateStatusToColumnName(updates) {
  const fields = Object.entries(updates).map(([key, value]) => `${key} = ${value}`);
  return fields.join(', ');
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

  if (action === 'approve') {
    const updated = await updateStatus(id, {
      approval_status: 'approved',
      status: 'approved',
    });
    return res.json({ ok: true, application: updated });
  }

  if (action === 'payment-verified' || action === 'payment_verified') {
    const updated = await updateStatus(id, {
      payment_status: 'verified',
      status: 'payment_verified',
    });
    return res.json({ ok: true, application: updated });
  }

  if (action === 'reject') {
    const updated = await updateStatus(id, {
      approval_status: 'rejected',
      status: 'rejected',
    });
    return res.json({ ok: true, application: updated });
  }

  if (action === 'authorize' || action === 'access-authorized') {
    if (current.payment_status !== 'verified' || current.approval_status !== 'approved') {
      return res.status(400).json({
        error: 'Access can only be authorized after payment verification and approval.',
      });
    }

    const updated = await updateStatus(id, {
      access_status: 'authorized',
      status: 'access_authorized',
    });
    return res.json({ ok: true, application: updated });
  }

  return res.status(400).json({ error: 'Unknown admin action.' });
}
