// Sends biji sync failure/recovery emails via SMTP (spec §4.6).
import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../types/sync.js';

export async function sendStatusEmail(smtp: SmtpConfig, to: string, subject: string, text: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({ from: smtp.from, to, subject, text });
}
