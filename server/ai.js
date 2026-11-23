// (선택) Claude API를 이용한 그림 해석·내담자 상태 요약
// .env 에 ANTHROPIC_API_KEY 가 있을 때만 동작합니다. 없으면 규칙 기반 해석만 사용합니다.
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const enabled = !!KEY;

async function call(content, system, maxTokens = 1200) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`AI 호출 실패: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

const SYS_DRAW = `당신은 미술치료 수퍼바이저를 돕는 보조자입니다. 투사적 그림검사(HTP, PITR, KFD 등) 해석 원리를 참고하되,
단정적 진단을 하지 않고 '가능성', '가설' 수준으로 표현합니다. 내담자는 초·중·고 학생이거나 성인(교사 포함)입니다.
반드시 아래 JSON 형식으로만 한국어로 답하세요:
{"observations":["그림에서 관찰되는 요소"],"hypotheses":["상담자를 위한 해석 가설"],"strengths":["내담자의 강점·보호요인"],
"risk":0~3 정수(0 없음,1 관심,2 위험,3 긴급: 자해·죽음 표현 등),"risk_reason":"근거","client_message":"내담자에게 건넬 따뜻하고 판단 없는 2~3문장",
"questions":["다음 상담에서 물어볼 만한 질문 2~3개"]}`;

async function interpretDrawing({ task, pngBase64, meta, pdi, user }) {
  if (!enabled) return null;
  const text = `과제: ${task.title} — ${task.prompt}\n대상: ${user.grp}\n그리기 지표: ${JSON.stringify(meta)}\n사후질문 응답: ${JSON.stringify(pdi)}`;
  const out = await call([
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
    { type: 'text', text },
  ], SYS_DRAW);
  return parseJson(out);
}

const SYS_SUM = `당신은 학교·지역 정신건강 플랫폼의 관리자를 돕는 임상 보조자입니다. 제공된 선별검사 점수, 그림 지표, 위기 알림 기록만으로
내담자 상태를 요약합니다. 진단명을 확정하지 말고 '선별상 ~ 가능성' 형태로 쓰세요. JSON으로만 한국어로 답하세요:
{"summary":"3~4문장 상태 요약","concerns":["주요 우려"],"strengths":["보호요인"],"priority":"낮음|보통|높음|긴급","next_steps":["권고 조치"]}`;

async function summarizeClient(payload) {
  if (!enabled) return null;
  return parseJson(await call([{ type: 'text', text: JSON.stringify(payload) }], SYS_SUM, 800));
}

module.exports = { enabled, interpretDrawing, summarizeClient, MODEL };
