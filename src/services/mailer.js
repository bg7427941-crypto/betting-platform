const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return null;

  const port = Number(SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 = TLS directo; 587 = STARTTLS
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transporter;
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || process.env.ALLOWED_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendVerificationEmail({ to, fullName, token }) {
  const link = `${frontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const hours = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 24);
  const firstName = escapeHtml(String(fullName || '').split(' ')[0] || '');

  const transport = getTransporter();
  if (!transport) {
    if (process.env.NODE_ENV === 'production') {
      // En producción no logueamos el link (es una credencial de un solo uso).
      throw new Error('SMTP no configurado: define SMTP_HOST/SMTP_USER/SMTP_PASS');
    }
    console.warn(`[mailer] SMTP no configurado. Link de verificación para ${to}:\n${link}`);
    return { delivered: false, devLink: link };
  }

  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'Palco <no-reply@localhost>',
    to,
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
  });
  return { delivered: true };
}

module.exports = { sendVerificationEmail };
