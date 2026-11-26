// 데모 데이터 만들기: node scripts/seed.js  (개발 모드에서만 — SMTP 미설정 상태)
require('../server/env');
const { app, boot } = require('../server/index');
const { q } = require('../server/db');

(async () => {
  await boot;
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const login = async (email, phone) => {
    const r = await (await fetch(base + '/auth/request-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, phone }) })).json();
    if (!r.devCode) throw new Error('개발 모드가 아니어서 데모 데이터를 만들 수 없습니다: ' + JSON.stringify(r));
    await q.run('UPDATE login_codes SET sent_at=0 WHERE email=?', email);
    const v = await fetch(base + '/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, phone, code: r.devCode }) });
    const cookie = v.headers.get('set-cookie').split(';')[0];
    return (path, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) }).then((x) => x.json());
  };
  const signup = async (u) => {
    if (!(await q.get('SELECT 1 FROM users WHERE email=?', u.email))) {
      const r = await (await fetch(base + '/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...u, consent: { privacy: true, sensitive: true, crisis: true, guardian: true } }) })).json();
      if (r.error) throw new Error(r.error);
      await q.run('UPDATE login_codes SET sent_at=0 WHERE email=?', u.email);
    }
    return login(u.email, u.phone.replace(/\D/g, ''));
  };
  if (!(await q.get("SELECT 1 FROM users WHERE email='counselor@maeumgyeol.local'")))
    await q.run("INSERT INTO users (email, phone, name, grp, role) VALUES ('counselor@maeumgyeol.local','01011112222','김하늘 상담사','adult','counselor')");

  const a = await signup({ name: '서준', email: 'seojun@demo.kr', phone: '010-2000-0001', grp: 'high', birth_year: 2009 });
  await a('/tests/phq9', { answers: [2, 3, 2, 3, 1, 3, 2, 1, 1] });
  await a('/tests/game', { answers: [5, 5, 4, 5, 5, 5, 3, 5, 4] });
  await a('/tests/lonely', { answers: [3, 3, 3, 1, 1] });
  await a('/moods', { score: 1, note: '아무도 날 이해 못하는 것 같아' });
  const s = await a('/chat/sessions', { topic: '게임·스마트폰을 줄이고 싶어요' });
  await a(`/chat/sessions/${s.session.id}/messages`, { body: '밤새 게임하고 학교도 안 갔어요.' });
  await a(`/chat/sessions/${s.session.id}/messages`, { body: '요즘은 그냥 다 포기하고 싶어요.' });

  const b = await signup({ name: '민지', email: 'minji@demo.kr', phone: '010-2000-0002', grp: 'middle', birth_year: 2012 });
  await b('/tests/smartphone', { answers: [3, 3, 3, 3, 2, 3, 2, 2, 1, 3] });
  await b('/tests/ai', { answers: [4, 3, 3, 4, 3, 3, 2, 3, 2, 1] });
  await b('/moods', { score: 3, note: '' });

  const c = await signup({ name: '이선생', email: 'teacher.lee@demo.kr', phone: '010-2000-0003', grp: 'teacher', birth_year: 1985, teacher_code: 'maum2026' });
  await c('/tests/k6', { answers: [3, 2, 3, 2, 4, 2] });
  await c('/tests/gad7', { answers: [2, 2, 3, 2, 1, 2, 1] });

  const d = await signup({ name: '도윤', email: 'doyun@demo.kr', phone: '010-2000-0004', grp: 'adult', birth_year: 2001 });
  await d('/tests/gambling', { answers: [2, 2, 3, 2, 2, 1, 2, 2, 3] });
  await d('/tests/cssrs', { answers: [1, 1, 0, 0, 0, 0, 0] });

  const e = await signup({ name: '하린', email: 'harin@demo.kr', phone: '010-2000-0005', grp: 'elem', birth_year: 2016, guardian_name: '하린 어머니', guardian_phone: '010-3000-0005' });
  await e('/tests/child_weather', { answers: [1, 0, 1, 1, 0, 0, 2, 1, 0, 0] });

  console.log('데모 데이터 생성 완료');
  console.log('  관리자   admin@maeumgyeol.local / 010-0000-0000');
  console.log('  상담사   counselor@maeumgyeol.local / 010-1111-2222');
  console.log('  내담자   seojun@demo.kr / 010-2000-0001 (고위험 예시)');
  srv.close(); process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
