// 마음결 — 내담자 화면과 라우터
import { state, api, e, $, $$, toast, modal, confirmBox, on, connectStream, disconnectStream, openSOS, riskPill, fmtTime, LOGO, sparkline } from './core.js';
import { mountMiniPad, mountStudio } from './draw.js';
import { renderAdmin } from './admin.js';

const app = $('#app');
let cleanups = [];
const onRoute = (fn) => cleanups.push(fn);

const AFFIRM = [
  '오늘 하루를 버텨 낸 것만으로도 충분해요.', '천천히 가도 괜찮아요. 멈춘 게 아니라 쉬는 중이에요.',
  '당신의 마음은 들어 줄 가치가 있어요.', '화면을 잠시 내려놓으면, 창밖의 하늘이 기다리고 있어요.',
  '완벽하지 않아도 당신은 소중해요.', '도움을 청하는 건 약함이 아니라 용기예요.',
  '작은 한 걸음도 걸음이에요.', '오늘의 기분이 내일의 나를 결정하지는 않아요.',
];
const MISSIONS = [
  ['sun', '창문 열고 햇빛 5분 쬐기'], ['walk', '10분 동네 산책하기'], ['water', '물 한 잔 천천히 마시기'],
  ['hello', '누군가에게 안부 한 줄 보내기'], ['meal', '스마트폰 없이 한 끼 먹기'], ['night', '잠들기 1시간 전 화면 끄기'],
  ['song', '좋아하는 노래 한 곡 따라 부르기'], ['good', '오늘 잘한 일 한 가지 적기'],
];
const WEATHER = [[1, '🌧️', '많이 힘들어요'], [2, '🌥️', '조금 힘들어요'], [3, '⛅', '그저 그래요'], [4, '🌤️', '괜찮아요'], [5, '☀️', '좋아요']];
const GRP = { elem: '초등학생', middle: '중학생', high: '고등학생', adult: '대학생·성인', teacher: '교사' };

// ── 라우터 ───────────────────────────────────────────
async function route() {
  cleanups.forEach((f) => f()); cleanups = [];
  const [path, query] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');
  renderChrome(parts[0] || '');
  app.classList.toggle('wide', parts[0] === 'admin');
  window.scrollTo(0, 0);
  try {
    if (!state.user) return renderLanding(parts[0] === 'signup' ? 'signup' : parts[0] === 'login' ? 'login' : null);
    const staff = ['counselor', 'admin'].includes(state.user.role);
    if (parts[0] === 'admin' || (staff && !parts[0])) { if (!staff) return (location.hash = '#/'); return renderAdmin(app, parts.slice(1), params, onRoute); }
    const views = { '': renderHome, home: renderHome, tests: renderTests, test: renderRunner, result: renderResultPage, draw: renderDraw, gallery: renderGallery, chat: renderChat, rest: renderRest, safety: renderSafety, me: renderRecords };
    await (views[parts[0]] || renderHome)(parts.slice(1), params);
  } catch (err) {
    app.innerHTML = `<div class="sheet empty"><div class="ico">🍃</div><p>${e(err.message)}</p><a class="btn soft" href="#/">처음으로</a></div>`;
  }
  app.focus({ preventScroll: true });
}

function renderChrome(cur) {
  const u = state.user;
  const staff = u && ['counselor', 'admin'].includes(u.role);
  const links = !u ? [] : staff ? [['admin', '관리 콘솔']] : [['home', '홈'], ['tests', '마음검사'], ['draw', '그림치료'], ['chat', '상담'], ['rest', '쉼터'], ['me', '나의 기록']];
  const active = cur || (u ? (staff ? 'admin' : 'home') : '');
  $('#topbar').innerHTML = `<a class="brand" href="#/">${LOGO}마음결</a>
    <nav class="topnav">${links.map(([k, l]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div class="spacer"></div>
    ${u ? `<button class="userchip" id="userchip" aria-haspopup="true">${e(u.name)} 님 <span class="av">${e(u.name.slice(0, 1))}</span></button>` : `<a class="btn sm ghost" href="#/login">로그인</a>`}`;
  const icons = { home: '🏡', tests: '📝', draw: '🎨', chat: '💬', rest: '🌿' };
  $('#bottomnav').innerHTML = u && !staff ? Object.entries(icons).map(([k, i]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}"><span>${i}</span>${{ home: '홈', tests: '검사', draw: '그림', chat: '상담', rest: '쉼터' }[k]}</a>`).join('') : '';
  $('#sosFab').hidden = !(u && !staff);
  const chip = $('#userchip');
  if (chip) chip.onclick = (ev) => {
    ev.stopPropagation();
    const old = $('.menu'); if (old) return old.remove();
    const m = document.createElement('div');
    m.className = 'menu';
    m.innerHTML = `<div class="tiny" style="padding:6px 11px">${e(u.email)}<br>${e(GRP[u.grp] || '')} ${u.role !== 'client' ? `· ${u.role === 'admin' ? '관리자' : '상담사'}` : ''}</div>
      ${!staff ? `<button id="mEmail">검사 결과 메일 받기 <b>${u.email_results ? '켜짐' : '꺼짐'}</b></button><a href="#/safety">나의 안전계획</a><a href="#/me">나의 기록</a>` : ''}
      <button id="mOut">로그아웃</button>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close));
    $('#mOut', m).onclick = async () => { await api('/auth/logout', { body: {} }); state.user = null; disconnectStream(); location.hash = '#/'; route(); };
    const me = $('#mEmail', m);
    if (me) me.onclick = async () => { const r = await api('/me', { method: 'PATCH', body: { email_results: !u.email_results } }); state.user = r.user; toast(r.user.email_results ? '검사 결과를 메일로 보내 드릴게요.' : '검사 결과 메일을 끕니다.'); };
  };
}

// ── 랜딩 · 로그인 · 가입 ─────────────────────────────
function renderLanding(mode) {
  app.innerHTML = `
  <section class="hero">
    <div>
      <h1><span class="line">말로 하기 어려운 마음,</span><span class="line">그림으로 먼저 꺼내 보세요.</span></h1>
      <p class="lede">마음결은 게임·스마트폰·AI·도박에 지쳤거나, 혼자라는 느낌과 무력감에 갇힌 학생과 어른을 위한 쉼터예요. 그림을 그리고, 마음을 살피고, 상담 선생님과 이야기 나누며 다시 세상 밖으로 한 걸음 나와요.</p>
      <div class="row" style="margin-top:20px"><a class="btn" href="#/signup">처음이에요</a><a class="btn ghost" href="#/login">로그인</a></div>
    </div>
    <div class="pad" id="miniPad">
      <canvas aria-label="자유롭게 그어 볼 수 있는 그림판"></canvas>
      <div class="reply"></div>
      <div class="swatches">${['#3E7C6A', '#F2B544', '#8E7FC6', '#3D6FB6', '#2C3440'].map((c, i) => `<button data-c="${c}" class="${i ? '' : 'on'}" style="background:${c}" aria-label="색 선택"></button>`).join('')}</div>
      <div class="hint">여기에 지금 마음을 한 줄 그어 보세요</div>
    </div>
  </section>
  <section class="promise">
    <div><h3>그림으로 나누고</h3><p class="muted">집-나무-사람, 빗속의 사람, 만다라 등 미술치료 과제를 그리면 상담 선생님이 그림을 읽고 답장을 보내요.</p></div>
    <div><h3>내 마음을 살피고</h3><p class="muted">우울·불안부터 스마트폰·게임·도박·AI 의존, 고립감까지. 검증된 선별검사 결과를 바로 확인하고 메일로 받아요.</p></div>
    <div><h3>비밀은 지키고, 위험할 땐 곁에</h3><p class="muted">상담 내용은 암호화해 비밀로 지켜요. 생명이 위험한 신호가 보일 때만 보호를 위해 상담 선생님이 먼저 손을 내밀어요.</p></div>
  </section>
  <section class="authbox sheet" id="auth"></section>
  <div class="helpline-strip"><b>지금 많이 힘들다면</b><span><a href="tel:109">109</a> 자살예방상담 (24시간)</span><span><a href="tel:1388">1388</a> 청소년상담</span><span><a href="tel:15770199">1577-0199</a> 정신건강위기상담</span><span><a href="tel:1336">1336</a> 도박문제상담</span></div>`;
  mountMiniPad($('#miniPad'));
  renderAuth(mode || 'login');
  if (mode) setTimeout(() => $('#auth').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function renderAuth(mode) {
  const box = $('#auth');
  box.innerHTML = `<div class="auth-tabs" role="tablist"><button class="${mode === 'login' ? 'on' : ''}" data-m="login">로그인</button><button class="${mode === 'signup' ? 'on' : ''}" data-m="signup">처음이에요</button></div><div id="authBody"></div>`;
  $$('.auth-tabs button', box).forEach((b) => b.onclick = () => renderAuth(b.dataset.m));
  mode === 'login' ? loginForm($('#authBody')) : signupForm($('#authBody'));
}

function loginForm(el, preset) {
  el.innerHTML = `<form id="lf">
    <label class="field"><span>메일 주소</span><input class="input" name="email" type="email" autocomplete="email" required value="${e(preset?.email || '')}"></label>
    <label class="field"><span>휴대전화 번호</span><input class="input" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="010-1234-5678" required value="${e(preset?.phone || '')}"></label>
    <div id="codeArea"></div>
    <div class="err" id="lerr"></div>
    <button class="btn block" id="lbtn">인증번호 받기</button>
    <p class="tiny" style="margin-top:10px">메일로 6자리 인증번호를 보내 드려요. 가입할 때 적은 메일과 연락처가 모두 맞아야 로그인돼요.</p></form>`;
  const f = $('#lf', el);
  let stage = preset?.sent ? 'code' : 'request';
  const showCode = (dev) => {
    $('#codeArea', el).innerHTML = `${dev ? `<p class="devnote">개발 모드: 메일 서버가 설정되지 않아 인증번호를 화면에 보여 드려요 → <b>${dev}</b></p>` : '<p class="small muted">메일함을 확인해 주세요. (스팸함도 확인해 주세요)</p>'}
      <label class="field"><span>인증번호 6자리</span><input class="input" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required value="${dev || ''}"></label>
      <button type="button" class="btn soft sm" id="resend">인증번호 다시 받기</button><div style="height:12px"></div>`;
    $('#lbtn', el).textContent = '로그인';
    $('#resend', el).onclick = () => request(true);
    stage = 'code';
  };
  const request = async (again) => {
    $('#lerr', el).textContent = '';
    try { const r = await api('/auth/request-code', { body: { email: f.email.value, phone: f.phone.value } }); showCode(r.devCode); if (again) toast('인증번호를 다시 보냈어요.'); }
    catch (err) { $('#lerr', el).textContent = err.message; }
  };
  if (preset?.sent) showCode(preset.devCode);
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if (stage === 'request') return request();
    $('#lbtn', el).disabled = true;
    try {
      const r = await api('/auth/verify', { body: { email: f.email.value, phone: f.phone.value, code: f.code.value } });
      state.user = r.user; connectStream(); bindGlobal();
      toast(`${r.user.name} 님, 반가워요.`, 'ok');
      location.hash = ['counselor', 'admin'].includes(r.user.role) ? '#/admin' : '#/home';
      route();
    } catch (err) { $('#lerr', el).textContent = err.message; $('#lbtn', el).disabled = false; }
  };
}

function signupForm(el) {
  const years = Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 6 - i);
  el.innerHTML = `<form id="sf">
    <label class="field"><span>이름 또는 불리고 싶은 별명</span><input class="input" name="name" maxlength="30" required></label>
    <label class="field"><span>메일 주소 (검사 결과와 인증번호를 받아요)</span><input class="input" name="email" type="email" required></label>
    <label class="field"><span>휴대전화 번호</span><input class="input" name="phone" type="tel" inputmode="numeric" placeholder="010-1234-5678" required></label>
    <div class="field"><span>나는</span><div class="seg">${Object.entries(GRP).map(([k, v], i) => `<label><input type="radio" name="grp" value="${k}" ${i === 3 ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
    <label class="field hidden" id="teacherCode"><span>교사 인증코드</span><input class="input" name="teacher_code" autocomplete="off" placeholder="학교(기관)에서 받은 코드를 입력하세요"></label>
    <label class="field"><span>태어난 해 (선택)</span><select class="input" name="birth_year"><option value="">선택 안 함</option>${years.map((y) => `<option>${y}</option>`).join('')}</select></label>
    <div id="guardian" class="hidden panel" style="margin-bottom:14px;background:var(--mist)">
      <p class="small" style="margin-bottom:10px">만 14세 미만은 보호자의 동의가 필요해요.</p>
      <label class="field"><span>보호자 성함</span><input class="input" name="guardian_name"></label>
      <label class="field"><span>보호자 연락처</span><input class="input" name="guardian_phone" type="tel" inputmode="numeric"></label>
      <label class="check"><input type="checkbox" name="c_guardian"><span>보호자가 서비스 이용과 개인정보 수집에 동의했어요.</span></label>
    </div>
    <label class="check"><input type="checkbox" name="email_results" checked><span>검사 결과를 메일로 받을래요.</span></label>
    <details class="panel" style="margin:12px 0"><summary class="small" style="cursor:pointer">약관 및 동의 내용 자세히 보기</summary>
      <div class="small muted" style="margin-top:10px">
        <p><b>개인정보 수집·이용</b>: 이름(별명), 메일, 연락처, 대상 구분, 태어난 해를 회원 식별·로그인·결과 안내에 사용하며, 탈퇴 시 지체 없이 파기합니다.</p>
        <p><b>민감정보(정신건강) 처리</b>: 검사 응답, 그림, 기분 기록, 상담 내용은 마음건강 지원 목적에만 사용하고 암호화해 보관합니다.</p>
        <p><b>비밀보장과 그 예외</b>: 상담 내용은 원칙적으로 내담자와 담당 상담사만 볼 수 있습니다. 다만 자살·자해 등 생명과 안전이 위험한 신호가 감지되면, 보호를 위해 관리자가 사유를 기록한 뒤 내용을 확인하고 보호자·전문기관에 연락할 수 있습니다. 모든 열람은 기록됩니다.</p>
        <p><b>선별검사 안내</b>: 마음결의 검사는 진단이 아닌 선별(스크리닝) 목적의 참고 자료입니다.</p></div></details>
    <label class="check"><input type="checkbox" name="c_privacy" required><span>(필수) 개인정보 수집·이용에 동의해요.</span></label>
    <label class="check"><input type="checkbox" name="c_sensitive" required><span>(필수) 마음건강 관련 민감정보 처리에 동의해요.</span></label>
    <label class="check"><input type="checkbox" name="c_crisis" required><span>(필수) 생명이 위험한 상황에서는 보호를 위해 비밀보장의 예외가 있다는 것을 이해했어요.</span></label>
    <div class="err" id="serr"></div>
    <button class="btn block" style="margin-top:6px">가입하고 인증번호 받기</button></form>`;
  const f = $('#sf', el);
  const toggleG = () => {
    const y = Number(f.birth_year.value); const age = y ? new Date().getFullYear() - y : 99;
    $('#guardian', el).classList.toggle('hidden', !(f.grp.value === 'elem' || age < 14));
    const isT = f.grp.value === 'teacher';
    $('#teacherCode', el).classList.toggle('hidden', !isT);
    f.teacher_code.required = isT;
  };
  f.addEventListener('change', toggleG);
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    $('#serr', el).textContent = '';
    try {
      const r = await api('/auth/signup', { body: {
        name: f.name.value, email: f.email.value, phone: f.phone.value, grp: f.grp.value, birth_year: f.birth_year.value || null, teacher_code: f.teacher_code.value,
        guardian_name: f.guardian_name.value, guardian_phone: f.guardian_phone.value, email_results: f.email_results.checked,
        consent: { privacy: f.c_privacy.checked, sensitive: f.c_sensitive.checked, crisis: f.c_crisis.checked, guardian: f.c_guardian.checked },
      } });
      const preset = { email: f.email.value, phone: f.phone.value, sent: true, devCode: r.devCode };
      renderAuth('login'); loginForm($('#authBody'), preset);
      toast('가입되었어요. 메일로 받은 인증번호를 입력해 주세요.', 'ok');
    } catch (err) { $('#serr', el).textContent = err.message; }
  };
}

// ── 홈 ───────────────────────────────────────────────
async function renderHome() {
  const [res, moods, mis, dr] = await Promise.all([api('/results'), api('/moods'), api('/missions'), api('/drawings')]);
  const h = new Date().getHours();
  const hi = h < 6 ? '깊은 밤이네요' : h < 11 ? '좋은 아침이에요' : h < 17 ? '오후도 잘 지내고 있나요' : h < 21 ? '오늘 하루 수고 많았어요' : '편안한 밤 보내요';
  const todayMood = moods.moods.find((m) => m.created_at.slice(0, 10) === new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  const fresh = dr.drawings.find((d) => d.status === 'interpreted');
  app.innerHTML = `
    <div class="greet"><div><p class="muted" style="margin:0">${hi}</p><h1>${e(state.user.name)} 님, 오늘 마음 날씨는 어때요?</h1></div></div>
    <div class="weather" id="weather">${WEATHER.map(([v, i, l]) => `<button data-v="${v}" class="${todayMood?.score === v ? 'on' : ''}"><b>${i}</b>${l}</button>`).join('')}</div>
    <div id="moodNote"></div>
    ${fresh ? `<a class="tile" href="#/gallery/${fresh.id}" style="margin-top:16px;background:var(--violet-l);border-color:transparent">💌 <b>${e(fresh.task)}</b> 그림에 상담 선생님의 답장이 도착했어요.</a>` : ''}
    <section class="section"><div class="ways">
      <a class="way b" href="#/draw"><span class="e">🎨</span><span><b>그림 그리기</b><small>마음을 색과 선으로</small></span></a>
      <a class="way a" href="#/tests"><span class="e">📝</span><span><b>마음 검사</b><small>지금의 나를 살펴봐요</small></span></a>
      <a class="way c" href="#/chat"><span class="e">💬</span><span><b>상담 선생님과 대화</b><small>비밀이 지켜져요</small></span></a>
      <a class="way d" href="#/rest"><span class="e">🌿</span><span><b>쉼터</b><small>호흡과 작은 걸음</small></span></a>
    </div></section>
    <div class="today">
      <div class="panel"><div class="section-head"><h3 style="margin:0">세상 밖으로 작은 걸음</h3><span class="tiny">${mis.done.length}/${MISSIONS.length} · 연속 ${mis.streak}일</span></div>
        <div class="grid" style="gap:7px">${MISSIONS.slice(0, 4).map(([k, t]) => missionBtn(k, t, mis.done.includes(k))).join('')}</div>
        <a href="#/rest" class="small" style="display:inline-block;margin-top:10px">미션 더 보기</a></div>
      <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;background:var(--forest-l);border-color:transparent">
        <p class="quote" id="quote">${AFFIRM[new Date().getDate() % AFFIRM.length]}</p>
        <button class="btn soft sm" id="nextQ" style="align-self:flex-start">다른 말 듣기</button></div>
    </div>
    <section class="section"><div class="section-head"><h2>최근 검사</h2><a href="#/me" class="small">전체 기록</a></div>
      ${res.results.length ? `<div class="grid g3">${res.results.slice(0, 3).map(resultTile).join('')}</div>` : `<div class="panel empty"><div class="ico">🌱</div><p>아직 검사 기록이 없어요. 3분이면 지금의 마음을 살펴볼 수 있어요.</p><a class="btn" href="#/tests">검사 둘러보기</a></div>`}
    </section>`;
  bindMissions(app);
  let qi = new Date().getDate();
  $('#nextQ').onclick = () => { $('#quote').textContent = AFFIRM[++qi % AFFIRM.length]; };
  $$('#weather button').forEach((b) => b.onclick = () => {
    $$('#weather button').forEach((x) => x.classList.toggle('on', x === b));
    const v = Number(b.dataset.v);
    $('#moodNote').innerHTML = `<div class="panel" style="margin-top:10px"><label class="field" style="margin-bottom:10px"><span>${v <= 2 ? '무엇이 마음을 무겁게 하나요? 적고 싶은 만큼만 적어도 괜찮아요.' : '오늘을 한 줄로 남겨 볼까요? (선택)'}</span>
      <textarea class="input" id="mn" rows="2" maxlength="500"></textarea></label><button class="btn sm" id="mSave">기록하기</button></div>`;
    $('#mSave').onclick = async () => {
      const r = await api('/moods', { body: { score: v, note: $('#mn').value } });
      $('#moodNote').innerHTML = `<p class="small muted" style="margin-top:10px">${v <= 2 ? '말해 줘서 고마워요. 힘든 날엔 쉼터의 호흡이나 그림 그리기가 조금 도움이 될 거예요.' : '기록했어요. 좋은 순간을 기억해 두는 것도 회복의 힘이 돼요.'}</p>`;
      if (r.sos) openSOS({ auto: true, level: 3 });
    };
  });
}
const resultTile = (r) => `<a class="tile test-tile" href="#/result/${r.id}"><span class="e">${r.icon || '📝'}</span><span><b>${e(r.title)}</b><span class="row" style="margin:4px 0">${riskPill(r.risk, r.level_label)}<span class="tiny">${fmtTime(r.created_at)}</span></span></span></a>`;
const missionBtn = (k, t, done) => `<button class="mission ${done ? 'done' : ''}" data-m="${k}"><span class="box">${done ? '✓' : ''}</span><span class="t">${t}</span></button>`;
function bindMissions(root) {
  $$('.mission', root).forEach((b) => b.onclick = async () => {
    await api('/missions/toggle', { body: { mission: b.dataset.m } });
    const done = !b.classList.contains('done');
    b.classList.toggle('done', done); $('.box', b).textContent = done ? '✓' : '';
    if (done) toast('한 걸음 내디뎠어요!', 'ok');
  });
}

// ── 심리검사 ─────────────────────────────────────────
async function loadTests() { if (!state.tests) { const r = await api('/tests'); state.tests = r.tests; state.categories = r.categories; } return state.tests; }

async function renderTests() {
  const [tests, res] = await Promise.all([loadTests(), api('/results')]);
  const last = {}; res.results.forEach((r) => { last[r.test_id] ||= r; });
  app.innerHTML = `<h1>마음 검사</h1><p class="muted">지금의 마음을 있는 그대로 살펴보는 시간이에요. 결과는 진단이 아니라, 나를 이해하고 도움을 찾기 위한 길잡이예요.</p>
    ${Object.entries(state.categories).map(([k, c]) => {
      const list = tests.filter((t) => t.category === k);
      return list.length ? `<div class="cat-title"><h2>${c.label}</h2><span class="tiny">${c.desc}</span></div><div class="grid g2">${list.map((t) => `
        <a class="tile test-tile" href="#/test/${t.id}"><span class="e">${t.icon}</span><span><b>${e(t.title)}</b><span class="small muted">${e(t.short)}</span>
          <span class="row" style="margin-top:6px"><span class="tiny">${t.items.length}문항 · 약 ${t.minutes}분</span>${t.standardized ? '' : '<span class="pill v">참고용</span>'}${last[t.id] ? riskPill(last[t.id].risk, '최근: ' + last[t.id].level_label) : ''}</span></span></a>`).join('')}</div>` : '';
    }).join('')}`;
}

async function renderRunner([id]) {
  const t = (await loadTests()).find((x) => x.id === id);
  if (!t) throw new Error('이 검사는 지금 이용할 수 없어요.');
  const ans = Array(t.items.length).fill(null);
  const visible = (i) => !t.items[i].showIf || (ans[t.items[i].showIf.item] ?? 0) >= t.items[i].showIf.min;
  let i = -1;
  const intro = () => {
    app.innerHTML = `<div class="runner sheet"><div style="font-size:2.4rem">${t.icon}</div><h1 style="font-size:1.8rem">${e(t.title)}</h1>
      <p>${e(t.instruction)}</p><p class="tiny">${e(t.source)}${t.standardized ? '' : ' — 표준화되지 않은 참고용 문항이에요.'}</p>
      <div class="row" style="margin-top:20px"><button class="btn" id="go">시작할게요</button><a class="btn soft" href="#/tests">다음에 할게요</a></div></div>`;
    $('#go').onclick = () => next(1);
  };
  const next = (dir) => {
    do { i += dir; } while (i >= 0 && i < t.items.length && !visible(i));
    if (i < 0) { i = -1; return intro(); }
    if (i >= t.items.length) return submit();
    draw();
  };
  const draw = () => {
    const it = t.items[i];
    const shown = t.items.filter((_, k) => visible(k)).length, idx = t.items.slice(0, i).filter((_, k) => visible(k)).length;
    app.innerHTML = `<div class="runner"><div class="row" style="justify-content:space-between"><button class="btn soft sm" id="back">이전</button><span class="tiny">${idx + 1} / ${shown}</span></div>
      <div class="progress"><i style="width:${(idx / shown) * 100}%"></i></div>
      <p class="tiny">${e(t.instruction)}</p><div class="qtext">${e(it.text)}</div>
      <div class="opts">${it.options.map((o) => `<button class="opt ${ans[i] === o.value ? 'on' : ''}" data-v="${o.value}"><i></i>${e(o.label)}</button>`).join('')}</div></div>`;
    $('#back').onclick = () => next(-1);
    $$('.opt').forEach((b) => b.onclick = () => { ans[i] = Number(b.dataset.v); $$('.opt').forEach((x) => x.classList.toggle('on', x === b)); setTimeout(() => next(1), 180); });
  };
  const submit = async () => {
    app.innerHTML = `<div class="runner sheet empty"><div class="ico">🍃</div><p>마음을 정리하고 있어요…</p></div>`;
    const r = await api(`/tests/${t.id}`, { body: { answers: ans.map((v) => v ?? 0) } });
    showResult(t, r.result, r);
    if (r.sos) setTimeout(() => openSOS({ auto: true, level: r.risk }), 500);
  };
  intro();
}

function showResult(t, r, extra = {}) {
  const scored = t.items.filter((it) => it.scored !== false);
  const min = scored.reduce((s, it) => s + Math.min(...it.options.map((o) => o.value)), 0);
  const max = scored.reduce((s, it) => s + Math.max(...it.options.map((o) => o.value)), 0);
  const pct = Math.max(0, Math.min(100, ((r.score - min) / (max - min || 1)) * 100));
  const good = t.id === 'rses';
  app.innerHTML = `<div class="runner">
    <div class="result-hero r${r.risk}"><div class="e">${t.icon}</div><div class="tiny">${e(t.title)}</div>
      <div class="lv">${e(r.level_label)}</div>
      ${t.category !== 'safety' ? `<div class="muted">${r.score}점 <span class="tiny">(${min}~${max}점)</span></div><div class="gauge" ${good ? 'style="transform:scaleX(-1)"' : ''}><b style="left:${good ? 100 - pct : pct}%"></b></div>${good ? '<div class="tiny">점수가 높을수록 자존감이 건강해요</div>' : ''}` : ''}
    </div>
    <div class="sheet" style="margin-top:14px"><p style="font-size:1.08rem">${e(r.summary)}</p>
      ${r.note ? `<p class="tiny">${e(r.note)}</p>` : ''}
      <p class="tiny">${e(t.source)} · 이 결과는 선별 목적의 참고 자료이며 진단이 아니에요.</p>
      ${extra.emailed ? '<p class="small" style="color:var(--forest-d)">결과를 메일로 보내 드렸어요.</p>' : ''}
      <div class="row" style="margin-top:14px">
        <button class="btn soft sm" id="mailR">메일로 받기</button>
        <a class="btn soft sm" href="#/draw">그림으로 표현해 보기</a>
        ${r.risk >= 1 ? '<a class="btn sm" href="#/chat">상담 선생님과 이야기하기</a>' : ''}
        <a class="btn ghost sm" href="#/tests">다른 검사</a></div></div>
    ${extra.followUp ? `<div class="panel" style="margin-top:14px;background:var(--dawn-l);border-color:transparent"><b>조금 더 확인하고 싶은 게 있어요.</b><p class="small">당신의 안전을 위해 몇 가지 질문에 더 답해 줄 수 있을까요? 2분이면 충분해요.</p><a class="btn dawn sm" href="#/test/${extra.followUp}">안전 확인 문항 하기</a></div>` : ''}
    ${r.risk >= 2 ? `<div class="panel" style="margin-top:14px;background:var(--coral-l);border-color:transparent"><b>혼자 견디지 않아도 돼요.</b><p class="small">상담 선생님에게 알림이 전달되었어요. 지금 바로 이야기하고 싶다면 109(24시간)에 전화하거나 채팅 상담을 시작해 주세요.</p><button class="btn coral sm" id="openSos">도움 받을 곳 보기</button></div>` : ''}
  </div>`;
  $('#mailR').onclick = async (ev) => { ev.target.disabled = true; const m = await api(`/results/${r.id}/email`, { body: {} }); toast(m.dev ? '메일함(개발 모드)에 저장했어요.' : '메일로 보냈어요.', 'ok'); };
  const os = $('#openSos'); if (os) os.onclick = () => openSOS({ auto: true, level: r.risk });
}

async function renderResultPage([id]) {
  const [tests, res] = await Promise.all([loadTests(), api('/results')]);
  const r = res.results.find((x) => String(x.id) === id);
  if (!r) throw new Error('결과를 찾을 수 없어요.');
  const t = tests.find((x) => x.id === r.test_id) || { icon: '📝', title: r.title, items: [], category: 'mood', source: '' };
  showResult(t, r);
}

// ── 그림 치료 ───────────────────────────────────────
async function loadTasks() { if (!state.tasks) state.tasks = (await api('/draw/tasks')).tasks; return state.tasks; }

async function renderDraw([taskId]) {
  const tasks = await loadTasks();
  if (taskId) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) throw new Error('그림 과제를 찾을 수 없어요.');
    const wrap = document.createElement('div');
    app.innerHTML = ''; app.appendChild(wrap);
    return mountStudio(wrap, t);
  }
  const groups = [...new Set(tasks.map((t) => t.group))];
  app.innerHTML = `<div class="section-head"><h1 style="margin:0">그림 치료</h1><a class="btn soft sm" href="#/gallery">나의 그림첩</a></div>
    <p class="muted">그림에는 말보다 먼저 마음이 담겨요. 잘 그리는 것보다 솔직하게 그리는 것이 중요해요. 다 그린 그림은 상담 선생님이 천천히 읽고 답장을 보내요.</p>
    ${groups.map((g) => `<div class="cat-title"><h2>${g}</h2></div><div class="grid g3">${tasks.filter((t) => t.group === g).map((t) => `
      <a class="tile test-tile" href="#/draw/${t.id}"><span class="e">${t.icon}</span><span><b>${e(t.title)}</b><span class="small muted">${e(t.prompt.slice(0, 48))}${t.prompt.length > 48 ? '…' : ''}</span></span></a>`).join('')}</div>`).join('')}`;
}

async function renderGallery([id], params) {
  if (id) {
    const { drawing: d } = await api(`/drawings/${id}`);
    const answered = d.pdiQuestions.filter((q) => d.pdi[q.id]);
    app.innerHTML = `<a href="#/gallery" class="small">나의 그림첩</a>
      ${params.get('new') ? `<div class="panel" style="margin:12px 0;background:var(--forest-l);border-color:transparent"><b>그림을 보냈어요.</b> 마음을 꺼내 놓느라 애썼어요. 상담 선생님이 그림을 읽고 답장을 보내면 알려 드릴게요.</div>` : ''}
      <div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:18px;margin-top:12px" id="gd">
        <div><img class="drawing-big" src="/api/drawings/${d.id}/image" alt="${e(d.task)} 그림">
          <div class="row" style="margin-top:10px"><a class="btn soft sm" href="/api/drawings/${d.id}/image" download="마음결_${e(d.task)}.png">기기에 저장</a>
          <button class="btn soft sm" id="mailD">메일로 받기</button>${d.status === 'saved' ? '<button class="btn sm" id="sendD">상담 선생님에게 보내기</button>' : ''}
          <a class="btn ghost sm" href="#/draw/${d.task_id}">다시 그리기</a></div></div>
        <div><h2 style="margin-bottom:4px">${e(d.title || d.task)}</h2><p class="tiny">${e(d.task)} · ${fmtTime(d.created_at)} · ${{ saved: '임시 저장', submitted: '답장을 기다리는 중', interpreted: '답장 도착' }[d.status]}</p>
          ${d.counselor_note || d.client_message ? `<h3 style="margin-top:18px">상담 선생님의 답장</h3><div class="letter">${e(d.client_message || '')}${d.counselor_note && d.client_message ? '\n\n' : ''}${e(d.counselor_note || '')}</div>`
            : `<div class="panel" style="margin-top:14px;background:var(--violet-l);border-color:transparent">${d.auto_client.map((x) => `<p class="small" style="margin:0 0 6px">${e(x)}</p>`).join('')}</div>`}
          ${answered.length ? `<h3 style="margin-top:18px">그림과 나눈 이야기</h3><dl class="qa">${answered.map((q) => `<dt>${e(q.q)}</dt><dd>${e(d.pdi[q.id])}</dd>`).join('')}</dl>` : ''}
        </div></div>`;
    if (innerWidth < 760) $('#gd').style.gridTemplateColumns = '1fr';
    $('#mailD').onclick = async (ev) => { ev.target.disabled = true; const m = await api(`/drawings/${d.id}/email`, { body: {} }); toast(m.dev ? '메일함(개발 모드)에 저장했어요.' : '그림을 메일로 보냈어요.', 'ok'); };
    const sd = $('#sendD'); if (sd) sd.onclick = async () => { await api(`/drawings/${d.id}/submit`, { body: {} }); toast('상담 선생님에게 보냈어요.', 'ok'); route(); };
    onRoute(on('drawing-interpreted', (x) => { if (x.id === d.id) route(); }));
    return;
  }
  const { drawings } = await api('/drawings');
  app.innerHTML = `<div class="section-head"><h1 style="margin:0">나의 그림첩</h1><a class="btn sm" href="#/draw">새 그림 그리기</a></div>
    ${drawings.length ? `<div class="thumbs" style="margin-top:16px">${drawings.map((d) => `<a class="thumb" href="#/gallery/${d.id}"><img loading="lazy" src="/api/drawings/${d.id}/image" alt=""><div><b class="small">${e(d.title || d.task)}</b><div class="row" style="margin-top:4px">${d.status === 'interpreted' ? '<span class="pill v">답장 도착</span>' : d.status === 'saved' ? '<span class="pill">임시 저장</span>' : '<span class="pill r0">전달됨</span>'}<span class="tiny">${fmtTime(d.created_at)}</span></div></div></a>`).join('')}</div>`
      : `<div class="panel empty" style="margin-top:16px"><div class="ico">🖼️</div><p>아직 그린 그림이 없어요. 첫 그림은 '지금 내 마음'으로 시작해 보면 어때요?</p><a class="btn" href="#/draw/free">그려 보기</a></div>`}`;
}

// ── 채팅 상담 ───────────────────────────────────────
async function renderChat([sid]) {
  const { sessions } = await api('/chat/sessions');
  const open = sid ? sessions.find((s) => String(s.id) === sid) : sessions.find((s) => s.status !== 'closed');
  if (open) return chatRoom(open.id);
  app.innerHTML = `<h1>상담 선생님과 이야기하기</h1>
    <p class="muted">무엇이든 괜찮아요. 대화는 암호화되어 나와 담당 선생님만 볼 수 있어요. 다만 생명이 위험한 신호가 보이면, 당신을 지키기 위해 먼저 연락드릴 수 있어요.</p>
    <div class="sheet"><h3>어떤 이야기를 하고 싶나요?</h3>
      <div class="topics seg">${['마음이 너무 힘들어요', '게임·스마트폰을 줄이고 싶어요', 'AI랑만 대화하게 돼요', '도박 때문에 괴로워요', '외롭고 아무도 없는 것 같아요', '학교·직장 문제', '그냥 이야기하고 싶어요'].map((t, i) => `<label><input type="radio" name="topic" value="${t}" ${i === 6 ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      <button class="btn" id="start">상담 시작하기</button></div>
    ${sessions.length ? `<section class="section"><h3>지난 상담</h3>${sessions.map((s) => `<a class="tile" style="margin-bottom:8px" href="#/chat/${s.id}"><b class="small">${e(s.topic)}</b> <span class="tiny">${fmtTime(s.created_at)} · ${e(s.counselor_name || '')}</span></a>`).join('')}</section>` : ''}`;
  $('#start').onclick = async () => {
    const topic = ($('input[name=topic]:checked') || {}).value;
    const r = await api('/chat/sessions', { body: { topic } });
    location.hash = `#/chat/${r.session.id}`;
  };
}

async function chatRoom(id) {
  const data = await api(`/chat/sessions/${id}/messages`);
  const s = data.session;
  app.innerHTML = `<div class="chat">
    <div class="chat-head"><div><b>${e(s.topic)}</b><div class="tiny" id="cstat">${s.status === 'closed' ? '종료된 상담' : s.counselor_id && !s.ai_active ? `${e(s.counselor_name)} 선생님과 대화 중` : '🌿 AI 상담사와 대화 중 · 상담 선생님 연결 대기'}</div></div>
      ${s.status !== 'closed' ? '<button class="btn soft sm" id="endC">상담 마치기</button>' : '<a class="btn soft sm" href="#/chat">새 상담</a>'}</div>
    <div class="chat-body" id="cb"></div><div class="typing hidden" id="typing"><span></span><span></span><span></span> 답장을 쓰고 있어요</div>
    ${s.status !== 'closed' ? `<form class="chat-input" id="cf"><textarea class="input" id="ct" placeholder="편하게 적어 주세요" rows="1" maxlength="2000"></textarea><button class="btn">보내기</button></form>` : ''}
  </div><p class="tiny" style="margin-top:8px">급하게 도움이 필요하면 오른쪽 아래 SOS 버튼을 누르거나 109에 전화하세요.</p>`;
  const cb = $('#cb');
  const add = (m) => {
    if ($(`[data-mid="${m.id}"]`, cb)) return;
    const mine = m.sender_id === state.user.id;
    const d = document.createElement('div');
    d.dataset.mid = m.id;
    d.className = `bub ${m.sender_role === 'system' ? 'sys' : mine ? 'me' : m.sender_role === 'ai' ? 'them ai' : 'them'}`;
    d.innerHTML = `${m.sender_role === 'ai' ? '<b class="who">🌿 AI 상담사</b>' : m.sender_role === 'counselor' ? '<b class="who">상담 선생님</b>' : ''}${e(m.body)}${m.sender_role !== 'system' ? `<small>${fmtTime(m.created_at).split(' ').pop()}</small>` : ''}`;
    cb.appendChild(d); cb.scrollTop = cb.scrollHeight;
  };
  data.messages.forEach(add);
  onRoute(on('message', (m) => { if (m.session_id === s.id) { add(m); $('#typing').classList.add('hidden'); if (m.sender_role === 'system' && /들어왔어요/.test(m.body)) $('#cstat').textContent = '상담 선생님과 대화 중'; if (m.sender_role === 'system' && /AI 상담사가 다시/.test(m.body)) $('#cstat').textContent = '🌿 AI 상담사와 상담 선생님이 함께해요'; } }));
  onRoute(on('typing', (t) => { if (t.session_id === s.id) { $('#typing').classList.toggle('hidden', !t.on); cb.scrollTop = cb.scrollHeight; } }));
  const f = $('#cf');
  if (f) {
    const ta = $('#ct');
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); f.requestSubmit(); } });
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const body = ta.value.trim(); if (!body) return;
      ta.value = '';
      try { const r = await api(`/chat/sessions/${s.id}/messages`, { body: { body } }); add(r.message); if (r.sos) openSOS({ auto: true, level: r.risk }); }
      catch (err) { toast(err.message); ta.value = body; }
    };
    $('#endC').onclick = async () => { if (await confirmBox('상담을 마칠까요?', '언제든 다시 새 상담을 시작할 수 있어요.', '마치기')) { await api(`/chat/sessions/${s.id}/close`, { body: {} }); route(); } };
  }
}

// ── 쉼터 ─────────────────────────────────────────────
async function renderRest() {
  const mis = await api('/missions');
  app.innerHTML = `<h1>쉼터</h1><p class="muted">화면에서 잠시 눈을 떼고, 몸과 마음을 돌보는 곳이에요.</p>
    <div class="grid g2" style="margin-top:16px">
      <div class="panel"><h3>함께 숨 쉬기</h3><p class="small muted">4초 들이마시고, 4초 머물고, 6초 내쉬어요. 세 번만 해도 몸이 달라져요.</p>
        <div class="breath"><div class="orb" id="orb"></div><div class="label" id="blabel">준비되면 시작을 눌러요</div></div>
        <button class="btn block" id="bbtn">시작</button></div>
      <div class="panel"><div class="section-head"><h3 style="margin:0">세상 밖으로 작은 걸음</h3><span class="tiny">연속 ${mis.streak}일</span></div>
        <p class="small muted">오늘 해낸 것에 체크해요. 하나만 해도 충분해요.</p>
        <div class="grid" style="gap:7px">${MISSIONS.map(([k, t]) => missionBtn(k, t, mis.done.includes(k))).join('')}</div></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="panel" style="background:var(--forest-l);border-color:transparent"><h3>나에게 건네는 말</h3><p class="quote" id="q2">${AFFIRM[0]}</p><button class="btn soft sm" id="q2n">다른 말</button></div>
      <div class="panel"><h3>디지털 쉼표 만들기</h3><ul class="clean small"><li>알림은 꼭 필요한 앱만 남겨요.</li><li>잠자리에는 스마트폰 대신 책이나 음악을 두어요.</li><li>게임·AI를 켜기 전에 "지금 무엇이 필요하지?" 하고 3초 물어요.</li><li>돈을 거는 앱은 지우고, 1336에 도움을 요청할 수 있어요.</li></ul>
        <a class="btn ghost sm" href="#/safety">나의 안전계획 만들기</a></div>
    </div>`;
  bindMissions(app);
  let qi = 0; $('#q2n').onclick = () => { $('#q2').textContent = AFFIRM[++qi % AFFIRM.length]; };
  let timer = null;
  const orb = $('#orb'), lab = $('#blabel');
  const steps = [['들이마셔요', 4000, 1.7], ['잠시 머물러요', 4000, 1.7], ['천천히 내쉬어요', 6000, 1]];
  const run = (k = 0, n = 0) => {
    if (n >= 15) { stop(); lab.textContent = '잘했어요. 지금의 편안함을 기억해요.'; return; }
    const [t, ms, sc] = steps[k];
    lab.textContent = t; orb.style.transitionDuration = ms + 'ms'; orb.style.transform = `scale(${sc})`;
    timer = setTimeout(() => run((k + 1) % 3, n + 1), ms);
  };
  const stop = () => { clearTimeout(timer); timer = null; orb.style.transform = 'scale(1)'; $('#bbtn').textContent = '시작'; };
  $('#bbtn').onclick = () => { if (timer) { stop(); lab.textContent = '언제든 다시 시작해요'; } else { $('#bbtn').textContent = '멈추기'; run(); } };
  onRoute(() => clearTimeout(timer));
}

// ── 안전계획 ─────────────────────────────────────────
async function renderSafety() {
  const { plan, updated_at } = await api('/safety-plan');
  const F = [
    ['signs', '힘든 순간이 오고 있다는 나만의 신호', '예: 방에서 나오기 싫어진다, 밤새 게임을 한다, 아무 연락도 받기 싫다'],
    ['self', '혼자서 해 볼 수 있는 나만의 대처법', '예: 샤워하기, 좋아하는 노래 듣기, 그림 그리기, 호흡하기'],
    ['places', '기분을 돌리는 데 도움이 되는 사람과 장소', '예: 동네 도서관, 편의점 앞 공원, 사촌 언니'],
    ['people', '도움을 요청할 수 있는 사람 (이름과 연락처)', '예: 엄마 010-…, 담임 선생님 010-…'],
    ['pro', '전문가와 기관', ''],
    ['safe', '위험한 물건을 멀리하는 방법', '예: 약은 가족에게 맡기기, 도박 앱 지우기'],
    ['reason', '내가 살아가고 싶은 이유', '예: 우리 집 고양이, 보고 싶은 공연, 언젠가 가 보고 싶은 곳'],
  ];
  plan.pro ||= '자살예방상담 109 (24시간, 문자 가능)\n정신건강위기상담 1577-0199\n청소년상담 1388\n도박문제 1336\n긴급 119 / 112';
  app.innerHTML = `<h1>나의 안전계획</h1><p class="muted">마음이 괜찮을 때 미리 적어 두면, 힘든 순간에 나를 지켜 주는 지도가 돼요. 이 내용은 암호화되어 나만 볼 수 있어요.</p>
    <form class="sheet" id="spf">${F.map(([k, l, ph], i) => `<label class="field"><span><b>${i + 1}.</b> ${l}</span><textarea class="input" name="${k}" placeholder="${e(ph)}" rows="3">${e(plan[k] || '')}</textarea></label>`).join('')}
      <div class="row"><button class="btn">저장하기</button><span class="tiny">${updated_at ? '마지막 저장 ' + fmtTime(updated_at) : ''}</span></div></form>`;
  $('#spf').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    await api('/safety-plan', { method: 'PUT', body: { plan: Object.fromEntries(fd.entries()) } });
    toast('안전계획을 저장했어요.', 'ok');
  };
}

// ── 나의 기록 ───────────────────────────────────────
async function renderRecords() {
  const [res, moods] = await Promise.all([api('/results'), api('/moods')]);
  const ms = moods.moods.slice().reverse();
  app.innerHTML = `<h1>나의 기록</h1>
    <div class="panel"><div class="section-head"><h3 style="margin:0">마음 날씨 흐름</h3><span class="tiny">최근 ${ms.length}회</span></div>
      ${ms.length ? sparkline(ms.map((m) => m.score), { w: 640, h: 90 }) + `<div class="row tiny" style="justify-content:space-between"><span>${fmtTime(ms[0].created_at)}</span><span>${fmtTime(ms[ms.length - 1].created_at)}</span></div>` : '<p class="small muted">홈에서 오늘의 마음 날씨를 기록해 보세요.</p>'}</div>
    <section class="section"><h2>검사 기록</h2>
      ${res.results.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>검사</th><th>결과</th><th>점수</th><th>날짜</th><th></th></tr></thead><tbody>${res.results.map((r) => `
        <tr class="click" data-href="#/result/${r.id}"><td>${r.icon} ${e(r.title)}</td><td>${riskPill(r.risk, r.level_label)}</td><td>${r.score}</td><td class="tiny">${fmtTime(r.created_at)}</td><td class="tiny">${r.emailed ? '메일 발송됨' : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">아직 검사 기록이 없어요.</p>'}</section>`;
  $$('tr[data-href]').forEach((tr) => tr.onclick = () => (location.hash = tr.dataset.href));
}

// ── 시작 ─────────────────────────────────────────────
let bound = false;
function bindGlobal() {
  if (bound) return; bound = true;
  on('drawing-interpreted', () => toast('그림에 상담 선생님의 답장이 도착했어요 💌', 'ok'));
}
$('#sosFab').onclick = () => openSOS({ auto: false, level: 3 });
addEventListener('hashchange', route);
(async () => {
  const me = await api('/me').catch(() => ({}));
  state.user = me.user || null; state.devMail = me.devMail; state.ai = me.ai;
  if (state.user) { connectStream(); if (state.user.role === 'client') bindGlobal(); }
  route();
})();
export { route };
