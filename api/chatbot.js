import { neon } from '@neondatabase/serverless';
import { verifyCaptcha } from './captcha.js';

const sql = neon(process.env.DATABASE_URL);

const MAX_FIELD_LENGTH = 5000;
const MAX_SIGNATURE_LENGTH = 1_500_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).slice(0, 50);
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeAnswers(value) {
  if (!value || typeof value !== 'object') return {};
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof key === 'string' && key.length <= 64) {
      result[key] = clean(String(item));
    }
  }
  return result;
}

async function findExistingApplicationByEmail(email) {
  const [row] = await sql`
    SELECT id
    FROM applications
    WHERE lower(email) = lower(${email})
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return row || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { applicationId, source = 'direct-form', captchaToken, signature, ...fields } = body;

  const forwardedFor = req.headers['x-forwarded-for'];
  const remoteIp = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : undefined;
  if (!(await verifyCaptcha(captchaToken, remoteIp))) {
    return res.status(400).json({ error: 'Captcha check failed. Please try again.' });
  }

  const mergedAnswers = { ...normalizeAnswers(fields.answers || {}), ...normalizeAnswers(fields.data || {}), ...normalizeAnswers(fields) };
  const name = clean(fields.name || fields.fullName || '');
  const email = clean(fields.email || '');

  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'A valid email is required' });

  const signatureValue =
    typeof signature === 'string' &&
    signature.startsWith('data:image/png;base64,') &&
    signature.length <= MAX_SIGNATURE_LENGTH
      ? signature
      : null;

  if (!signatureValue) return res.status(400).json({ error: 'A signature is required' });

  const payload = {
    source: clean(source),
    agreementStatus: clean(fields.agreementStatus || 'submitted'),
    paymentStatus: clean(fields.paymentStatus || 'pending'),
    approvalStatus: clean(fields.approvalStatus || 'pending'),
    accessStatus: clean(fields.accessStatus || 'not_authorized'),
    ...mergedAnswers,
  };

  try {
    const existing = applicationId ? null : await findExistingApplicationByEmail(email);
    const targetId = applicationId || existing?.id || null;

    if (targetId) {
      const [row] = await sql`
        UPDATE applications
        SET name = ${name},
            email = ${email},
            data = ${JSON.stringify(payload)}::jsonb,
            signature = ${signatureValue},
            updated_at = NOW()
        WHERE id = ${targetId}
        RETURNING id
      `;

      return res.status(200).json({ id: row.id, updated: true, source: clean(source) });
    }

    const [row] = await sql`
      INSERT INTO applications (name, email, data, signature)
      VALUES (${name}, ${email}, ${JSON.stringify(payload)}::jsonb, ${signatureValue})
      RETURNING id
    `;

    return res.status(201).json({ id: row.id, created: true, source: clean(source) });
  } catch (error) {
    console.error('Failed to save application:', error);
    return res.status(500).json({ error: 'Could not save application' });
  }
}
