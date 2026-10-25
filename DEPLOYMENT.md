# Forum Web App Production Deployment Guide

This repository is the live app for the Forum Web App workflow. The NNN agreement and the chatbot are both intake paths inside this application, not separate production apps.

## 1. Architecture

Use one repo, one Neon database, and one application table.

- Direct form intake: `/`
- Chatbot intake: `/chatbot.html`
- Admin review: `/admin.html`
- Shared data source: Neon `applications` table

The workflow is:

1. Applicant submits through the form or chatbot
2. Record is saved to `applications`
3. Admin reviews the application
4. Admin verifies payment
5. Admin approves the application
6. Admin authorizes access only after both payment and approval pass

Important rule: submission does not mean approval, and approval does not mean access.

## 2. Environment variables

Use a real environment file for deployment, with values such as:

```bash
DATABASE_URL=postgres://user:password@host:5432/dbname
ADMIN_SECRET=your-admin-secret
TURNSTILE_SECRET_KEY=your-turnstile-secret
APP_BASE_URL=https://yourdomain.com
RESEND_API_KEY=your-resend-key
EMAIL_FROM=no-reply@yourdomain.com
```

This repo already includes a template at `.env.example`.

## 3. Neon database schema

Run this SQL against the live Neon database:

```sql
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  signature TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  access_status TEXT NOT NULL DEFAULT 'not_authorized',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_email
  ON applications (lower(email));

CREATE INDEX IF NOT EXISTS idx_applications_status
  ON applications (status);

CREATE INDEX IF NOT EXISTS idx_applications_payment_status
  ON applications (payment_status);

CREATE INDEX IF NOT EXISTS idx_applications_approval_status
  ON applications (approval_status);

CREATE INDEX IF NOT EXISTS idx_applications_access_status
  ON applications (access_status);
```

## 4. Required status model

Use these values as the canonical statuses:

- `submitted`
- `payment_verified`
- `approved`
- `access_authorized`
- `rejected`

Keep submission, payment, approval, and access as separate states.

## 5. Access authorization gate

Access must only be granted when both conditions are true:

- `payment_status = 'verified'`
- `approval_status = 'approved'`

Example logic:

```js
if (payment_status !== 'verified' || approval_status !== 'approved') {
  // deny access
}
```

## 6. Admin protection

Protect admin routes with a secret using either:

- `x-admin-secret`
- `Authorization: Bearer <secret>`

Protected routes include:

- `/admin.html`
- `/api/admin`
- `/api/admin/:id/approve`
- `/api/admin/:id/payment-verified`
- `/api/admin/:id/reject`
- `/api/admin/:id/authorize`

## 7. Data payload shape

The form and chatbot should both save into `applications.data` using the same pattern.

Example:

```json
{
  "source": "direct-form",
  "agreementStatus": "submitted",
  "paymentStatus": "pending",
  "approvalStatus": "pending",
  "accessStatus": "not_authorized",
  "answers": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "contact": "@janedoe",
    "budget": "$50",
    "arrangement": "Monthly",
    "paymentMethod": "Cash App",
    "agreementText": "I acknowledge that I have reviewed the agreement and agree to its terms.",
    "signDate": "2026-10-25"
  }
}
```

Or chatbot-shaped payload:

```json
{
  "source": "chatbot",
  "agreementStatus": "submitted",
  "paymentStatus": "pending",
  "approvalStatus": "pending",
  "accessStatus": "not_authorized",
  "answers": {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "agreementAcknowledgement": "I acknowledge that I have reviewed the agreement and agree to its terms.",
    "signature": "Jane Doe"
  }
}
```

## 8. Deployment checklist

Before going live:

- [ ] Real Neon database is connected
- [ ] `DATABASE_URL` is set to the production Neon URL
- [ ] `ADMIN_SECRET` is set and protected
- [ ] `TURNSTILE_SECRET_KEY` is set
- [ ] `APP_BASE_URL` is set to the live domain
- [ ] Both the form and chatbot save to the same `applications` table
- [ ] Admin route is protected with the secret
- [ ] Payment verification is separate from approval
- [ ] Access is only granted after both payment and approval pass
- [ ] Admin UI loads and can review applications
- [ ] Email notifications are configured if needed

## 9. Final rule to keep

Never allow the following to be treated as equivalent:

- submitted = approved
- approved = access authorized
- payment verified = access authorized

Access must be explicitly authorized only when both payment and approval are valid.

This is the correct final production setup for the live Forum Web App repo.
