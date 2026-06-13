// Sends biji sync failure/recovery emails via SMTP (spec §4.6). Throws on
// send failure; per spec §5 this is a best-effort secondary notification, so
// callers are responsible for catching errors (the primary failure-visibility
// layer is a status file committed to the synced repo).
import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../types/sync.js';

// 10s timeouts so a stalled/firewalled SMTP server fails fast instead of
// hanging on nodemailer's defaults (up to ~10 min) — this runs unattended.
const SMTP_TIMEOUT_MS = 10000;

export async function sendStatusEmail(smtp: SmtpConfig, to: string, subject: string, text: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  await transporter.sendMail({ from: smtp.from, to, subject, text });
}
