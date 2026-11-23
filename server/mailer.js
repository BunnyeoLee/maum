// 메일 발송: SMTP 설정이 있으면 실제 발송, 없으면 '개발용 메일함(outbox)'에만 저장
const nodemailer = require('nodemailer');
const { q } = require('./db');

const SITE = process.env.SITE_NAME || '마음결';
const CS = process.env.CODESPACE_NAME && `https://${process.env.CODESPACE_NAME}-${process.env.PORT || 3000}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev'}`;
const BASE_URL = (CS && (!process.env.BASE_URL || process.env.BASE_URL.includes('localhost')) ? CS : process.env.BASE_URL) || 'http://localhost:3000';
const smtpReady = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

const transporter = smtpReady
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HELP_HTML = `
<div style="margin-top:24px;padding:16px 18px;border-radius:14px;background:#FFF1EA;color:#5a3b2e;font-size:14px;line-height:1.7">
  <b>혼자 견디기 힘들 때, 언제든 도움을 요청하세요 (24시간)</b><br>
  · 자살예방상담전화 <b>109</b> (전화·문자 '마들랜')<br>
  · 청소년상담 <b>1388</b> · 정신건강위기상담 <b>1577-0199</b><br>
  · 도박문제 헬프라인 <b>1336</b><br>
  · 지금 위험한 상황이라면 <b>119</b> 또는 <b>112</b>
</div>`;

function layout(title, bodyHtml, { help = true } = {}) {
  return `<!doctype html><html><body style="margin:0;background:#F7F3EC;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#3B3A4A">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px">
    <div style="background:linear-gradient(135deg,#BFE0CF,#CFE1F3);border-radius:20px 20px 0 0;padding:26px 28px">
      <div style="font-size:13px;letter-spacing:2px;color:#3f6b55">${esc(SITE)} · 마음을 그리는 쉼터</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px">${esc(title)}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 20px 20px;padding:26px 28px;line-height:1.75;font-size:15px">
      ${bodyHtml}
      ${help ? HELP_HTML : ''}
      <p style="margin-top:22px;font-size:12px;color:#8a8796">이 결과는 선별(스크리닝) 목적의 참고 자료이며 의학적 진단이 아닙니다.
      정확한 평가는 전문가와의 상담을 통해 받으세요.<br><a href="${BASE_URL}" style="color:#5f9c7d">${esc(SITE)} 바로가기</a></p>
    </div>
  </div></body></html>`;
}

async function send(to, subject, html, attachments) {
  const row = q.run('INSERT INTO outbox (to_addr, subject, html, status) VALUES (?,?,?,?)', to, subject, html, smtpReady ? 'sending' : 'dev-saved');
  const id = Number(row.lastInsertRowid);
  if (!smtpReady) {
    console.log(`[메일·개발모드] → ${to} | ${subject}`);
    return { ok: true, dev: true };
  }
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, attachments });
    q.run("UPDATE outbox SET status='sent' WHERE id=?", id);
    return { ok: true };
  } catch (e) {
    q.run("UPDATE outbox SET status='failed', error=? WHERE id=?", String(e.message || e), id);
    console.error('[메일 실패]', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { send, layout, esc, smtpReady, SITE, BASE_URL };
