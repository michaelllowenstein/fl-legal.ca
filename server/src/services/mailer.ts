/**
 * services/mailer.ts
 *
 * All outgoing email for fl-legal.ca — sent via the Resend HTTPS API.
 * Includes detailed diagnostic logging for Vercel function logs.
 */

import { Resend } from 'resend';
import { config } from '../config';

// ── Initialise Resend client ─────────────────────────────────────────────────

const RESEND_KEY = config.email.apiKey ?? '';

console.log('[mailer] ──────────────────────────────────────────────');
console.log('[mailer] Initialising Resend email service');
console.log('[mailer]   NODE_ENV:         ', config.nodeEnv);
console.log('[mailer]   apiKey present:   ', !!RESEND_KEY);
console.log('[mailer]   apiKey prefix:    ', RESEND_KEY ? RESEND_KEY.slice(0, 6) + '...' : '(empty)');
console.log('[mailer]   apiKey length:    ', RESEND_KEY.length);
console.log('[mailer]   fromEmail:        ', config.email.fromEmail);
console.log('[mailer]   fromName:         ', config.email.fromName);
console.log('[mailer]   firmEmail:        ', config.email.firmEmail);
console.log('[mailer]   replyTo:          ', config.email.replyTo || '(not set)');
console.log('[mailer]   testRecipient:    ', config.email.testRecipient || '(not set — real addresses)');
console.log('[mailer] ──────────────────────────────────────────────');

if (!RESEND_KEY) {
  console.error('[mailer] ⚠ RESEND_API_KEY is empty — all sends will fail');
}

const resend = new Resend(RESEND_KEY);

// ── Public payload interfaces ────────────────────────────────────────────────

export interface GeneralInquiryPayload {
  name:    string;
  email:   string;
  phone?:  string;
  message: string;
}

export interface PriorityInquiryPayload extends GeneralInquiryPayload {
  practiceArea?: string;
}

export interface ContentEditPayload {
  key:       string;
  value:     string;
  editor?:   string;
}

export interface CalcConfigEditPayload {
  summary:   string;
  changes?:  string[];
  editor?:   string;
}

// ── Email HTML shell ─────────────────────────────────────────────────────────

function baseHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body  { margin:0; padding:0; background:#f5f0e8; font-family:'Georgia',serif; color:#0f2235; }
    .wrap { max-width:600px; margin:32px auto; background:#fff; border-radius:12px;
            overflow:hidden; box-shadow:0 4px 24px rgba(15,34,53,.12); }
    .hdr  { background:#1a3a5c; padding:28px 32px; }
    .hdr h1 { margin:0; color:#b8932a; font-size:20px; font-weight:600; letter-spacing:.03em; }
    .hdr p  { margin:4px 0 0; color:rgba(255,255,255,.5); font-size:11px;
              text-transform:uppercase; letter-spacing:.1em; font-family:sans-serif; }
    .body { padding:32px; }
    .body h2 { margin:0 0 16px; font-size:18px; color:#1a3a5c; }
    table.fields { width:100%; border-collapse:collapse; margin:16px 0; }
    table.fields td { padding:8px 12px; font-size:14px; vertical-align:top; }
    table.fields tr:nth-child(odd) td { background:#f5f0e8; border-radius:4px; }
    table.fields td.label { width:130px; font-family:sans-serif; font-size:11px;
                            text-transform:uppercase; letter-spacing:.08em; color:#888;
                            font-weight:600; padding-top:10px; }
    .msg  { background:#f5f0e8; border-left:4px solid #b8932a; padding:16px;
            border-radius:0 8px 8px 0; font-size:14px; line-height:1.7; margin:16px 0; }
    .ftr  { background:#0f2235; padding:18px 32px; text-align:center;
            font-family:sans-serif; font-size:11px; color:rgba(255,255,255,.35); }
    .badge { display:inline-block; background:#b8932a; color:#0f2235; font-family:sans-serif;
             font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.1em;
             padding:3px 10px; border-radius:999px; margin-bottom:12px; }
    .change-list { margin:12px 0; padding:0; list-style:none; }
    .change-list li { padding:6px 10px; font-size:13px; font-family:sans-serif; color:#374151;
                      border-left:3px solid #b8932a; margin-bottom:6px; background:#f5f0e8;
                      border-radius:0 6px 6px 0; }
    .mono { font-family:'Courier New',monospace; font-size:12px; color:#6b7280;
            background:#f5f0e8; padding:2px 6px; border-radius:4px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>Fric, Lowenstein &amp; Co. LLP</h1>
      <p>Barristers &amp; Solicitors \u2014 Calgary, Alberta</p>
    </div>
    <div class="body">${body}</div>
    <div class="ftr">&copy; ${new Date().getFullYear()} Fric, Lowenstein &amp; Co. LLP. All rights reserved.</div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  1. INQUIRY EMAILS
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendGeneralInquiry(data: GeneralInquiryPayload): Promise<void> {
  console.log('[mailer] sendGeneralInquiry called', { name: data.name, email: data.email });

  const subject = `Appointment Request \u2014 ${data.name}`;

  const html = baseHtml(`
    <h2>New Appointment Request</h2>
    <table class="fields">
      <tr><td class="label">Name</td><td>${esc(data.name)}</td></tr>
      <tr><td class="label">Email</td><td><a href="mailto:${esc(data.email)}">${esc(data.email)}</a></td></tr>
      ${data.phone ? `<tr><td class="label">Phone</td><td>${esc(data.phone)}</td></tr>` : ''}
    </table>
    <p style="font-family:sans-serif;font-size:12px;color:#888;margin:0 0 6px">Message:</p>
    <div class="msg">${esc(data.message).replace(/\n/g, '<br>')}</div>
  `);

  const text =
    `New Appointment Request\n\n` +
    `Name:    ${data.name}\n` +
    `Email:   ${data.email}\n` +
    (data.phone ? `Phone:   ${data.phone}\n` : '') +
    `\nMessage:\n${data.message}`;

  await send({ subject, html, text, replyTo: data.email });
  await sendClientConfirmation(data.name, data.email);
}

export async function sendPriorityInquiry(data: PriorityInquiryPayload): Promise<void> {
  console.log('[mailer] sendPriorityInquiry called', {
    name: data.name,
    email: data.email,
    practiceArea: data.practiceArea ?? '(none)',
  });

  const areaLabel = data.practiceArea ? ` [${data.practiceArea}]` : '';
  const subject   = `\u2605 PRIORITY INQUIRY${areaLabel} \u2014 ${data.name}`;

  const html = baseHtml(`
    <div class="badge">\u2605 Priority Inquiry${data.practiceArea ? ' \u2014 ' + esc(data.practiceArea) : ''}</div>
    <h2>Urgent Client Inquiry</h2>
    <p style="font-family:sans-serif;font-size:13px;color:#555;margin:0 0 16px">
      This inquiry has been marked <strong>priority</strong> and requires prompt attention.
    </p>
    <table class="fields">
      <tr><td class="label">Name</td><td>${esc(data.name)}</td></tr>
      <tr><td class="label">Email</td><td><a href="mailto:${esc(data.email)}">${esc(data.email)}</a></td></tr>
      ${data.phone ? `<tr><td class="label">Phone</td><td>${esc(data.phone)}</td></tr>` : ''}
      ${data.practiceArea ? `<tr><td class="label">Matter</td><td>${esc(data.practiceArea)}</td></tr>` : ''}
    </table>
    <p style="font-family:sans-serif;font-size:12px;color:#888;margin:0 0 6px">Message:</p>
    <div class="msg">${esc(data.message).replace(/\n/g, '<br>')}</div>
  `);

  const text =
    `\u2605 PRIORITY INQUIRY${areaLabel}\n\n` +
    `Name:    ${data.name}\n` +
    `Email:   ${data.email}\n` +
    (data.phone ? `Phone:   ${data.phone}\n` : '') +
    (data.practiceArea ? `Matter:  ${data.practiceArea}\n` : '') +
    `\nMessage:\n${data.message}`;

  await send({ subject, html, text, replyTo: data.email });
  await sendClientConfirmation(data.name, data.email);
}

async function sendClientConfirmation(name: string, toEmail: string): Promise<void> {
  console.log('[mailer] sendClientConfirmation called', { name, toEmail });

  const firstName = name.split(' ')[0];
  const subject   = `We\u2019ve received your inquiry \u2014 Fric, Lowenstein & Co.`;

  const html = baseHtml(`
    <h2>Thank you, ${esc(firstName)}.</h2>
    <p style="font-size:15px;line-height:1.7">
      We have received your inquiry and a member of our team will be in touch
      with you within one business day.
    </p>
    <p style="font-size:15px;line-height:1.7">
      If your matter is urgent, please call us directly at
      <a href="tel:+14032912594" style="color:#1a3a5c">(403) 291-2594</a>.
    </p>
    <p style="font-size:13px;color:#888;margin-top:24px">
      Office hours: Monday \u2013 Friday, 8:30 AM \u2013 5:00 PM (Mountain Time)
    </p>
  `);

  const text =
    `Thank you, ${firstName}.\n\n` +
    `We have received your inquiry and will be in touch within one business day.\n\n` +
    `For urgent matters, call: (403) 291-2594\n` +
    `Office hours: Mon\u2013Fri, 8:30 AM \u2013 5:00 PM MT`;

  await send({ to: toEmail, subject, html, text });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  2. ADMIN AUDIT NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendContentEditNotification(data: ContentEditPayload): Promise<void> {
  console.log('[mailer] sendContentEditNotification called', { key: data.key, editor: data.editor });

  const timestamp = fmtTimestamp();
  const truncated = data.value.length > 300 ? data.value.slice(0, 300) + '\u2026' : data.value;
  const section   = data.key.split('/')[0];
  const subject   = `\u270F Site Content Updated \u2014 ${section}`;

  const html = baseHtml(`
    <div class="badge">\u270F Content Edit</div>
    <h2>Site Content Updated</h2>
    <p style="font-family:sans-serif;font-size:13px;color:#555;margin:0 0 16px">
      A content field was updated on fl-legal.ca at <strong>${esc(timestamp)}</strong>.
    </p>
    <table class="fields">
      <tr><td class="label">Path</td><td><span class="mono">${esc(data.key)}</span></td></tr>
      ${data.editor ? `<tr><td class="label">Editor</td><td>${esc(data.editor)}</td></tr>` : ''}
      <tr><td class="label">Timestamp</td><td>${esc(timestamp)}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:12px;color:#888;margin:0 0 6px">New value:</p>
    <div class="msg">${esc(truncated).replace(/\n/g, '<br>')}</div>
    <p style="font-family:sans-serif;font-size:11px;color:#9ca3af;margin-top:16px">
      This is an automated notification. The change has already been applied to the live site.
    </p>
  `);

  const text =
    `Site Content Updated\n\n` +
    `Path:      ${data.key}\n` +
    (data.editor ? `Editor:    ${data.editor}\n` : '') +
    `Timestamp: ${timestamp}\n\n` +
    `New value:\n${truncated}`;

  await send({ subject, html, text });
}

export async function sendCalcConfigNotification(data: CalcConfigEditPayload): Promise<void> {
  console.log('[mailer] sendCalcConfigNotification called', { summary: data.summary, editor: data.editor });

  const timestamp = fmtTimestamp();
  const subject   = `\u2699 Calculator Config Updated`;

  const changesHtml = data.changes?.length
    ? `<ul class="change-list">${data.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '';

  const changesText = data.changes?.length
    ? '\nChanges:\n' + data.changes.map(c => `  \u2022 ${c}`).join('\n') + '\n'
    : '';

  const html = baseHtml(`
    <div class="badge">\u2699 Config Update</div>
    <h2>Calculator Configuration Updated</h2>
    <p style="font-family:sans-serif;font-size:13px;color:#555;margin:0 0 16px">
      The fee calculator configuration was updated at <strong>${esc(timestamp)}</strong>.
    </p>
    <table class="fields">
      <tr><td class="label">Summary</td><td>${esc(data.summary)}</td></tr>
      ${data.editor ? `<tr><td class="label">Editor</td><td>${esc(data.editor)}</td></tr>` : ''}
      <tr><td class="label">Timestamp</td><td>${esc(timestamp)}</td></tr>
    </table>
    ${changesHtml}
    <p style="font-family:sans-serif;font-size:11px;color:#9ca3af;margin-top:16px">
      This is an automated notification. The configuration has been saved to Firebase.
    </p>
  `);

  const text =
    `Calculator Config Updated\n\n` +
    `Summary:   ${data.summary}\n` +
    (data.editor ? `Editor:    ${data.editor}\n` : '') +
    `Timestamp: ${timestamp}\n` +
    changesText;

  await send({ subject, html, text });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERNAL SEND — Resend HTTPS API (with full diagnostic logging)
// ═══════════════════════════════════════════════════════════════════════════════

interface SendOptions {
  to?:      string;
  subject:  string;
  html:     string;
  text:     string;
  replyTo?: string;
}

async function send(opts: SendOptions): Promise<void> {
  const to       = config.email.testRecipient || opts.to || config.email.firmEmail;
  const from     = `${config.email.fromName} <${config.email.fromEmail}>`;
  const replyTo  = opts.replyTo || config.email.replyTo || undefined;

  console.log('[mailer:send] ─── Preparing email ───');
  console.log('[mailer:send]   from:      ', from);
  console.log('[mailer:send]   to:        ', to);
  console.log('[mailer:send]   subject:   ', opts.subject);
  console.log('[mailer:send]   replyTo:   ', replyTo ?? '(none)');
  console.log('[mailer:send]   html size: ', opts.html.length, 'chars');
  console.log('[mailer:send]   text size: ', opts.text.length, 'chars');
  console.log('[mailer:send]   apiKey ok: ', !!RESEND_KEY && RESEND_KEY.startsWith('re_'));
  console.log('[mailer:send]   recipient source:', config.email.testRecipient ? 'TEST_EMAIL_RECIPIENT' : opts.to ? 'opts.to' : 'FIRM_EMAIL');

  const payload = {
    from,
    to,
    subject: opts.subject,
    html:    opts.html,
    text:    opts.text,
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  const t0 = Date.now();

  try {
    console.log('[mailer:send]   Calling resend.emails.send()...');
    const result = await resend.emails.send(payload);
    const ms = Date.now() - t0;

    console.log('[mailer:send]   ─── Resend response ───');
    console.log('[mailer:send]   duration:  ', ms, 'ms');
    console.log('[mailer:send]   data:      ', JSON.stringify(result.data));
    console.log('[mailer:send]   error:     ', JSON.stringify(result.error));

    if (result.error) {
      console.error('[mailer:send] ❌ Resend returned error:', JSON.stringify(result.error, null, 2));
      console.error('[mailer:send]   Error name:   ', result.error.name);
      console.error('[mailer:send]   Error message:', result.error.message);
      throw new Error(
        `Resend send failed [${result.error.name}]: ${result.error.message}`
      );
    }

    console.log('[mailer:send] ✅ Email sent successfully');
    console.log('[mailer:send]   Resend ID: ', result.data?.id ?? '(no id returned)');
  } catch (err: any) {
    const ms = Date.now() - t0;

    // If we already threw from the result.error check above, re-throw as-is
    if (err.message?.startsWith('Resend send failed')) {
      throw err;
    }

    // Unexpected error (network failure, SDK crash, etc.)
    console.error('[mailer:send] ❌ Unexpected error during send');
    console.error('[mailer:send]   duration:  ', ms, 'ms');
    console.error('[mailer:send]   error type:', err?.constructor?.name ?? typeof err);
    console.error('[mailer:send]   message:   ', err?.message ?? String(err));
    console.error('[mailer:send]   stack:     ', err?.stack ?? '(no stack)');

    // Check for common Resend error shapes
    if (err?.statusCode) {
      console.error('[mailer:send]   statusCode:', err.statusCode);
    }
    if (err?.response) {
      console.error('[mailer:send]   response:  ', JSON.stringify(err.response));
    }

    throw new Error(
      `Email send failed: ${err?.message ?? String(err)}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function fmtTimestamp(): string {
  return new Date().toLocaleString('en-CA', {
    timeZone: 'America/Edmonton',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}