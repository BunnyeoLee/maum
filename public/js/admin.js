// 관리자·상담사 콘솔
import { state, api, e, $, $$, toast, modal, confirmBox, on, beep, riskPill, fmtTime, sparkline, fmtPhone } from './core.js';

const SRC = { test: '심리검사', chat: '채팅 상담', drawing: '그림', sos: 'SOS 요청', mood: '기분 기록' };
const LV = { 1: '관심', 2: '위험', 3: '긴급' };
const ST = { new: '새 알림', ack: '확인함', resolved: '해결' };
let bound = false;

function bindStaff() {
  if (bound) return; bound = true;
  on('alert', (a) => {
    if (a.status === 'new' && a.level >= 2) {
      beep();
      toast(`[${LV[a.level]}] ${a.name} 님 — ${a.reason}`, 'alert');
      if (Notification?.permission === 'granted') new Notification(`마음결 ${LV[a.level]} 알림`, { body: `${a.name}: ${a.reason}` });
    }
    refreshBadges();
  });
  on('session', () => refreshBadges());
  on('drawing', (d) => { toast(`${d.name} 님이 그림을 보냈어요.`); refreshBadges(); });
  if (window.Notification && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

async function refreshBadges() {
  const o = await api('/admin/overview').catch(() => null);
  if (!o) return;
  const set = (k, n, soft) => { const el = $(`[data-cnt="${k}"]`); if (el) { el.textContent = n; el.className = `cnt ${soft ? 'soft' : ''}`; el.hidden = !n; } };
  set('alerts', o.alerts[3] + o.alerts[2]); set('chats', o.chatsWaiting); set('drawings', o.drawingsPending, true);
  return o;
}

export async function renderAdmin(app, parts, params, onRoute) {
  bindStaff();
  const isAdmin = state.user.role === 'admin';
  const cur = parts[0] || '';
  app.innerHTML = `<div class="console">
    <nav class="side-nav">
      <a href="#/admin" class="${cur === '' ? 'on' : ''}">한눈에 보기</a>
      <a href="#/admin/alerts" class="${cur === 'alerts' ? 'on' : ''}">위기 알림 <span data-cnt="alerts" hidden></span></a>
      <a href="#/admin/clients" class="${cur === 'clients' ? 'on' : ''}">내담자</a>
      <a href="#/admin/chats" class="${cur === 'chats' ? 'on' : ''}">채팅 상담 <span data-cnt="chats" hidden></span></a>
      <a href="#/admin/drawings" class="${cur === 'drawings' ? 'on' : ''}">그림 해석 <span data-cnt="drawings" hidden></span></a>
      ${isAdmin ? `<h4>관리</h4><a href="#/admin/staff" class="${cur === 'staff' ? 'on' : ''}">상담사 관리</a><a href="#/admin/logs" class="${cur === 'logs' ? 'on' : ''}">열람 기록</a><a href="#/admin/outbox" class="${cur === 'outbox' ? 'on' : ''}">보낸 메일</a>` : ''}
    </nav><div id="pane"></div></div>`;
  const pane = $('#pane');
  const o = await refreshBadges();
  const views = { '': overview, alerts, clients, chats, drawings, staff, logs, outbox };
  await (views[cur] || overview)(pane, parts.slice(1), params, onRoute, o);
}

// ── 한눈에 보기 ──
async function overview(pane, _p, _q, onRoute, o) {
  o ||= await api('/admin/overview');
  const { alerts: open } = await api('/admin/alerts?status=open');
  const maxT = Math.max(1, ...o.byTest.map((t) => t.n)), maxG = Math.max(1, ...o.byGroup.map((g) => g.n));
  pane.innerHTML = `<h1 style="font-size:1.8rem">안녕하세요, ${e(state.user.name)} 님</h1>
    ${o.devMail ? '<p class="devnote">메일 서버(SMTP)가 설정되지 않아 개발 모드로 동작 중이에요. 보낸 메일은 "보낸 메일"에 저장되고, 인증번호는 로그인 화면에 표시됩니다.</p>' : ''}
    <div class="stats" style="margin-top:14px">
      <a class="stat ${o.alerts[3] ? 'hot' : ''}" href="#/admin/alerts" style="text-decoration:none;color:inherit"><span>긴급 알림</span><b>${o.alerts[3]}</b></a>
      <a class="stat" href="#/admin/alerts" style="text-decoration:none;color:inherit"><span>위험 알림</span><b>${o.alerts[2]}</b></a>
      <div class="stat"><span>관심 알림</span><b>${o.alerts[1]}</b></div>
      <a class="stat" href="#/admin/chats" style="text-decoration:none;color:inherit"><span>상담 대기</span><b>${o.chatsWaiting}</b></a>
      <a class="stat" href="#/admin/drawings" style="text-decoration:none;color:inherit"><span>해석 대기 그림</span><b>${o.drawingsPending}</b></a>
      <div class="stat"><span>전체 내담자</span><b>${o.clients}</b><span class="tiny">이번 주 +${o.newClients7}</span></div>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="panel"><div class="section-head"><h3 style="margin:0">지금 살펴야 할 사람</h3><a class="small" href="#/admin/alerts">모두 보기</a></div>
        ${open.filter((a) => a.level >= 2).slice(0, 6).map((a) => `<a class="row" href="#/admin/clients/${a.user_id}" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit">
          <span>${riskPill(a.level)} <b>${e(a.name)}</b> <span class="tiny">${e(a.grpLabel)}</span><br><span class="small muted">${e(a.reason.slice(0, 60))}</span></span><span class="tiny">${fmtTime(a.created_at)}</span></a>`).join('') || '<p class="small muted">위험 단계 이상의 처리 중인 알림이 없어요.</p>'}</div>
      <div class="panel"><h3>최근 30일 검사 실시</h3><div class="bars">${o.byTest.map((t) => `<div class="b"><span class="small">${e(t.title)}</span><i style="width:${(t.n / maxT) * 100}%"></i><span class="tiny">${t.n}${t.risky ? ` · 위험 ${t.risky}` : ''}</span></div>`).join('') || '<p class="small muted">기록 없음</p>'}</div>
        <h3 style="margin-top:18px">대상별 내담자</h3><div class="bars">${o.byGroup.map((g) => `<div class="b"><span class="small">${e(g.label)}</span><i class="v" style="width:${(g.n / maxG) * 100}%"></i><span class="tiny">${g.n}</span></div>`).join('')}</div></div>
    </div>`;
  onRoute(on('alert', () => location.hash === '#/admin' && overview(pane, [], null, onRoute)));
}

// ── 위기 알림 ──
async function alerts(pane, _p, params, onRoute) {
  const st = params.get('s') || 'open';
  const { alerts } = await api(`/admin/alerts?status=${st}`);
  pane.innerHTML = `<div class="section-head"><h1 style="font-size:1.8rem;margin:0">위기 알림</h1>
    <div class="seg">${[['open', '처리 중'], ['resolved', '해결됨'], ['all', '전체']].map(([k, l]) => `<label><input type="radio" name="s" value="${k}" ${st === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
    <p class="small muted">긴급(3)·위험(2) 알림은 실시간으로 울리고 관리자 메일로도 전달돼요. 확인 후 연락·연계 내용을 메모로 남기고 해결 처리하세요.</p>
    <div class="grid" style="gap:10px">${alerts.map((a) => `
      <div class="alert-card l${a.level} ${a.status}">
        <div class="bar"></div>
        <div class="body"><div class="row">${riskPill(a.level)}<span class="pill">${SRC[a.source] || a.source}</span><span class="pill ${a.status === 'new' ? 'r2' : ''}">${ST[a.status]}</span><span class="tiny">${fmtTime(a.created_at)}</span></div>
          <div style="margin-top:6px"><a href="#/admin/clients/${a.user_id}"><b>${e(a.name)}</b></a> <span class="tiny">${e(a.grpLabel)}</span></div>
          <div class="small">${e(a.reason)}</div>
          ${a.level >= 2 ? `<div class="tiny" style="margin-top:4px">연락처 <a href="tel:${e(a.phone)}">${e(fmtPhone(a.phone))}</a> · ${e(a.email)}${a.guardian_phone ? ` · 보호자 ${e(a.guardian_name || '')} <a href="tel:${e(a.guardian_phone)}">${e(fmtPhone(a.guardian_phone))}</a>` : ''}</div>` : ''}
          ${a.note ? `<div class="small" style="margin-top:6px;background:var(--mist);padding:6px 10px;border-radius:8px">메모: ${e(a.note)} <span class="tiny">— ${e(a.handler || '')}</span></div>` : ''}</div>
        <div class="acts">${a.status === 'new' ? `<button class="btn sm" data-ack="${a.id}">확인했어요</button>` : ''}${a.status !== 'resolved' ? `<button class="btn soft sm" data-res="${a.id}">해결 처리</button>` : `<button class="btn soft sm" data-reopen="${a.id}">다시 열기</button>`}</div>
      </div>`).join('') || '<div class="panel empty"><div class="ico">🕊️</div><p>표시할 알림이 없어요.</p></div>'}</div>`;
  $$('input[name=s]', pane).forEach((r) => r.onchange = () => (location.hash = `#/admin/alerts?s=${r.value}`));
  const set = async (id, status, note) => { await api(`/admin/alerts/${id}`, { body: { status, note } }); alerts(pane, [], params, () => {}); refreshBadges(); };
  $$('[data-ack]', pane).forEach((b) => b.onclick = () => set(b.dataset.ack, 'ack'));
  $$('[data-reopen]', pane).forEach((b) => b.onclick = () => set(b.dataset.reopen, 'new'));
  $$('[data-res]', pane).forEach((b) => b.onclick = () => {
    const m = modal(`<h3>해결 처리</h3><p class="small muted">어떤 조치를 했는지 남겨 주세요. (예: 전화로 안전 확인, 보호자 연락, 정신건강복지센터 연계)</p>
      <textarea class="input" id="rn" rows="4"></textarea><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn soft" data-close>취소</button><button class="btn" id="rok">해결 처리</button></div>`);
    $('#rok', m.el).onclick = async () => { await set(b.dataset.res, 'resolved', $('#rn', m.el).value); m.close(); };
  });
  onRoute(on('alert', () => location.hash.startsWith('#/admin/alerts') && alerts(pane, [], params, () => {})));
}

// ── 내담자 ──
async function clients(pane, [id], params, onRoute) {
  if (id) return clientDetail(pane, id, onRoute);
  const kw = params.get('q') || '';
  const { users } = await api(`/admin/users?q=${encodeURIComponent(kw)}`);
  pane.innerHTML = `<div class="section-head"><h1 style="font-size:1.8rem;margin:0">내담자</h1>
    <form id="sq" class="row"><input class="input" name="q" value="${e(kw)}" placeholder="이름, 메일, 연락처" style="width:220px"><button class="btn soft sm">찾기</button></form></div>
    <div class="tablewrap" style="margin-top:12px"><table class="t"><thead><tr><th>이름</th><th>구분</th><th>현재 상태</th><th>최근 30일 최고 위험</th><th>검사</th><th>그림</th><th>마지막 접속</th></tr></thead>
    <tbody>${users.map((u) => `<tr class="click" data-id="${u.id}"><td><b>${e(u.name)}</b><div class="tiny">${e(u.email)}</div></td><td>${e(u.grpLabel)}</td>
      <td>${u.open_level ? riskPill(u.open_level, `${LV[u.open_level]} 알림 ${u.open_alerts}`) : '<span class="tiny">알림 없음</span>'}</td>
      <td>${u.risk30 != null ? riskPill(u.risk30) : '<span class="tiny">-</span>'}</td><td>${u.tests}</td><td>${u.drawings}</td><td class="tiny">${fmtTime(u.last_login) || '-'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">내담자가 없어요.</td></tr>'}</tbody></table></div>`;
  $('#sq', pane).onsubmit = (ev) => { ev.preventDefault(); location.hash = `#/admin/clients?q=${encodeURIComponent(ev.target.q.value)}`; };
  $$('tr[data-id]', pane).forEach((tr) => tr.onclick = () => (location.hash = `#/admin/clients/${tr.dataset.id}`));
}

async function clientDetail(pane, id, onRoute) {
  const d = await api(`/admin/users/${id}`);
  const u = d.user, s = d.summary;
  const moods = d.moods.slice().reverse().map((m) => m.score);
  pane.innerHTML = `<a href="#/admin/clients" class="small">내담자 목록</a>
    <div class="section-head" style="margin-top:6px"><h1 style="font-size:1.8rem;margin:0">${e(u.name)} <span class="tiny">${e(u.grpLabel)}${u.birth_year ? ` · ${u.birth_year}년생` : ''}</span></h1></div>
    <dl class="kv"><dt>연락처</dt><dd><a href="tel:${e(u.phone)}">${e(fmtPhone(u.phone))}</a> · ${e(u.email)}</dd>${u.guardian_phone ? `<dt>보호자</dt><dd>${e(u.guardian_name || '')} <a href="tel:${e(u.guardian_phone)}">${e(fmtPhone(u.guardian_phone))}</a></dd>` : ''}<dt>가입 · 접속</dt><dd>${fmtTime(u.created_at)} · ${fmtTime(u.last_login) || '-'}</dd></dl>

    <div class="panel summary-card p${s.maxRisk}" style="margin-top:16px">
      <div class="section-head"><h3 style="margin:0">상태 요약과 참고 소견</h3><span class="row">${riskPill(s.maxRisk, '우선순위 ' + s.priority)}${state.ai ? '<button class="btn soft sm" id="aiSum">AI 요약</button>' : ''}</span></div>
      ${s.domains.length ? `<div class="row" style="margin-bottom:8px">${s.domains.map((x) => `<span class="pill ${x === '자살위험' ? 'r3' : 'r1'}">${e(x)}</span>`).join('')}</div>` : ''}
      <p>${e(s.text)}</p>
      <b class="small">권고 조치</b><ul class="clean small">${s.steps.map((x) => `<li>${e(x)}</li>`).join('')}</ul>
      <div id="aiOut"></div>
      <p class="tiny" style="margin:8px 0 0">${e(s.disclaimer)}</p></div>

    <div class="grid g2" style="margin-top:14px">
      <div class="panel"><h3>검사별 최근 결과</h3>${s.latest.length ? `<table class="t" style="border:0"><tbody>${s.latest.map((l) => `<tr><td class="small">${e(l.test)}</td><td>${riskPill(l.risk, l.level_label)}</td><td class="small">${l.score}점</td><td class="tiny">${fmtTime(l.created_at)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">검사 기록 없음</p>'}
        <details style="margin-top:8px"><summary class="small" style="cursor:pointer">전체 검사 이력 (${d.results.length})</summary><ul class="clean small">${d.results.map((r) => `<li>${fmtTime(r.created_at)} ${e(r.title)} — ${e(r.level_label)} (${r.score})</li>`).join('')}</ul></details></div>
      <div class="panel"><h3>마음 날씨</h3>${moods.length ? sparkline(moods, { w: 300, h: 70 }) : '<p class="small muted">기록 없음</p>'}
        <p class="tiny">기분 메모 내용은 비밀보장 대상이에요.</p>
        <h3 style="margin-top:12px">그림 ${d.drawings.length}점</h3>
        <div class="thumbs" style="grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px">${d.drawings.filter((x) => x.status !== 'saved').slice(0, 8).map((x) => `<a class="thumb" href="#/admin/drawings/${x.id}" title="${e(x.task)}"><img loading="lazy" src="/api/drawings/${x.id}/image" alt="${e(x.task)}"></a>`).join('')}</div></div>
    </div>

    <div class="panel" style="margin-top:14px"><h3>채팅 상담</h3>
      ${d.sessions.map((c) => `<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
        <span><b class="small">${e(c.topic)}</b> ${c.risk >= 2 ? riskPill(c.risk, '위기 표현 감지') : ''} <span class="tiny">${fmtTime(c.created_at)} · ${c.messages}개 메시지 · ${e(c.counselor_name || '미배정')} · ${{ waiting: '대기', active: '진행 중', closed: '종료' }[c.status]}</span></span>
        ${c.readable ? `<a class="btn soft sm" href="#/admin/chats/${c.id}">대화 보기</a>` : '<span class="lock">🔒 비밀보장</span>'}</div>`).join('') || '<p class="small muted">상담 기록 없음</p>'}
      ${state.user.role === 'admin' ? (d.grant ? `<div class="devnote" style="margin-top:10px">긴급 열람 권한이 활성화되어 있어요(30분). 모든 열람은 기록됩니다. <button class="btn sm coral" id="conf">기분 메모·안전계획 보기</button></div>`
        : d.canBreakGlass ? `<div class="lock" style="margin-top:10px;justify-content:space-between;background:var(--coral-l)"><span>위험·긴급 상황이 진행 중이에요. 생명 보호를 위해 필요하면 사유를 기록하고 상담 내용을 열람할 수 있어요.</span><button class="btn coral sm" id="bg">긴급 열람 요청</button></div>`
          : '<p class="tiny" style="margin-top:8px">상담 내용은 위험·긴급 알림이 진행 중일 때만 관리자가 사유를 기록하고 열람할 수 있어요.</p>') : ''}
      <div id="confOut"></div></div>

    <div class="grid g2" style="margin-top:14px">
      <div class="panel"><h3>알림 이력</h3>${d.alerts.map((a) => `<div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)">${riskPill(a.level)} <span class="pill">${SRC[a.source]}</span> ${e(a.reason)} <span class="tiny">${fmtTime(a.created_at)} · ${ST[a.status]}${a.note ? ' · ' + e(a.note) : ''}</span></div>`).join('') || '<p class="small muted">알림 없음</p>'}</div>
      <div class="panel"><h3>상담자 메모</h3><form id="nf"><textarea class="input" name="body" rows="3" placeholder="관찰, 연락 기록, 다음 회기 계획 (암호화 저장)"></textarea><button class="btn sm" style="margin-top:8px">메모 남기기</button></form>
        ${d.notes.map((n) => `<div class="small" style="padding:8px 0;border-bottom:1px solid var(--line);white-space:pre-wrap">${e(n.body)}<div class="tiny">${e(n.author)} · ${fmtTime(n.created_at)}</div></div>`).join('')}</div>
    </div>`;
  const ai = $('#aiSum', pane);
  if (ai) ai.onclick = async () => {
    ai.disabled = true; $('#aiOut', pane).innerHTML = '<p class="small muted">AI가 요약하고 있어요…</p>';
    try { const { ai: r } = await api(`/admin/users/${id}/ai-summary`, { body: {} });
      $('#aiOut', pane).innerHTML = `<div class="panel" style="background:var(--violet-l);border-color:transparent;margin-top:10px"><b class="small">AI 요약 (우선순위 ${e(r.priority)})</b><p class="small">${e(r.summary)}</p><div class="small"><b>우려</b>: ${r.concerns.map(e).join(', ')}<br><b>보호요인</b>: ${r.strengths.map(e).join(', ')}<br><b>권고</b>: ${r.next_steps.map(e).join(' / ')}</div></div>`;
    } catch (err) { $('#aiOut', pane).innerHTML = `<p class="err">${e(err.message)}</p>`; }
  };
  $('#nf', pane).onsubmit = async (ev) => { ev.preventDefault(); await api(`/admin/users/${id}/notes`, { body: { body: ev.target.body.value } }); toast('메모를 남겼어요.', 'ok'); clientDetail(pane, id, onRoute); };
  const bg = $('#bg', pane);
  if (bg) bg.onclick = () => {
    const m = modal(`<h3>긴급 열람 요청</h3><p class="small">이 기능은 내담자의 생명과 안전을 지키기 위해서만 사용해야 해요. 열람 사유, 열람자, 시각이 모두 기록되며 30분 동안만 유효해요.</p>
      <label class="field"><span>열람 사유</span><textarea class="input" id="bgr" rows="3" placeholder="예: PHQ-9 9번 양성 및 채팅에서 자살 사고 표현, 안전 확인 전 맥락 파악 필요"></textarea></label>
      <div class="err" id="bge"></div><div class="row" style="justify-content:flex-end"><button class="btn soft" data-close>취소</button><button class="btn coral" id="bgok">사유를 기록하고 열람</button></div>`);
    $('#bgok', m.el).onclick = async () => {
      try { await api(`/admin/users/${id}/break-glass`, { body: { reason: $('#bgr', m.el).value } }); m.close(); toast('긴급 열람 권한이 30분간 활성화되었어요.', 'ok'); clientDetail(pane, id, onRoute); }
      catch (err) { $('#bge', m.el).textContent = err.message; }
    };
  };
  const conf = $('#conf', pane);
  if (conf) conf.onclick = async () => {
    const c = await api(`/admin/users/${id}/confidential`);
    $('#confOut', pane).innerHTML = `<div class="grid g2" style="margin-top:10px"><div><b class="small">기분 메모</b>${c.moods.filter((m) => m.note).map((m) => `<div class="small" style="padding:5px 0;border-bottom:1px solid var(--line)">${['🌧️', '🌥️', '⛅', '🌤️', '☀️'][m.score - 1] || ''} ${e(m.note)} <span class="tiny">${fmtTime(m.created_at)}</span></div>`).join('') || '<p class="tiny">없음</p>'}</div>
      <div><b class="small">안전계획</b>${c.safetyPlan ? Object.entries(c.safetyPlan).map(([k, v]) => v ? `<div class="small" style="white-space:pre-wrap;padding:4px 0"><b>${e(k)}</b>: ${e(v)}</div>` : '').join('') : '<p class="tiny">작성하지 않음</p>'}</div></div>`;
  };
}

// ── 채팅 상담 ──
async function chats(pane, [sid], _q, onRoute) {
  const { sessions } = await api('/chat/sessions');
  pane.innerHTML = `<h1 style="font-size:1.8rem">채팅 상담</h1><div class="chat-console"><div id="slist"></div><div id="sroom"><div class="panel empty"><div class="ico">💬</div><p>왼쪽에서 상담을 선택하세요. 대기 중인 상담은 '맡기'를 눌러 배정받을 수 있어요.</p></div></div></div>`;
  const list = () => {
    $('#slist', pane).innerHTML = sessions.map((s) => `<button class="sess ${String(s.id) === sid ? 'on' : ''}" data-id="${s.id}">
      <div class="row" style="justify-content:space-between"><b class="small">${e(s.client_name)}</b>${s.risk >= 2 ? riskPill(s.risk, '위기') : ''}</div>
      <div class="small">${e(s.topic)}</div><div class="tiny">${{ waiting: '⏳ 대기 중 · AI 응대 중', active: `상담 중 · ${e(s.counselor_name)}${s.ai_active ? ' + AI' : ''}`, closed: '종료' }[s.status]} · ${fmtTime(s.last_at)}</div></button>`).join('') || '<p class="small muted">진행 중인 상담이 없어요.</p>';
    $$('.sess', pane).forEach((b) => b.onclick = () => (location.hash = `#/admin/chats/${b.dataset.id}`));
  };
  list();
  onRoute(on('session', (s) => { const i = sessions.findIndex((x) => x.id === s.id); if (i >= 0) sessions[i] = { ...sessions[i], ...s }; else sessions.unshift(s); list(); }));
  if (!sid) return;
  const s = sessions.find((x) => String(x.id) === sid) || { id: Number(sid) };
  const room = $('#sroom', pane);
  if (s.status === 'waiting' && !s.counselor_id) {
    room.innerHTML = `<div class="panel"><h3>${e(s.client_name)} 님의 상담 요청</h3><p>주제: ${e(s.topic)}</p><p class="small muted">상담을 맡으면 대화 내용을 볼 수 있어요. 비밀보장 원칙에 따라 담당 상담사만 대화에 참여합니다.</p><button class="btn" id="claim">이 상담 맡기</button></div>`;
    $('#claim', room).onclick = async () => { await api(`/chat/sessions/${s.id}/claim`, { body: {} }); chats(pane, [sid], null, onRoute); };
    return;
  }
  let data;
  try { data = await api(`/chat/sessions/${sid}/messages`); }
  catch (err) { room.innerHTML = `<div class="panel"><div class="lock">🔒 ${e(err.message)}</div></div>`; return; }
  const mine = data.session.counselor_id === state.user.id;
  room.innerHTML = `<div class="chat"><div class="chat-head"><div><b>${e(data.session.client_name)}</b> <span class="tiny">${e(data.session.client_grp)} · ${e(data.session.topic)}</span>${!mine ? '<div class="tiny" style="color:var(--coral)">긴급 열람 중 — 이 열람은 기록됩니다</div>' : ''}</div>
    <div class="row">${data.session.status !== 'closed' && mine ? `<button class="btn soft sm" id="aiT">${data.session.ai_active ? 'AI 응대 끄기' : 'AI 응대 켜기'}</button>` : ''}<a class="btn soft sm" href="#/admin/clients/${data.session.user_id}">내담자 정보</a>${data.session.status !== 'closed' && mine ? '<button class="btn soft sm" id="endS">종료</button>' : ''}</div></div>
    <div class="chat-body" id="cb"></div><div class="typing hidden" id="typing"><span></span><span></span><span></span> AI 상담사가 답장을 쓰고 있어요</div>
    ${data.session.status !== 'closed' && mine ? `<form class="chat-input" id="cf"><textarea class="input" id="ct" rows="1" placeholder="공감하며 천천히 답해 주세요"></textarea><button class="btn">보내기</button></form>` : ''}</div>`;
  const cb = $('#cb', room);
  const add = (m) => {
    if ($(`[data-mid="${m.id}"]`, cb)) return;
    const d = document.createElement('div'); d.dataset.mid = m.id;
    d.className = `bub ${m.sender_role === 'system' ? 'sys' : m.sender_role === 'client' ? 'them' : m.sender_role === 'ai' ? 'me ai' : 'me'} ${m.risk >= 2 ? 'flag' : ''}`;
    d.innerHTML = `${m.sender_role === 'ai' ? '<b class="who">🌿 AI 상담사</b>' : ''}${e(m.body)}${m.sender_role !== 'system' ? `<small>${fmtTime(m.created_at).split(' ').pop()}${m.risk >= 2 ? ' · ⚠ 위기 표현 감지' : ''}</small>` : ''}`;
    cb.appendChild(d); cb.scrollTop = cb.scrollHeight;
  };
  data.messages.forEach(add);
  onRoute(on('message', (m) => { if (m.session_id === data.session.id) { add(m); $('#typing', room).classList.add('hidden'); } }));
  onRoute(on('typing', (t) => t.session_id === data.session.id && $('#typing', room).classList.toggle('hidden', !t.on)));
  const aiT = $('#aiT', room);
  if (aiT) aiT.onclick = async () => { await api(`/chat/sessions/${sid}/ai`, { body: { on: !data.session.ai_active } }); chats(pane, [sid], null, onRoute); };
  const f = $('#cf', room);
  if (f) {
    const ta = $('#ct', room);
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); f.requestSubmit(); } });
    f.onsubmit = async (ev) => { ev.preventDefault(); const body = ta.value.trim(); if (!body) return; ta.value = ''; const r = await api(`/chat/sessions/${sid}/messages`, { body: { body } }); add(r.message); };
    $('#endS', room).onclick = async () => { if (await confirmBox('상담을 종료할까요?', '내담자에게 종료 안내가 전달돼요.', '종료')) { await api(`/chat/sessions/${sid}/close`, { body: {} }); chats(pane, [sid], null, onRoute); } };
  }
}

// ── 그림 해석 ──
async function drawings(pane, [id], params) {
  if (id) return drawingReview(pane, id);
  const st = params.get('s') || 'submitted';
  const { drawings: list } = await api(`/admin/drawings?status=${st}`);
  pane.innerHTML = `<div class="section-head"><h1 style="font-size:1.8rem;margin:0">그림 해석</h1>
    <div class="seg">${[['submitted', '해석 대기'], ['interpreted', '해석 완료'], ['all', '전체']].map(([k, l]) => `<label><input type="radio" name="s" value="${k}" ${st === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
    <div class="thumbs" style="margin-top:14px">${list.map((d) => `<a class="thumb" href="#/admin/drawings/${d.id}"><img loading="lazy" src="/api/drawings/${d.id}/image" alt=""><div><b class="small">${e(d.name)}</b> <span class="tiny">${e(d.grpLabel)}</span><div class="row" style="margin-top:4px"><span class="pill v">${e(d.task)}</span>${d.risk ? riskPill(d.risk, '주의') : ''}</div><div class="tiny">${fmtTime(d.created_at)}</div></div></a>`).join('') || '<div class="panel empty">해당하는 그림이 없어요.</div>'}</div>`;
  $$('input[name=s]', pane).forEach((r) => r.onchange = () => (location.hash = `#/admin/drawings?s=${r.value}`));
}

async function drawingReview(pane, id) {
  const { drawing: d } = await api(`/drawings/${id}`);
  const m = d.meta || {};
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  pane.innerHTML = `<a href="#/admin/drawings" class="small">그림 목록</a>
    <div class="grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px;margin-top:10px" id="dr">
      <div><img class="drawing-big" src="/api/drawings/${d.id}/image" alt="">
        <div class="panel" style="margin-top:12px"><h3>그리기 과정 지표</h3><dl class="kv small">
          <dt>소요 시간</dt><dd>${Math.round((m.duration || 0) / 60)}분 ${(m.duration || 0) % 60}초 (실제 그리기 ${m.drawTime || 0}초)</dd>
          <dt>획 · 지우기 · 되돌리기</dt><dd>${m.strokes || 0} · ${m.erases || 0} · ${m.undos || 0}${m.clears ? ` · 전체 지우기 ${m.clears}회` : ''}</dd>
          <dt>화면 사용</dt><dd>채움 ${pct(m.coverage)} · 그림 영역 ${pct(m.bboxRatio)}${m.center ? ` · 중심 (${pct(m.center.x)}, ${pct(m.center.y)})` : ''}</dd>
          <dt>색 분포</dt><dd>어두운색 ${pct(m.darkRatio)} · 따뜻한색 ${pct(m.warmRatio)} · 차가운색 ${pct(m.coolRatio)} · 빨강 ${pct(m.redRatio)}</dd>
          <dt>사용한 색</dt><dd>${(m.colors || []).map((c) => `<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${e(c)};border:1px solid var(--line);vertical-align:middle"></span>`).join(' ')}</dd>
          <dt>도구</dt><dd>${(m.tools || []).join(', ')}</dd></dl></div></div>
      <div><h2 style="margin-bottom:2px">${e(d.task)}</h2><p class="tiny">${fmtTime(d.created_at)} · ${riskPill(d.risk || 0, d.risk ? '주의 지표' : '특이 없음')} · <a href="#/admin/clients/${d.user_id}">내담자 정보</a></p>
        <p class="small muted">${e(d.prompt)}</p>
        <h3>사후 질문 응답</h3><dl class="qa small">${d.pdiQuestions.map((q) => `<dt>${e(q.q)}</dt><dd>${e(d.pdi[q.id] || '—')}</dd>`).join('')}</dl>
        <h3 style="margin-top:16px">자동 지표 해석 (가설)</h3><ul class="clean small">${(d.auto.counselor || []).map((x) => `<li>${e(x)}</li>`).join('')}</ul><p class="tiny">${e(d.auto.disclaimer || '')}</p>
        ${d.ai ? `<div class="panel" style="background:var(--violet-l);border-color:transparent;margin-top:10px"><b class="small">AI 해석 보조</b>
          <div class="small"><b>관찰</b><ul class="clean">${d.ai.observations.map((x) => `<li>${e(x)}</li>`).join('')}</ul><b>가설</b><ul class="clean">${d.ai.hypotheses.map((x) => `<li>${e(x)}</li>`).join('')}</ul><b>강점</b>: ${d.ai.strengths.map(e).join(', ')}<br><b>위험</b>: ${d.ai.risk} — ${e(d.ai.risk_reason)}<br><b>다음 상담 질문</b>: ${d.ai.questions.map(e).join(' / ')}</div></div>`
          : state.ai ? '<p class="tiny">AI 해석을 준비 중이거나 실패했어요. 새로고침해 보세요.</p>' : ''}
        <form id="itf" class="panel" style="margin-top:14px"><h3>해석 작성</h3>
          <label class="field"><span>상담자 해석 (상담 기록용)</span><textarea class="input" name="note" rows="5">${e(d.counselor_note || '')}</textarea></label>
          <label class="field"><span>내담자에게 보내는 답장</span><textarea class="input" name="client_message" rows="4" placeholder="판단하지 않고, 그림에서 발견한 힘을 먼저 비춰 주세요.">${e(d.client_message || d.ai?.client_message || '')}</textarea></label>
          <label class="check"><input type="checkbox" name="share_note" ${d.note_shared ? 'checked' : ''}><span>상담자 해석도 내담자에게 공개</span></label>
          <label class="check"><input type="checkbox" name="send_email" checked><span>그림과 답장을 내담자 메일로 보내기</span></label>
          <button class="btn">답장 보내기</button></form></div></div>`;
  if (innerWidth < 900) $('#dr').style.gridTemplateColumns = '1fr';
  $('#itf', pane).onsubmit = async (ev) => {
    ev.preventDefault(); const f = ev.target;
    const r = await api(`/admin/drawings/${id}/interpret`, { body: { note: f.note.value, client_message: f.client_message.value, send_email: f.send_email.checked, share_note: f.share_note.checked } });
    toast(r.mailed ? '답장을 보내고 메일도 발송했어요.' : '답장을 보냈어요.', 'ok'); refreshBadges(); location.hash = '#/admin/drawings';
  };
}

// ── 관리 ──
async function staff(pane) {
  const { staff: list } = await api('/admin/staff');
  pane.innerHTML = `<h1 style="font-size:1.8rem">상담사 관리</h1>
    <form id="sf" class="panel row" style="align-items:flex-end"><label class="field" style="margin:0;flex:1"><span>이름</span><input class="input" name="name" required></label>
      <label class="field" style="margin:0;flex:1.4"><span>메일</span><input class="input" name="email" type="email" required></label>
      <label class="field" style="margin:0;flex:1"><span>연락처</span><input class="input" name="phone" required></label>
      <label class="field" style="margin:0"><span>역할</span><select class="input" name="role"><option value="counselor">상담사</option><option value="admin">관리자</option></select></label><button class="btn">추가</button></form>
    <div class="tablewrap" style="margin-top:12px"><table class="t"><thead><tr><th>이름</th><th>메일</th><th>연락처</th><th>역할</th><th>마지막 접속</th><th></th></tr></thead><tbody>
      ${list.map((s) => `<tr><td>${e(s.name)}</td><td>${e(s.email)}</td><td>${e(fmtPhone(s.phone))}</td><td>${s.role === 'admin' ? '관리자' : '상담사'}</td><td class="tiny">${fmtTime(s.last_login) || '-'}</td><td>${s.id !== state.user.id ? `<button class="btn soft sm" data-t="${s.id}">${s.active ? '비활성화' : '활성화'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  $('#sf', pane).onsubmit = async (ev) => { ev.preventDefault(); const f = ev.target; await api('/admin/staff', { body: { name: f.name.value, email: f.email.value, phone: f.phone.value, role: f.role.value } }); toast('추가했어요. 메일과 연락처로 로그인할 수 있어요.', 'ok'); staff(pane); };
  $$('[data-t]', pane).forEach((b) => b.onclick = async () => { await api(`/admin/staff/${b.dataset.t}/toggle`, { body: {} }); staff(pane); });
}
async function logs(pane) {
  const { logs: l } = await api('/admin/logs');
  pane.innerHTML = `<h1 style="font-size:1.8rem">열람 기록</h1><p class="small muted">비밀보장 예외(긴급 열람)의 모든 사용 기록이에요. 정기적으로 검토하세요.</p>
    <div class="tablewrap"><table class="t"><thead><tr><th>시각</th><th>열람자</th><th>내담자</th><th>대상</th><th>사유</th></tr></thead><tbody>${l.map((x) => `<tr><td class="tiny">${e(x.created_at)}</td><td>${e(x.staff)}</td><td>${e(x.client)}</td><td class="small">${e(x.target)}</td><td class="small">${e(x.reason)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">기록 없음</td></tr>'}</tbody></table></div>`;
}
async function outbox(pane) {
  const { mails } = await api('/admin/outbox');
  pane.innerHTML = `<h1 style="font-size:1.8rem">보낸 메일</h1><p class="small muted">${state.devMail ? '개발 모드에서는 실제로 발송하지 않고 여기에만 저장돼요.' : '최근 100건의 발송 기록이에요.'}</p>
    <div class="tablewrap"><table class="t"><thead><tr><th>시각</th><th>받는 사람</th><th>제목</th><th>상태</th></tr></thead><tbody>${mails.map((m) => `<tr class="click" data-id="${m.id}"><td class="tiny">${e(m.created_at)}</td><td class="small">${e(m.to_addr)}</td><td class="small">${e(m.subject)}</td><td><span class="pill ${m.status === 'failed' ? 'r2' : ''}">${{ 'dev-saved': '저장(개발)', sent: '발송', failed: '실패', sending: '발송 중' }[m.status]}</span></td></tr>`).join('')}</tbody></table></div>`;
  $$('tr[data-id]', pane).forEach((tr) => tr.onclick = async () => {
    const html = await (await fetch(`/api/admin/outbox/${tr.dataset.id}`)).text();
    const m = modal(`<iframe sandbox style="width:100%;height:70vh;border:0;border-radius:12px" title="메일 미리보기"></iframe><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn soft" data-close>닫기</button></div>`, { wide: true });
    $('iframe', m.el).srcdoc = html;
  });
}
