import { neon } from '@neondatabase/serverless';

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
  const normalized = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof key === 'string' && key.length <= 64) {
      normalized[key] = clean(String(item));
    }
  }
  return normalized;
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

  const { applicationId, source = 'chatbot', name, email, signature, answers, agreementStatus, paymentStatus, approvalStatus, accessStatus } = body;
  const applicantName = clean(name || body.fullName || '');
  const applicantEmail = clean(email || '');

  if (!applicantName) return res.status(400).json({ error: 'Name is required' });
  if (!EMAIL_PATTERN.test(applicantEmail)) return res.status(400).json({ error: 'A valid email is required' });

  const signatureValue =
    typeof signature === 'string' &&
    signature.startsWith('data:image/png;base64,') &&
    signature.length <= MAX_SIGNATURE_LENGTH
      ? signature
      : null;

  if (!signatureValue) return res.status(400).json({ error: 'A signature is required' });

  const payload = {
    source: clean(source),
    agreementStatus: clean(agreementStatus || 'submitted'),
    paymentStatus: clean(paymentStatus || 'pending'),
    approvalStatus: clean(approvalStatus || 'pending'),
    accessStatus: clean(accessStatus || 'not_authorized'),
    ...normalizeAnswers(answers || {}),
  };

  try {
    const existing = applicationId ? null : await findExistingApplicationByEmail(applicantEmail);
    const targetId = applicationId || existing?.id || null;

    if (targetId) {
      const [row] = await sql`
        UPDATE applications
        SET name = ${applicantName},
            email = ${applicantEmail},
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
      VALUES (${applicantName}, ${applicantEmail}, ${JSON.stringify(payload)}::jsonb, ${signatureValue})
      RETURNING id
    `;

    return res.status(201).json({ id: row.id, created: true, source: clean(source) });
  } catch (error) {
    console.error('Failed to save chatbot submission:', error);
    return res.status(500).json({ error: 'Could not save chatbot application' });
  }
}
