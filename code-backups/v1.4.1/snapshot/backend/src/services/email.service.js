'use strict';

/**
 * EMAIL SERVICE
 *
 * Transactional email for PaySick.
 * Uses nodemailer in production (configure SMTP_* env vars).
 * In development, logs a preview URL via Ethereal test accounts.
 * Degrades gracefully if nodemailer is not yet installed.
 */

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (_) {
  nodemailer = null;
}

const APP_URL    = process.env.APP_URL   || 'http://localhost:3000';
const FROM_NAME  = process.env.SMTP_FROM_NAME || 'PaySick';
const FROM_ADDR  = process.env.SMTP_FROM      || 'noreply@paysick.co.za';
const FROM       = `"${FROM_NAME}" <${FROM_ADDR}>`;

// ─────────────────────────────────────────────
// Transport factory
// ─────────────────────────────────────────────

function buildProductionTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function buildDevTransport() {
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
}

// ─────────────────────────────────────────────
// Shared HTML wrapper
// ─────────────────────────────────────────────

function emailWrapper(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:40px 20px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#FF4757;border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
            Pay<span style="color:#FFB3BA;">Sick</span>
          </h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Healthcare Payment Platform</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:40px;border:1px solid #EEEEEE;border-top:none;border-radius:0 0 12px 12px;">
          ${bodyHtml}
          <hr style="border:none;border-top:1px solid #F0F0F0;margin:28px 0 20px;">
          <p style="margin:0;color:#AAAAAA;font-size:12px;line-height:1.6;text-align:center;">
            PaySick (Pty) Ltd &mdash; hello@paysick.co.za<br>
            This is an automated message. Please do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// Core send helper
// ─────────────────────────────────────────────

async function sendMail({ to, subject, html }) {
  if (!nodemailer) {
    // nodemailer not installed — log to console for development
    console.warn(`[Email] nodemailer not installed. Would send to ${to}: "${subject}"`);
    console.warn(`[Email] Run: cd backend && npm install`);
    return null;
  }

  let transport;
  if (process.env.SMTP_HOST) {
    transport = buildProductionTransport();
  } else {
    transport = await buildDevTransport();
  }

  const info = await transport.sendMail({ from: FROM, to, subject, html });

  if (!process.env.SMTP_HOST && nodemailer.getTestMessageUrl) {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`[Email] Sent to ${to}: "${subject}"`);
    console.log(`[Email] Preview: ${previewUrl}`);
  }

  return info;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Send email verification link to a newly registered user.
 */
async function sendVerificationEmail(to, fullName, rawToken) {
  const verifyUrl = `${APP_URL}/verify-email.html?token=${rawToken}`;
  const firstName = fullName.split(' ')[0];

  const body = `
    <h2 style="margin:0 0 16px;color:#1A1A1A;font-size:22px;font-weight:700;">Verify your email address</h2>
    <p style="margin:0 0 12px;color:#4A4A4A;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
    <p style="margin:0 0 24px;color:#4A4A4A;font-size:15px;line-height:1.6;">
      Welcome to PaySick. To activate your account and access our healthcare payment platform,
      please verify your email address by clicking the button below.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${verifyUrl}"
         style="display:inline-block;background:#FF4757;color:#ffffff;text-decoration:none;
                font-size:15px;font-weight:600;padding:15px 40px;border-radius:8px;">
        Verify Email Address
      </a>
    </div>
    <p style="margin:24px 0 8px;color:#8A8A8A;font-size:13px;line-height:1.6;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;word-break:break-all;">
      <a href="${verifyUrl}" style="color:#FF4757;font-size:13px;">${verifyUrl}</a>
    </p>
    <p style="margin:0;color:#AAAAAA;font-size:12px;line-height:1.6;">
      This link expires in 24 hours. If you didn't create a PaySick account, you can safely ignore
      this email — your account will remain inactive.
    </p>`;

  return sendMail({
    to,
    subject: 'Verify your PaySick email address',
    html: emailWrapper(body),
  });
}

module.exports = { sendVerificationEmail };
