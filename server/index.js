// 마음결 — 미술심리치료·마음건강 플랫폼 서버
require('./env');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { q, ready, DATA_DIR, REMOTE } = require('./db');
const { enc, dec, encBuf, decBuf, sha, token } = require('./secure');
const mailer = require('./mailer');
const { publicDefs, scoreTest, CATEGORIES, TESTS } = require('./tests');
const { detectText, DRAW_TASKS, analyzeDrawing } = require('./risk');
const ai = require('./ai');
const counselor = require('./counselor');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  // Codespaces 편집기 안의 미리보기(iframe)에서도 열리도록, Codespaces에서는 프레임 차단을 끔
  if (!process.env.CODESPACE_NAME) res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = Number(process.env.PORT || 3000);
// 메일 발송 설정이 없을 때만 인증번호를 화면에 보여 줌 (시험 단계용)
const DEV_SHOW_CODE = !mailer.smtpReady;
const GRP_LABEL = { elem: '초등학생', middle: '중학생', high: '고등학생', adult: '대학생·성인', teacher: '교사' };
const LEVEL_LABEL = { 1: '관심', 2: '위험', 3: '긴급' };
const phoneNorm = (p) => String(p || '').replace(/\D/g, '');
const emailNorm = (e) => String(e || '').trim().toLowerCase();
const isStaff = (u) => u && (u.role === 'counselor' || u.role === 'admin');
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  res.status(e.status || 400).json({ error: e.message || '요청을 처리하지 못했습니다.' });
});
const fail = (status, msg) => Object.assign(new Error(msg), { status });

// ── 관리자 계정 보장 ────────────────────────────────────
async function ensureAdmin() {
  const email = emailNorm(process.env.ADMIN_EMAIL || 'admin@maeumgyeol.local');
  const phone = phoneNorm(process.env.ADMIN_PHONE || '01000000000');
  if (!await q.get('SELECT id FROM users WHERE email=?', email)) {
    await q.run("INSERT INTO users (email, phone, name, grp, role) VALUES (?,?,?,?, 'admin')", email, phone, process.env.ADMIN_NAME || '관리자', 'adult');
    console.log(`[초기화] 관리자 계정 생성: ${email} / ${phone}`);
  }
}
const boot = ready.then(ensureAdmin);
process.on('unhandledRejection', (e) => console.error('[오류]', e));

// ── 세션 ────────────────────────────────────────────────
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((x) => x[0]));
}
async function currentUser(req) {
  const t = cookies(req).mg_sid;
  if (!t) return null;
  const s = await q.get('SELECT * FROM sessions WHERE token=?', sha(t));
  if (!s || s.expires < Date.now()) return null;
  return await q.get('SELECT * FROM users WHERE id=? AND active=1', s.user_id) || null;
}
function auth(req, res, next) {
  currentUser(req).then((u) => {
    if (!u) return res.status(401).json({ error: '로그인이 필요합니다.' });
    req.user = u; next();
  }).catch(next);
}
const staffOnly = (req, res, next) => (isStaff(req.user) ? next() : res.status(403).json({ error: '상담사·관리자만 이용할 수 있습니다.' }));
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: '관리자만 이용할 수 있습니다.' }));
const pubUser = (u) => ({ id: u.id, email: u.email, phone: u.phone, name: u.name, grp: u.grp, grpLabel: GRP_LABEL[u.grp], role: u.role, email_results: !!u.email_results, birth_year: u.birth_year });

// ── 실시간 알림 (Server-Sent Events) ───────────────────
const streams = new Map(); // userId -> Set(res)
function push(userId, event, data) {
  (streams.get(userId) || []).forEach((r) => r.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}
async function pushStaff(event, data) {
  (await q.all("SELECT id FROM users WHERE role IN ('counselor','admin') AND active=1")).forEach((s) => push(s.id, event, data));
}
app.get('/api/stream', auth, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 4000\n\n');
  if (!streams.has(req.user.id)) streams.set(req.user.id, new Set());
  streams.get(req.user.id).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); streams.get(req.user.id)?.delete(res); });
});

// ── 위기 알림 ───────────────────────────────────────────
async function alertRecipients() {
  const fromEnv = String(process.env.ALERT_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : (await q.all("SELECT email FROM users WHERE role='admin' AND active=1")).map((r) => r.email);
}
async function createAlert(userId, source, sourceId, level, reason) {
  if (level < 1) return null;
  const open = await q.get("SELECT * FROM alerts WHERE user_id=? AND source=? AND IFNULL(source_id,0)=IFNULL(?,0) AND status!='resolved'", userId, source, sourceId ?? null);
  let id, raised = false;
  if (open) {
    id = open.id;
    if (level > open.level) raised = true;
    await q.run("UPDATE alerts SET level=MAX(level,?), reason=?, status=CASE WHEN ?>level THEN 'new' ELSE status END, updated_at=datetime('now','localtime') WHERE id=?", level, reason, level, id);
  } else {
    id = Number((await q.run('INSERT INTO alerts (user_id, source, source_id, level, reason) VALUES (?,?,?,?,?)', userId, source, sourceId ?? null, level, reason)).lastInsertRowid);
    raised = true;
  }
  const a = await q.get('SELECT a.*, u.name, u.grp FROM alerts a JOIN users u ON u.id=a.user_id WHERE a.id=?', id);
  pushStaff('alert', a);
  if (raised && a.level >= 2) {
    const u = await q.get('SELECT * FROM users WHERE id=?', userId);
    const html = mailer.layout(`[${LEVEL_LABEL[a.level]}] 위기 신호 감지`, `
      <p><b>${mailer.esc(u.name)}</b> (${GRP_LABEL[u.grp]}) 님에게서 위기 신호가 감지되었습니다.</p>
      <p>· 출처: ${mailer.esc(source)}<br>· 내용: ${mailer.esc(reason)}<br>· 연락처: ${mailer.esc(u.phone)} / ${mailer.esc(u.email)}
      ${u.guardian_phone ? `<br>· 보호자: ${mailer.esc(u.guardian_name || '')} ${mailer.esc(u.guardian_phone)}` : ''}</p>
      <p><a href="${mailer.BASE_URL}/#/admin/alerts" style="color:#c0392b"><b>관리자 화면에서 확인하기 →</b></a></p>`, { help: false });
    (await alertRecipients()).forEach((to) => mailer.send(to, `[마음결 ${LEVEL_LABEL[a.level]}] ${u.name} 님 위기 신호`, html));
  }
  return a;
}

// ── 인증 ────────────────────────────────────────────────
async function sendCode(user) {
  const now = Date.now();
  const prev = await q.get('SELECT * FROM login_codes WHERE email=?', user.email);
  if (prev && now - prev.sent_at < 45000) throw fail(429, '잠시 후 다시 요청해 주세요. (45초)');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await q.run('INSERT OR REPLACE INTO login_codes (email, code_hash, expires, attempts, sent_at) VALUES (?,?,?,0,?)', user.email, sha(user.email + code), now + 10 * 60000, now);
  await mailer.send(user.email, `[마음결] 로그인 인증번호 ${code}`, mailer.layout('로그인 인증번호',
    `<p>${mailer.esc(user.name)} 님, 아래 인증번호를 10분 안에 입력해 주세요.</p>
     <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#3f6b55;margin:18px 0">${code}</div>
     <p style="color:#8a8796;font-size:13px">본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>`, { help: false }));
  return DEV_SHOW_CODE ? { devCode: code } : {};
}

app.post('/api/auth/signup', wrap(async (req, res) => {
  const b = req.body || {};
  const email = emailNorm(b.email), phone = phoneNorm(b.phone);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw fail(400, '메일 주소를 확인해 주세요.');
  if (!/^01\d{8,9}$/.test(phone)) throw fail(400, '휴대전화 번호를 확인해 주세요. (예: 010-1234-5678)');
  if (!b.name || String(b.name).trim().length < 1) throw fail(400, '이름(또는 별명)을 입력해 주세요.');
  if (!GRP_LABEL[b.grp]) throw fail(400, '대상 구분을 선택해 주세요.');
  if (b.grp === 'teacher' && String(b.teacher_code || '').trim() !== (process.env.TEACHER_CODE || 'maum2026'))
    throw fail(400, '교사 인증코드가 맞지 않아요. 학교(기관) 담당자에게 받은 코드를 입력해 주세요.');
  if (!b.consent?.privacy || !b.consent?.sensitive || !b.consent?.crisis) throw fail(400, '필수 동의 항목에 모두 동의해 주세요.');
  const by = b.birth_year ? Number(b.birth_year) : null;
  const age = by ? new Date().getFullYear() - by : null;
  if ((b.grp === 'elem' || (age !== null && age < 14)) && (!b.guardian_name || !phoneNorm(b.guardian_phone) || !b.consent?.guardian))
    throw fail(400, '만 14세 미만은 보호자 정보와 보호자 동의가 필요합니다.');
  if (await q.get('SELECT id FROM users WHERE email=?', email)) throw fail(409, '이미 가입된 메일 주소입니다. 로그인해 주세요.');
  await q.run('INSERT INTO users (email, phone, name, grp, birth_year, guardian_name, guardian_phone, email_results) VALUES (?,?,?,?,?,?,?,?)',
    email, phone, String(b.name).trim().slice(0, 30), b.grp, by, b.guardian_name || null, phoneNorm(b.guardian_phone) || null, b.email_results === false ? 0 : 1);
  const user = await q.get('SELECT * FROM users WHERE email=?', email);
  res.json({ ok: true, ...(await sendCode(user)) });
}));

app.post('/api/auth/request-code', wrap(async (req, res) => {
  const email = emailNorm(req.body?.email), phone = phoneNorm(req.body?.phone);
  const user = await q.get('SELECT * FROM users WHERE email=? AND active=1', email);
  if (!user || user.phone !== phone) throw fail(400, '메일 주소와 연락처가 일치하는 계정이 없습니다.');
  res.json({ ok: true, ...(await sendCode(user)) });
}));

app.post('/api/auth/verify', wrap(async (req, res) => {
  const email = emailNorm(req.body?.email), phone = phoneNorm(req.body?.phone), code = String(req.body?.code || '').trim();
  const user = await q.get('SELECT * FROM users WHERE email=? AND active=1', email);
  const lc = await q.get('SELECT * FROM login_codes WHERE email=?', email);
  if (!user || user.phone !== phone || !lc) throw fail(400, '인증번호를 먼저 요청해 주세요.');
  if (lc.expires < Date.now() || lc.attempts >= 5) { await q.run('DELETE FROM login_codes WHERE email=?', email); throw fail(400, '인증번호가 만료되었습니다. 다시 요청해 주세요.'); }
  if (lc.code_hash !== sha(email + code)) { await q.run('UPDATE login_codes SET attempts=attempts+1 WHERE email=?', email); throw fail(400, '인증번호가 맞지 않습니다.'); }
  await q.run('DELETE FROM login_codes WHERE email=?', email);
  const t = token();
  await q.run('INSERT INTO sessions (token, user_id, expires) VALUES (?,?,?)', sha(t), user.id, Date.now() + 14 * 864e5);
  await q.run("UPDATE users SET last_login=datetime('now','localtime') WHERE id=?", user.id);
  const secure = mailer.BASE_URL.startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `mg_sid=${t}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${14 * 86400}${secure}`);
  res.json({ ok: true, user: pubUser(user) });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const t = cookies(req).mg_sid;
  if (t) await q.run('DELETE FROM sessions WHERE token=?', sha(t));
  res.setHeader('Set-Cookie', 'mg_sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
}));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/me', wrap(async (req, res) => {
  const u = await currentUser(req);
  res.json({ user: u ? pubUser(u) : null, devMail: !mailer.smtpReady, ai: ai.enabled });
}));
app.patch('/api/me', auth, wrap(async (req, res) => {
  if (typeof req.body.email_results === 'boolean') await q.run('UPDATE users SET email_results=? WHERE id=?', req.body.email_results ? 1 : 0, req.user.id);
  res.json({ user: pubUser(await q.get('SELECT * FROM users WHERE id=?', req.user.id)) });
}));

// ── 심리검사 ────────────────────────────────────────────
app.get('/api/tests', auth, (req, res) => {
  res.json({ tests: publicDefs(isStaff(req.user) ? null : req.user.grp), categories: CATEGORIES });
});

function resultEmailHtml(user, r, title) {
  return mailer.layout(`${title} 결과`, `
    <p>${mailer.esc(user.name)} 님, 소중한 마음을 들려주셔서 고마워요.</p>
    <div style="padding:18px;border-radius:14px;background:#F2F7F3;margin:14px 0">
      <div style="font-size:13px;color:#5f7d6c">결과</div>
      <div style="font-size:22px;font-weight:700;margin:4px 0">${mailer.esc(r.level_label)} <span style="font-size:15px;color:#7a7887">(${r.score}점)</span></div>
      <div>${mailer.esc(r.summary)}</div>
    </div>
    <p style="font-size:13px;color:#8a8796">검사 일시: ${mailer.esc(r.created_at)}</p>`);
}

app.post('/api/tests/:id', auth, wrap(async (req, res) => {
  const def = TESTS.find((t) => t.id === req.params.id);
  if (!def) throw fail(404, '검사를 찾을 수 없습니다.');
  const r = scoreTest(def.id, req.body.answers, req.user);
  const id = Number((await q.run('INSERT INTO test_results (user_id, test_id, answers, score, level, level_label, risk, summary) VALUES (?,?,?,?,?,?,?,?)',
    req.user.id, def.id, JSON.stringify(r.answers), r.score, r.level, r.levelLabel, r.risk, r.summary)).lastInsertRowid);
  if (r.risk >= 1) await createAlert(req.user.id, 'test', id, r.risk, `${def.title}: ${r.levelLabel} (${r.score}점)${r.flags?.length ? ' · ' + r.flags.join(', ') : ''}`);
  const row = await q.get('SELECT * FROM test_results WHERE id=?', id);
  let emailed = false;
  if (req.user.email_results) {
    const m = await mailer.send(req.user.email, `[마음결] ${def.title} 결과`, resultEmailHtml(req.user, row, def.title));
    emailed = m.ok; if (m.ok) await q.run('UPDATE test_results SET emailed=1 WHERE id=?', id);
  }
  res.json({ result: { ...row, title: def.title, icon: def.icon, note: r.note, flags: r.flags }, sos: r.risk >= 2, risk: r.risk, followUp: r.followUp || null, emailed });
}));

app.get('/api/results', auth, wrap(async (req, res) => {
  const rows = await q.all('SELECT id, test_id, score, level, level_label, risk, summary, emailed, created_at FROM test_results WHERE user_id=? ORDER BY id DESC', req.user.id);
  res.json({ results: rows.map((r) => ({ ...r, title: TESTS.find((t) => t.id === r.test_id)?.title, icon: TESTS.find((t) => t.id === r.test_id)?.icon })) });
}));
app.post('/api/results/:id/email', auth, wrap(async (req, res) => {
  const r = await q.get('SELECT * FROM test_results WHERE id=? AND user_id=?', req.params.id, req.user.id);
  if (!r) throw fail(404, '결과를 찾을 수 없습니다.');
  const def = TESTS.find((t) => t.id === r.test_id);
  const m = await mailer.send(req.user.email, `[마음결] ${def.title} 결과`, resultEmailHtml(req.user, r, def.title));
  if (m.ok) await q.run('UPDATE test_results SET emailed=1 WHERE id=?', r.id);
  res.json({ ok: m.ok, dev: m.dev });
}));

// ── 그림 치료 ───────────────────────────────────────────
app.get('/api/draw/tasks', auth, (req, res) => res.json({ tasks: DRAW_TASKS }));

function drawingAccess(user, d) {
  if (!d) throw fail(404, '그림을 찾을 수 없습니다.');
  if (d.user_id !== user.id && !isStaff(user)) throw fail(403, '접근 권한이 없습니다.');
}
function readDrawingPng(d) { return decBuf(d.image_enc ? Buffer.from(d.image_enc, 'base64') : fs.readFileSync(path.join(DATA_DIR, 'drawings', d.file))); }

app.post('/api/drawings', auth, wrap(async (req, res) => {
  const { task_id, image, meta = {}, pdi = {}, submit = true } = req.body || {};
  const task = DRAW_TASKS.find((t) => t.id === task_id);
  if (!task) throw fail(400, '그림 과제를 선택해 주세요.');
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(image || '');
  if (!m) throw fail(400, '그림 데이터가 올바르지 않습니다.');
  const png = Buffer.from(m[1], 'base64');
  if (png.length > 8 * 1024 * 1024) throw fail(400, '그림 파일이 너무 큽니다.');
  const imageEnc = encBuf(png).toString('base64'); // 그림은 암호화해서 DB에 저장 (무료 서버에서도 유지)
  const cleanPdi = Object.fromEntries(Object.entries(pdi).map(([k, v]) => [k, String(v).slice(0, 1000)]));
  const auto = analyzeDrawing(task, meta, cleanPdi);
  const id = Number((await q.run('INSERT INTO drawings (user_id, task_id, title, file, image_enc, meta, pdi_enc, auto_analysis, risk, status) VALUES (?,?,?,?,?,?,?,?,?,?)',
    req.user.id, task.id, cleanPdi.title || task.title, '', imageEnc, JSON.stringify(meta), enc(JSON.stringify(cleanPdi)), JSON.stringify(auto), auto.risk, submit ? 'submitted' : 'saved')).lastInsertRowid);
  if (auto.risk >= 2) await createAlert(req.user.id, 'drawing', id, auto.risk, `그림(${task.title}) 사후질문에서 위기 표현 감지`);
  if (submit) pushStaff('drawing', { id, user_id: req.user.id, name: req.user.name, task: task.title });
  res.json({ id, auto: { client: auto.client }, sos: auto.risk >= 2, risk: auto.risk });

  // AI 해석은 응답 후 비동기로 수행
  if (ai.enabled && submit) {
    ai.interpretDrawing({ task, pngBase64: m[1], meta, pdi: cleanPdi, user: req.user }).then(async (out) => {
      if (!out) return;
      await q.run('UPDATE drawings SET ai_analysis=?, risk=MAX(risk,?) WHERE id=?', JSON.stringify(out), Number(out.risk) || 0, id);
      if (Number(out.risk) >= 2) await createAlert(req.user.id, 'drawing', id, Number(out.risk), `그림(${task.title}) AI 해석 위기 신호: ${out.risk_reason || ''}`);
      push(req.user.id, 'drawing-ai', { id });
    }).catch((e) => console.error('[AI 그림 해석 실패]', e.message));
  }
}));

app.get('/api/drawings', auth, wrap(async (req, res) => {
  const rows = await q.all('SELECT id, task_id, title, status, risk, created_at, interpreted_at FROM drawings WHERE user_id=? ORDER BY id DESC', req.user.id);
  res.json({ drawings: rows.map((d) => ({ ...d, task: DRAW_TASKS.find((t) => t.id === d.task_id)?.title })) });
}));

function drawingDetail(d, forStaff) {
  const task = DRAW_TASKS.find((t) => t.id === d.task_id);
  const auto = JSON.parse(d.auto_analysis || '{}');
  const aiA = d.ai_analysis ? JSON.parse(d.ai_analysis) : null;
  const base = {
    id: d.id, task_id: d.task_id, task: task?.title, prompt: task?.prompt, title: d.title, status: d.status, created_at: d.created_at,
    interpreted_at: d.interpreted_at, pdi: JSON.parse(dec(d.pdi_enc) || '{}'), pdiQuestions: task?.pdi || [],
    counselor_note: forStaff || (d.status === 'interpreted' && d.note_shared) ? dec(d.counselor_note_enc) : '',
    client_message: d.client_message || aiA?.client_message || '', auto_client: auto.client || [],
  };
  if (forStaff) Object.assign(base, { note_shared: !!d.note_shared, meta: JSON.parse(d.meta || '{}'), auto, ai: aiA, risk: d.risk, user_id: d.user_id });
  return base;
}
app.get('/api/drawings/:id', auth, wrap(async (req, res) => {
  const d = await q.get('SELECT * FROM drawings WHERE id=?', req.params.id);
  drawingAccess(req.user, d);
  res.json({ drawing: drawingDetail(d, isStaff(req.user)) });
}));
app.get('/api/drawings/:id/image', auth, wrap(async (req, res) => {
  const d = await q.get('SELECT * FROM drawings WHERE id=?', req.params.id);
  drawingAccess(req.user, d);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(readDrawingPng(d));
}));
app.post('/api/drawings/:id/submit', auth, wrap(async (req, res) => {
  const d = await q.get('SELECT * FROM drawings WHERE id=? AND user_id=?', req.params.id, req.user.id);
  if (!d) throw fail(404, '그림을 찾을 수 없습니다.');
  await q.run("UPDATE drawings SET status='submitted' WHERE id=? AND status='saved'", d.id);
  pushStaff('drawing', { id: d.id, user_id: req.user.id, name: req.user.name });
  res.json({ ok: true });
}));
app.post('/api/drawings/:id/email', auth, wrap(async (req, res) => {
  const d = await q.get('SELECT * FROM drawings WHERE id=? AND user_id=?', req.params.id, req.user.id);
  if (!d) throw fail(404, '그림을 찾을 수 없습니다.');
  const det = drawingDetail(d, false);
  const html = mailer.layout(`나의 그림 — ${det.task}`, `
    <p>${mailer.esc(req.user.name)} 님이 ${mailer.esc(det.created_at)}에 그린 그림이에요.</p>
    <img src="cid:drawing" style="width:100%;border-radius:14px;border:1px solid #eee">
    ${det.client_message ? `<p style="margin-top:14px"><b>마음결이 건네는 말</b><br>${mailer.esc(det.client_message)}</p>` : ''}
    ${det.counselor_note ? `<p><b>상담 선생님의 해석</b><br>${mailer.esc(det.counselor_note).replace(/\n/g, '<br>')}</p>` : ''}
    ${!det.counselor_note ? `<p>${det.auto_client.map(mailer.esc).join('<br>')}</p>` : ''}`);
  const m = await mailer.send(req.user.email, `[마음결] 나의 그림 — ${det.task}`, html, [{ filename: 'drawing.png', content: readDrawingPng(d), cid: 'drawing' }]);
  res.json({ ok: m.ok, dev: m.dev });
}));

// ── 기분 기록 · 미션 · 안전계획 · SOS ─────────────────
app.post('/api/moods', auth, wrap(async (req, res) => {
  const score = Number(req.body.score);
  if (!(score >= 1 && score <= 5)) throw fail(400, '기분을 선택해 주세요.');
  const note = String(req.body.note || '').slice(0, 500);
  const id = Number((await q.run('INSERT INTO moods (user_id, score, note_enc) VALUES (?,?,?)', req.user.id, score, enc(note))).lastInsertRowid);
  const t = detectText(note);
  if (t.level >= 1) await createAlert(req.user.id, 'mood', id, t.level, `기분 기록 메모에서 ${t.level >= 2 ? '위기' : '주의'} 표현 감지`);
  const last3 = await q.all('SELECT score FROM moods WHERE user_id=? ORDER BY id DESC LIMIT 3', req.user.id);
  if (last3.length === 3 && last3.every((m) => m.score === 1)) await createAlert(req.user.id, 'mood', null, 1, '최근 기분 기록 3회 연속 "매우 힘듦"');
  res.json({ ok: true, sos: t.level >= 2 });
}));
app.get('/api/moods', auth, wrap(async (req, res) => {
  res.json({ moods: (await q.all('SELECT id, score, note_enc, created_at FROM moods WHERE user_id=? ORDER BY id DESC LIMIT 30', req.user.id)).map((m) => ({ id: m.id, score: m.score, note: dec(m.note_enc), created_at: m.created_at })) });
}));
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
app.get('/api/missions', auth, wrap(async (req, res) => {
  const day = today();
  const done = (await q.all('SELECT mission FROM missions WHERE user_id=? AND day=?', req.user.id, day)).map((r) => r.mission);
  const streak = (await q.all('SELECT DISTINCT day FROM missions WHERE user_id=? ORDER BY day DESC LIMIT 60', req.user.id)).map((r) => r.day);
  let n = 0; const d = new Date(day);
  for (;;) { const s = d.toISOString().slice(0, 10); if (streak.includes(s)) { n++; d.setDate(d.getDate() - 1); } else break; }
  res.json({ day, done, streak: n });
}));
app.post('/api/missions/toggle', auth, wrap(async (req, res) => {
  const mission = String(req.body.mission || '').slice(0, 40), day = today();
  if (await q.get('SELECT 1 FROM missions WHERE user_id=? AND day=? AND mission=?', req.user.id, day, mission)) await q.run('DELETE FROM missions WHERE user_id=? AND day=? AND mission=?', req.user.id, day, mission);
  else await q.run('INSERT INTO missions (user_id, day, mission) VALUES (?,?,?)', req.user.id, day, mission);
  res.json({ ok: true });
}));
app.get('/api/safety-plan', auth, wrap(async (req, res) => {
  const r = await q.get('SELECT * FROM safety_plans WHERE user_id=?', req.user.id);
  res.json({ plan: r ? JSON.parse(dec(r.plan_enc) || '{}') : {}, updated_at: r?.updated_at });
}));
app.put('/api/safety-plan', auth, wrap(async (req, res) => {
  const plan = JSON.stringify(req.body.plan || {}).slice(0, 20000);
  await q.run("INSERT INTO safety_plans (user_id, plan_enc) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET plan_enc=excluded.plan_enc, updated_at=datetime('now','localtime')", req.user.id, enc(plan));
  res.json({ ok: true });
}));
app.post('/api/sos', auth, wrap(async (req, res) => {
  const msg = String(req.body.message || '').slice(0, 300);
  await createAlert(req.user.id, 'sos', null, 3, `내담자가 직접 SOS를 요청했습니다.${msg ? ' 메시지: ' + msg : ''}`);
  res.json({ ok: true });
}));

// ── 채팅 상담 ───────────────────────────────────────────
// 비밀보장 원칙: 대화 내용은 내담자와 배정된 상담사만 볼 수 있습니다.
// 예외: 위기 상황(위험·긴급 알림 진행 중)에서 관리자가 사유를 기록하고 '긴급 열람'을 요청한 경우(30분, 감사 로그 기록).
const grants = new Map(); // `${staffId}:${userId}` -> expiry
const hasGrant = (staffId, userId) => (grants.get(`${staffId}:${userId}`) || 0) > Date.now();
function canReadSession(user, s) {
  if (!s) return false;
  if (s.user_id === user.id) return true;
  if (isStaff(user) && s.counselor_id === user.id) return true;
  return user.role === 'admin' && hasGrant(user.id, s.user_id);
}
const sessionView = async (s) => {
  const u = await q.get('SELECT name, grp FROM users WHERE id=?', s.user_id);
  const c = s.counselor_id ? await q.get('SELECT name FROM users WHERE id=?', s.counselor_id) : null;
  const last = await q.get('SELECT created_at FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 1', s.id);
  return { ...s, client_name: u?.name, client_grp: GRP_LABEL[u?.grp], counselor_name: c?.name || null, last_at: last?.created_at || s.created_at };
};
async function addMessage(sessionId, senderId, role, body, risk = 0) {
  const id = Number((await q.run('INSERT INTO messages (session_id, sender_id, sender_role, body_enc, risk) VALUES (?,?,?,?,?)', sessionId, senderId, role, enc(body), risk)).lastInsertRowid);
  await q.run("UPDATE chat_sessions SET updated_at=datetime('now','localtime') WHERE id=?", sessionId);
  const s = await q.get('SELECT * FROM chat_sessions WHERE id=?', sessionId);
  const msg = { id, session_id: sessionId, sender_id: senderId, sender_role: role, body, risk, created_at: (await q.get('SELECT created_at FROM messages WHERE id=?', id)).created_at };
  push(s.user_id, 'message', msg);
  if (s.counselor_id) push(s.counselor_id, 'message', msg);
  pushStaff('session', await sessionView(s));
  return msg;
}

// AI 상담사 응답 (상담 선생님이 배정되기 전, 또는 AI 응대가 켜져 있을 때)
const aiBusy = new Set();
async function aiRespond(sessionId) {
  const s = await q.get('SELECT * FROM chat_sessions WHERE id=?', sessionId);
  if (!s || s.status === 'closed' || !s.ai_active || aiBusy.has(sessionId)) return;
  aiBusy.add(sessionId);
  const notify = (on) => { push(s.user_id, 'typing', { session_id: s.id, on }); if (s.counselor_id) push(s.counselor_id, 'typing', { session_id: s.id, on }); };
  try {
    notify(true);
    const user = await q.get('SELECT * FROM users WHERE id=?', s.user_id);
    const rows = (await q.all("SELECT sender_role, body_enc, risk FROM messages WHERE session_id=? AND sender_role IN ('client','ai','counselor') ORDER BY id DESC LIMIT 30", s.id)).reverse();
    const history = rows.map((m) => ({ role: m.sender_role === 'client' ? 'user' : 'assistant', content: dec(m.body_enc) }));
    const lastRisk = rows.length ? rows[rows.length - 1].risk : 0;
    const started = Date.now();
    const r = await counselor.reply(history, user, lastRisk);
    await new Promise((ok) => setTimeout(ok, Math.max(0, 1200 - (Date.now() - started)))); // 너무 기계적으로 빠르지 않게
    const now = await q.get('SELECT ai_active, status FROM chat_sessions WHERE id=?', s.id);
    if (r.text && now.ai_active && now.status !== 'closed') await addMessage(s.id, 0, 'ai', r.text);
  } catch (e) { console.error('[AI 상담사 오류]', e.message); }
  finally { notify(false); aiBusy.delete(sessionId); }
}

app.get('/api/chat/sessions', auth, wrap(async (req, res) => {
  let rows;
  if (!isStaff(req.user)) rows = await q.all('SELECT * FROM chat_sessions WHERE user_id=? ORDER BY id DESC', req.user.id);
  else rows = await q.all("SELECT * FROM chat_sessions WHERE status!='closed' OR counselor_id=? ORDER BY CASE status WHEN 'waiting' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, risk DESC, updated_at DESC LIMIT 200", req.user.id);
  res.json({ sessions: (await Promise.all(rows.map(sessionView))).map((s) => ({ ...s, readable: canReadSession(req.user, s) })) });
}));
app.post('/api/chat/sessions', auth, wrap(async (req, res) => {
  const open = await q.get("SELECT * FROM chat_sessions WHERE user_id=? AND status!='closed' ORDER BY id DESC", req.user.id);
  if (open) return res.json({ session: await sessionView(open) });
  const topic = String(req.body.topic || '이야기하고 싶어요').slice(0, 60);
  const id = Number((await q.run('INSERT INTO chat_sessions (user_id, topic) VALUES (?,?)', req.user.id, topic)).lastInsertRowid);
  await addMessage(id, 0, 'system', '상담 요청이 접수되었어요. 상담 선생님이 연결될 때까지 AI 상담사가 먼저 이야기를 들을게요. 이 대화는 비밀이 보장되며, 생명과 안전이 위험한 경우에만 보호를 위해 예외적으로 확인될 수 있어요.');
  await addMessage(id, 0, 'ai', `안녕하세요, ${req.user.name} 님. 저는 마음결의 AI 상담사예요. '${topic}'에 대해 이야기하고 싶으셨군요. 어떤 일이 있었는지 편하게 들려주세요. 천천히 써도 괜찮아요.`);
  res.json({ session: await sessionView(await q.get('SELECT * FROM chat_sessions WHERE id=?', id)) });
}));
app.get('/api/chat/sessions/:id/messages', auth, wrap(async (req, res) => {
  const s = await q.get('SELECT * FROM chat_sessions WHERE id=?', req.params.id);
  if (!canReadSession(req.user, s)) throw fail(403, '이 상담 내용은 비밀보장 원칙에 따라 열람할 수 없습니다.');
  if (req.user.role === 'admin' && s.user_id !== req.user.id && s.counselor_id !== req.user.id)
    await q.run('INSERT INTO access_logs (staff_id, user_id, target, reason) VALUES (?,?,?,?)', req.user.id, s.user_id, `chat#${s.id} 열람`, '긴급 열람 권한 사용');
  const msgs = (await q.all('SELECT * FROM messages WHERE session_id=? ORDER BY id', s.id)).map((m) => ({ id: m.id, sender_id: m.sender_id, sender_role: m.sender_role, body: dec(m.body_enc), risk: m.risk, created_at: m.created_at }));
  res.json({ session: await sessionView(s), messages: msgs });
}));
app.post('/api/chat/sessions/:id/messages', auth, wrap(async (req, res) => {
  const s = await q.get('SELECT * FROM chat_sessions WHERE id=?', req.params.id);
  if (!s || s.status === 'closed') throw fail(400, '종료된 상담입니다.');
  const body = String(req.body.body || '').trim().slice(0, 2000);
  if (!body) throw fail(400, '내용을 입력해 주세요.');
  const mine = s.user_id === req.user.id;
  if (!mine && !(isStaff(req.user) && s.counselor_id === req.user.id)) throw fail(403, '이 상담에 메시지를 보낼 수 없습니다.');
  let risk = 0;
  if (mine) {
    const t = detectText(body);
    risk = t.level;
    if (risk >= 2) {
      const prev = s.risk;
      await q.run('UPDATE chat_sessions SET risk=MAX(risk,?) WHERE id=?', risk, s.id);
      await createAlert(s.user_id, 'chat', s.id, risk, `채팅 상담에서 위기 표현 감지 (${risk === 3 ? '긴급' : '위험'})`);
      const msg = await addMessage(s.id, req.user.id, 'client', body, risk);
      if (risk > prev) await addMessage(s.id, 0, 'system', '지금 많이 힘드시군요. 이야기해 주어서 정말 고마워요. 당신의 안전이 가장 중요해요. 상담 선생님께 바로 알렸어요. 지금 위험하다고 느껴지면 109(24시간 자살예방상담)나 119로 바로 연락해 주세요.');
      res.json({ message: msg, sos: true, risk });
      return aiRespond(s.id);
    }
    if (risk === 1) await createAlert(s.user_id, 'chat', s.id, 1, '채팅 상담에서 주의 표현 감지 (관심)');
  }
  res.json({ message: await addMessage(s.id, req.user.id, mine ? 'client' : 'counselor', body, risk), sos: false });
  if (mine) aiRespond(s.id);
}));
app.post('/api/chat/sessions/:id/ai', auth, staffOnly, wrap(async (req, res) => {
  const s = await q.get('SELECT * FROM chat_sessions WHERE id=?', req.params.id);
  if (!s || s.counselor_id !== req.user.id) throw fail(403, '담당 상담사만 AI 응대를 바꿀 수 있어요.');
  const on = !!req.body.on;
  await q.run('UPDATE chat_sessions SET ai_active=? WHERE id=?', on ? 1 : 0, s.id);
  await addMessage(s.id, 0, 'system', on ? 'AI 상담사가 다시 함께 대화를 도와요.' : 'AI 상담사는 물러나고, 상담 선생님이 직접 대화해요.');
  res.json({ ok: true });
}));
app.post('/api/chat/sessions/:id/claim', auth, staffOnly, wrap(async (req, res) => {
  const s = await q.get('SELECT * FROM chat_sessions WHERE id=?', req.params.id);
  if (!s || s.status === 'closed') throw fail(400, '배정할 수 없는 상담입니다.');
  if (s.counselor_id && s.counselor_id !== req.user.id) throw fail(409, '이미 다른 상담사가 배정되었습니다.');
  await q.run("UPDATE chat_sessions SET counselor_id=?, status='active', ai_active=0 WHERE id=?", req.user.id, s.id);
  await addMessage(s.id, 0, 'system', `${req.user.name} 상담 선생님이 들어왔어요. 지금부터는 선생님이 직접 이야기를 나눠요.`);
  res.json({ ok: true });
}));
app.post('/api/chat/sessions/:id/close', auth, wrap(async (req, res) => {
  const s = await q.get('SELECT * FROM chat_sessions WHERE id=?', req.params.id);
  if (!s || !(s.user_id === req.user.id || s.counselor_id === req.user.id || req.user.role === 'admin')) throw fail(403, '권한이 없습니다.');
  await addMessage(s.id, 0, 'system', '상담이 종료되었어요. 오늘 이야기해 주어서 고마워요. 언제든 다시 찾아와 주세요.');
  await q.run("UPDATE chat_sessions SET status='closed' WHERE id=?", s.id);
  res.json({ ok: true });
}));

// ── 관리자·상담사 ───────────────────────────────────────
const admin = express.Router();
admin.use(auth, staffOnly);

admin.get('/overview', wrap(async (req, res) => {
  const c = async (sql, ...p) => (await q.get(sql, ...p)).n;
  res.json({
    clients: await c("SELECT COUNT(*) n FROM users WHERE role='client'"),
    newClients7: await c("SELECT COUNT(*) n FROM users WHERE role='client' AND created_at>=datetime('now','localtime','-7 days')"),
    tests7: await c("SELECT COUNT(*) n FROM test_results WHERE created_at>=datetime('now','localtime','-7 days')"),
    drawingsPending: await c("SELECT COUNT(*) n FROM drawings WHERE status='submitted'"),
    chatsWaiting: await c("SELECT COUNT(*) n FROM chat_sessions WHERE status='waiting'"),
    chatsActive: await c("SELECT COUNT(*) n FROM chat_sessions WHERE status='active'"),
    alerts: { 3: await c("SELECT COUNT(*) n FROM alerts WHERE status!='resolved' AND level=3"), 2: await c("SELECT COUNT(*) n FROM alerts WHERE status!='resolved' AND level=2"), 1: await c("SELECT COUNT(*) n FROM alerts WHERE status!='resolved' AND level=1") },
    byTest: (await q.all("SELECT test_id, COUNT(*) n, SUM(risk>=2) risky FROM test_results WHERE created_at>=datetime('now','localtime','-30 days') GROUP BY test_id")).map((r) => ({ ...r, title: TESTS.find((t) => t.id === r.test_id)?.title })),
    byGroup: (await q.all("SELECT grp, COUNT(*) n FROM users WHERE role='client' GROUP BY grp")).map((r) => ({ ...r, label: GRP_LABEL[r.grp] })),
    devMail: !mailer.smtpReady, ai: ai.enabled, tempDb: !REMOTE && !!process.env.RENDER,
  });
}));
admin.get('/alerts', wrap(async (req, res) => {
  const st = req.query.status || 'open';
  const where = st === 'open' ? "a.status!='resolved'" : st === 'all' ? '1=1' : "a.status='resolved'";
  res.json({ alerts: (await q.all(`SELECT a.*, u.name, u.grp, u.phone, u.email, u.guardian_name, u.guardian_phone, h.name handler FROM alerts a JOIN users u ON u.id=a.user_id LEFT JOIN users h ON h.id=a.handled_by WHERE ${where} ORDER BY CASE a.status WHEN 'new' THEN 0 WHEN 'ack' THEN 1 ELSE 2 END, a.level DESC, a.id DESC LIMIT 300`)).map((a) => ({ ...a, grpLabel: GRP_LABEL[a.grp] })) });
}));
admin.post('/alerts/:id', wrap(async (req, res) => {
  const { status, note } = req.body;
  if (!['ack', 'resolved', 'new'].includes(status)) throw fail(400, '상태 값이 올바르지 않습니다.');
  await q.run("UPDATE alerts SET status=?, note=COALESCE(?,note), handled_by=?, updated_at=datetime('now','localtime') WHERE id=?", status, note ? String(note).slice(0, 1000) : null, req.user.id, req.params.id);
  pushStaff('alert', await q.get('SELECT a.*, u.name, u.grp FROM alerts a JOIN users u ON u.id=a.user_id WHERE a.id=?', req.params.id));
  res.json({ ok: true });
}));

admin.get('/users', wrap(async (req, res) => {
  const kw = `%${String(req.query.q || '').trim()}%`;
  const rows = await q.all(`SELECT u.id, u.name, u.email, u.phone, u.grp, u.created_at, u.last_login,
      (SELECT MAX(level) FROM alerts WHERE user_id=u.id AND status!='resolved') open_level,
      (SELECT COUNT(*) FROM alerts WHERE user_id=u.id AND status!='resolved') open_alerts,
      (SELECT MAX(risk) FROM test_results WHERE user_id=u.id AND created_at>=datetime('now','localtime','-30 days')) risk30,
      (SELECT COUNT(*) FROM test_results WHERE user_id=u.id) tests,
      (SELECT COUNT(*) FROM drawings WHERE user_id=u.id) drawings
    FROM users u WHERE u.role='client' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)
    ORDER BY open_level DESC NULLS LAST, risk30 DESC NULLS LAST, u.id DESC LIMIT 300`, kw, kw, kw);
  res.json({ users: rows.map((r) => ({ ...r, grpLabel: GRP_LABEL[r.grp] })) });
}));

async function buildSummary(userId) {
  const results = await q.all('SELECT * FROM test_results WHERE user_id=? ORDER BY id DESC', userId);
  const latest = {};
  results.forEach((r) => { if (!latest[r.test_id]) latest[r.test_id] = r; });
  const lines = Object.values(latest).map((r) => ({ test: TESTS.find((t) => t.id === r.test_id)?.title, ...r }));
  const concerns = lines.filter((l) => l.risk >= 1).sort((a, b) => b.risk - a.risk);
  const openAlerts = await q.all("SELECT * FROM alerts WHERE user_id=? AND status!='resolved' ORDER BY level DESC", userId);
  const moods = (await q.all('SELECT score FROM moods WHERE user_id=? ORDER BY id DESC LIMIT 7', userId)).map((m) => m.score);
  const drawRisk = await q.get('SELECT MAX(risk) r, COUNT(*) n FROM drawings WHERE user_id=?', userId);
  const maxRisk = Math.max(0, ...concerns.map((c) => c.risk), ...openAlerts.map((a) => a.level));
  const priority = ['낮음', '보통', '높음', '긴급'][maxRisk];
  const domains = [];
  const has = (id, lv) => latest[id] && lv.includes(latest[id].level);
  if (has('phq9', ['moderate', 'modsev', 'severe']) || has('child_weather', ['rain']) || has('k6', ['high'])) domains.push('우울·무력감');
  if (has('gad7', ['moderate', 'severe'])) domains.push('불안');
  if (has('smartphone', ['high', 'potential'])) domains.push('스마트폰 과의존');
  if (has('game', ['high', 'caution'])) domains.push('게임 과몰입');
  if (has('gambling', ['moderate', 'problem'])) domains.push('도박 문제');
  if (has('ai', ['high', 'caution'])) domains.push('AI 의존');
  if (has('lonely', ['high'])) domains.push('고립감');
  if (has('rses', ['low'])) domains.push('낮은 자존감');
  if ((latest.cssrs && latest.cssrs.risk >= 2) || (latest.phq9 && JSON.parse(latest.phq9.answers)[8] >= 1)) domains.unshift('자살위험');
  const text = lines.length
    ? `선별검사 ${results.length}회 실시. ${domains.length ? `주요 영역: ${domains.join(', ')}.` : '주요 위험 영역은 확인되지 않음.'} ` +
      (openAlerts.length ? `처리 중인 위기 알림 ${openAlerts.length}건(최고 ${LEVEL_LABEL[openAlerts[0].level]}). ` : '') +
      (moods.length ? `최근 기분 평균 ${(moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)}/5. ` : '') +
      (drawRisk.n ? `그림 ${drawRisk.n}점 제출${drawRisk.r >= 1 ? '(주의 지표 포함)' : ''}.` : '')
    : '아직 실시한 검사가 없습니다.';
  const steps = [];
  if (maxRisk >= 3) steps.push('즉시 연락하여 안전 확인 · 필요 시 보호자/학교/112·119 연계', '자살위험 심층 평가 및 안전계획 수립');
  else if (maxRisk === 2) steps.push('24시간 이내 상담 연결', '정신건강복지센터 또는 정신건강의학과 연계 검토');
  if (domains.some((d) => /스마트폰|게임|AI/.test(d))) steps.push('디지털 사용 일지 + 대체활동 계획(쉼터 미션) 안내, 스마트쉼센터 연계 검토');
  if (domains.includes('도박 문제')) steps.push('한국도박문제예방치유원(1336) 연계, 금전 피해 확인');
  if (domains.includes('고립감')) steps.push('작은 외출 미션·또래 집단 프로그램 연계');
  if (!steps.length) steps.push('정기 마음 점검 권유');
  return { priority, maxRisk, domains, text, steps, latest: lines.map((l) => ({ test: l.test, test_id: l.test_id, score: l.score, level_label: l.level_label, risk: l.risk, created_at: l.created_at })), disclaimer: '자기보고식 선별검사 결과에 근거한 참고 소견이며 임상 진단이 아닙니다.' };
}

admin.get('/users/:id', wrap(async (req, res) => {
  const u = await q.get("SELECT * FROM users WHERE id=? AND role='client'", req.params.id);
  if (!u) throw fail(404, '내담자를 찾을 수 없습니다.');
  const results = (await q.all('SELECT id, test_id, score, level_label, risk, summary, created_at FROM test_results WHERE user_id=? ORDER BY id DESC', u.id)).map((r) => ({ ...r, title: TESTS.find((t) => t.id === r.test_id)?.title }));
  const drawings = (await q.all('SELECT id, task_id, title, status, risk, created_at FROM drawings WHERE user_id=? ORDER BY id DESC', u.id)).map((d) => ({ ...d, task: DRAW_TASKS.find((t) => t.id === d.task_id)?.title }));
  const alerts = await q.all('SELECT a.*, h.name handler FROM alerts a LEFT JOIN users h ON h.id=a.handled_by WHERE a.user_id=? ORDER BY a.id DESC', u.id);
  const sessions = await Promise.all((await q.all('SELECT * FROM chat_sessions WHERE user_id=? ORDER BY id DESC', u.id)).map(async (x) => { const s = await sessionView(x); return { ...s, readable: canReadSession(req.user, s), messages: (await q.get('SELECT COUNT(*) n FROM messages WHERE session_id=?', s.id)).n }; }));
  const moods = await q.all('SELECT score, created_at FROM moods WHERE user_id=? ORDER BY id DESC LIMIT 30', u.id);
  const notes = (await q.all('SELECT n.id, n.body_enc, n.created_at, a.name author FROM staff_notes n JOIN users a ON a.id=n.author_id WHERE n.user_id=? ORDER BY n.id DESC', u.id)).map((n) => ({ id: n.id, body: dec(n.body_enc), created_at: n.created_at, author: n.author }));
  const canBreakGlass = req.user.role === 'admin' && (alerts.some((a) => a.status !== 'resolved' && a.level >= 2) || sessions.some((s) => s.risk >= 2 && s.status !== 'closed'));
  res.json({ user: { ...pubUser(u), guardian_name: u.guardian_name, guardian_phone: u.guardian_phone, created_at: u.created_at, last_login: u.last_login }, summary: await buildSummary(u.id), results, drawings, alerts, sessions, moods, notes, canBreakGlass, grant: hasGrant(req.user.id, u.id) });
}));
admin.post('/users/:id/ai-summary', wrap(async (req, res) => {
  if (!ai.enabled) throw fail(400, 'AI 요약을 사용하려면 서버 .env 에 ANTHROPIC_API_KEY 를 설정하세요.');
  const u = await q.get('SELECT * FROM users WHERE id=?', req.params.id);
  const s = await buildSummary(u.id);
  const draws = (await q.all('SELECT task_id, auto_analysis, created_at FROM drawings WHERE user_id=? ORDER BY id DESC LIMIT 5', u.id)).map((d) => ({ task: d.task_id, counselor_notes: JSON.parse(d.auto_analysis || '{}').counselor, at: d.created_at }));
  const alerts = await q.all('SELECT source, level, reason, status, created_at FROM alerts WHERE user_id=? ORDER BY id DESC LIMIT 10', u.id);
  res.json({ ai: await ai.summarizeClient({ group: GRP_LABEL[u.grp], tests: s.latest, drawings: draws, alerts }) });
}));
admin.post('/users/:id/notes', wrap(async (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, 3000);
  if (!body) throw fail(400, '메모를 입력해 주세요.');
  await q.run('INSERT INTO staff_notes (user_id, author_id, body_enc) VALUES (?,?,?)', req.params.id, req.user.id, enc(body));
  res.json({ ok: true });
}));
admin.post('/users/:id/break-glass', adminOnly, wrap(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5) throw fail(400, '열람 사유를 구체적으로 입력해 주세요. (5자 이상)');
  const uid = Number(req.params.id);
  const ok = await q.get("SELECT 1 FROM alerts WHERE user_id=? AND status!='resolved' AND level>=2", uid) || await q.get("SELECT 1 FROM chat_sessions WHERE user_id=? AND risk>=2 AND status!='closed'", uid);
  if (!ok) throw fail(403, '위험·긴급 단계의 진행 중인 위기 알림이 있을 때만 긴급 열람이 가능합니다.');
  grants.set(`${req.user.id}:${uid}`, Date.now() + 30 * 60000);
  await q.run('INSERT INTO access_logs (staff_id, user_id, target, reason) VALUES (?,?,?,?)', req.user.id, uid, '긴급 열람 권한 발급(30분)', reason.slice(0, 500));
  res.json({ ok: true, expiresInMin: 30 });
}));
admin.get('/users/:id/confidential', adminOnly, wrap(async (req, res) => {
  const uid = Number(req.params.id);
  if (!hasGrant(req.user.id, uid)) throw fail(403, '긴급 열람 권한이 없습니다.');
  await q.run('INSERT INTO access_logs (staff_id, user_id, target, reason) VALUES (?,?,?,?)', req.user.id, uid, '기분 메모·안전계획 열람', '긴급 열람 권한 사용');
  const sp = await q.get('SELECT * FROM safety_plans WHERE user_id=?', uid);
  res.json({
    moods: (await q.all('SELECT score, note_enc, created_at FROM moods WHERE user_id=? ORDER BY id DESC LIMIT 30', uid)).map((m) => ({ score: m.score, note: dec(m.note_enc), created_at: m.created_at })),
    safetyPlan: sp ? JSON.parse(dec(sp.plan_enc) || '{}') : null,
  });
}));

admin.get('/drawings', wrap(async (req, res) => {
  const st = req.query.status || 'submitted';
  const rows = await q.all(`SELECT d.id, d.task_id, d.title, d.status, d.risk, d.created_at, d.user_id, u.name, u.grp FROM drawings d JOIN users u ON u.id=d.user_id WHERE ${st === 'all' ? "d.status!='saved'" : 'd.status=?'} ORDER BY d.risk DESC, d.id DESC LIMIT 200`, ...(st === 'all' ? [] : [st]));
  res.json({ drawings: rows.map((d) => ({ ...d, task: DRAW_TASKS.find((t) => t.id === d.task_id)?.title, grpLabel: GRP_LABEL[d.grp] })) });
}));
admin.post('/drawings/:id/interpret', wrap(async (req, res) => {
  const d = await q.get('SELECT * FROM drawings WHERE id=?', req.params.id);
  if (!d) throw fail(404, '그림을 찾을 수 없습니다.');
  const note = String(req.body.note || '').trim(), msg = String(req.body.client_message || '').trim();
  if (!note && !msg) throw fail(400, '해석 또는 내담자에게 전할 말을 입력해 주세요.');
  await q.run("UPDATE drawings SET counselor_note_enc=?, client_message=?, note_shared=?, counselor_id=?, status='interpreted', interpreted_at=datetime('now','localtime') WHERE id=?", enc(note), msg || null, req.body.share_note ? 1 : 0, req.user.id, d.id);
  const u = await q.get('SELECT * FROM users WHERE id=?', d.user_id);
  push(u.id, 'drawing-interpreted', { id: d.id });
  let mailed = false;
  if (req.body.send_email) {
    const task = DRAW_TASKS.find((t) => t.id === d.task_id);
    const m = await mailer.send(u.email, `[마음결] 그림 해석이 도착했어요 — ${task.title}`, mailer.layout(`그림 해석 — ${task.title}`, `
      <p>${mailer.esc(u.name)} 님, ${mailer.esc(d.created_at)}에 그린 그림을 상담 선생님이 살펴보았어요.</p>
      <img src="cid:drawing" style="width:100%;border-radius:14px;border:1px solid #eee">
      ${msg ? `<p style="margin-top:14px;padding:14px;background:#F2F7F3;border-radius:12px">${mailer.esc(msg).replace(/\n/g, '<br>')}</p>` : ''}
      ${note && req.body.share_note ? `<p><b>해석</b><br>${mailer.esc(note).replace(/\n/g, '<br>')}</p>` : ''}`), [{ filename: 'drawing.png', content: readDrawingPng(d), cid: 'drawing' }]);
    mailed = m.ok;
  }
  res.json({ ok: true, mailed });
}));

admin.get('/outbox', adminOnly, wrap(async (req, res) => res.json({ mails: await q.all('SELECT id, to_addr, subject, status, error, created_at FROM outbox ORDER BY id DESC LIMIT 100') })));
admin.get('/outbox/:id', adminOnly, wrap(async (req, res) => { const m = await q.get('SELECT * FROM outbox WHERE id=?', req.params.id); res.type('html').send(m ? m.html : '없음'); }));
admin.get('/logs', adminOnly, wrap(async (req, res) => res.json({ logs: await q.all('SELECT l.*, s.name staff, u.name client FROM access_logs l JOIN users s ON s.id=l.staff_id JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 300') })));
admin.get('/staff', adminOnly, wrap(async (req, res) => res.json({ staff: await q.all("SELECT id, name, email, phone, role, active, last_login FROM users WHERE role IN ('counselor','admin') ORDER BY role, id") })));
admin.post('/staff', adminOnly, wrap(async (req, res) => {
  const email = emailNorm(req.body.email), phone = phoneNorm(req.body.phone), role = req.body.role === 'admin' ? 'admin' : 'counselor';
  if (!email || !phone || !req.body.name) throw fail(400, '이름, 메일, 연락처를 모두 입력해 주세요.');
  const ex = await q.get('SELECT * FROM users WHERE email=?', email);
  if (ex) await q.run('UPDATE users SET role=?, active=1 WHERE id=?', role, ex.id);
  else await q.run('INSERT INTO users (email, phone, name, grp, role) VALUES (?,?,?,?,?)', email, phone, String(req.body.name).slice(0, 30), 'adult', role);
  res.json({ ok: true });
}));
admin.post('/staff/:id/toggle', adminOnly, wrap(async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw fail(400, '본인 계정은 비활성화할 수 없습니다.');
  await q.run('UPDATE users SET active=1-active WHERE id=?', req.params.id);
  res.json({ ok: true });
}));
app.use('/api/admin', admin);

app.use('/api', (req, res) => res.status(404).json({ error: '없는 경로입니다.' }));
app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? '보내는 데이터가 너무 커요.' : '서버에서 오류가 났어요. 잠시 후 다시 시도해 주세요.' }); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

if (require.main === module) boot.then(() => {
  const server = app.listen(PORT, () => {
    console.log(`\n🌿 마음결 서버 실행 중 → http://localhost:${PORT}`);
    console.log(`   AI 상담사: ${counselor.provider()}`);
    console.log(`   주소: ${mailer.BASE_URL}`);
    console.log(`   메일: ${mailer.provider === 'brevo' ? 'Brevo API 발송' : mailer.provider === 'smtp' ? 'SMTP 발송' : '개발 모드(관리자 메일함에 저장, 인증번호는 화면에 표시)'} · AI 해석: ${ai.enabled ? '사용 (' + ai.MODEL + ')' : '미사용'}\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') { console.log(`🌿 마음결 서버가 이미 ${PORT}번 포트에서 실행 중이에요. 브라우저에서 새로고침해 보세요.`); process.exit(0); }
    throw err;
  });
}).catch((e) => { console.error('[시작 실패] 데이터베이스에 연결하지 못했습니다:', e.message); process.exit(1); });
module.exports = { app, createAlert, boot };
