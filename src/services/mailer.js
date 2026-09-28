/**
 * Envío de correos. Elige el proveedor según las variables de entorno:
 *
 *   1. BREVO_API_KEY   -> API HTTPS de Brevo   (funciona en Render plan gratis)
 *   2. RESEND_API_KEY  -> API HTTPS de Resend  (funciona en Render plan gratis)
 *   3. SMTP_HOST       -> SMTP con nodemailer  (Render lo bloquea en el plan gratis)
 *   4. ninguno         -> en desarrollo imprime el link en consola; en producción falla
 *
 * Las APIs HTTPS salen por el puerto 443, que Render no bloquea. Requieren
 * Node 18+ (usan fetch nativo).
 */

const HTTP_TIMEOUT_MS = 10000;

function frontendUrl() {
  return (process.env.FRONTEND_URL || process.env.ALLOWED_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Acepta "Palco <no-reply@x.com>" o solo "no-reply@x.com". */
function parseFrom(from) {
  const m = String(from || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '') || undefined, email: m[2].trim() };
  return { name: undefined, email: String(from || '').trim() };
}

function buildMessage({ to, fullName, token }) {
  const link = `${frontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const hours = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 24);
  const firstName = escapeHtml(String(fullName || '').split(' ')[0] || '');
  return {
    to,
    link,
    subject: 'Verifica tu correo en Palco',
    text:
      `Hola ${firstName},\n\n` +
      `Confirma tu correo entrando a este enlace (vale por ${hours} horas):\n${link}\n\n` +
      `Si no creaste una cuenta en Palco, ignora este mensaje.`,
    html:
      `<p>Hola ${firstName},</p>` +
      `<p>Confirma tu correo para activar tu cuenta en Palco:</p>` +
      `<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#c9a24b;color:#111;` +
      `text-decoration:none;border-radius:6px;font-weight:600">Verificar correo</a></p>` +
      `<p style="font-size:13px;color:#666">El enlace vale por ${hours} horas. Si el botón no funciona, copia esto en tu navegador:<br>${link}</p>` +
      `<p style="font-size:13px;color:#666">Si no creaste una cuenta en Palco, ignora este mensaje.</p>`,
  };
}

async function postJson(url, headers, body, providerName) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${providerName} respondió ${res.status}: ${detail.slice(0, 300)}`);
  }
}

async function sendWithBrevo(msg) {
  const sender = parseFrom(process.env.EMAIL_FROM);
  if (!sender.email) throw new Error('Falta EMAIL_FROM (debe ser un remitente verificado en Brevo)');
  await postJson(
    'https://api.brevo.com/v3/smtp/email',
    { 'api-key': process.env.BREVO_API_KEY },
    {
      sender: sender.name ? { name: sender.name, email: sender.email } : { email: sender.email },
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
    },
    'Brevo'
  );
}

async function sendWithResend(msg) {
  if (!process.env.EMAIL_FROM) throw new Error('Falta EMAIL_FROM');
  await postJson(
    'https://api.resend.com/emails',
    { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    { from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text },
    'Resend'
  );
}

let smtpTransporter = null;
async function sendWithSmtp(msg) {
  if (!smtpTransporter) {
    const nodemailer = require('nodemailer'); // solo se carga si se usa SMTP
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    const port = Number(SMTP_PORT || 587);
    smtpTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = TLS directo; 587 = STARTTLS
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      connectionTimeout: 10000,
    });
  }
  await smtpTransporter.sendMail({
    from: process.env.EMAIL_FROM || 'Palco <no-reply@localhost>',
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}

async function sendVerificationEmail({ to, fullName, token }) {
  const msg = buildMessage({ to, fullName, token });

  if (process.env.BREVO_API_KEY) {
    await sendWithBrevo(msg);
    return { delivered: true };
  }
  if (process.env.RESEND_API_KEY) {
    await sendWithResend(msg);
    return { delivered: true };
  }
  if (process.env.SMTP_HOST) {
    await sendWithSmtp(msg);
    return { delivered: true };
  }

  if (process.env.NODE_ENV === 'production') {
    // En producción no logueamos el link (es una credencial de un solo uso).
    throw new Error('Correo no configurado: define BREVO_API_KEY, RESEND_API_KEY o SMTP_HOST');
  }
  console.warn(`[mailer] Ningún proveedor configurado. Link de verificación para ${to}:\n${msg.link}`);
  return { delivered: false, devLink: msg.link };
}

module.exports = { sendVerificationEmail };
