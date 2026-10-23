// Email delivery. Uses SMTP when SMTP_HOST is configured; otherwise logs to the server console (development only).
const nodemailer = require('nodemailer');
let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === '1',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
const configured = () => !!transport;
async function send(to, subject, text) {
  if (!transport) { console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}`); return { dev: true }; }
  await transport.sendMail({ from: process.env.SMTP_FROM || 'Marché DZ <no-reply@marchedz.dz>', to, subject, text });
  return { sent: true };
}
module.exports = { send, configured };
