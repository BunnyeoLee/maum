// 상담 내용·그림·메모 암호화 (AES-256-GCM)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

function loadKey() {
  if (process.env.DATA_KEY) {
    const k = Buffer.from(process.env.DATA_KEY, 'base64');
    if (k.length !== 32) throw new Error('DATA_KEY는 base64로 인코딩된 32바이트여야 합니다.');
    return k;
  }
  const f = path.join(DATA_DIR, '.data_key');
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
    console.warn('[보안] DATA_KEY가 없어 data/.data_key 를 새로 만들었습니다. 운영 환경에서는 .env 에 DATA_KEY 를 지정하고 안전하게 백업하세요.');
  }
  return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64');
}
const KEY = loadKey();

function encBuf(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const out = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), out]);
}
function decBuf(buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}
const enc = (text) => (text == null || text === '' ? null : encBuf(Buffer.from(String(text), 'utf8')).toString('base64'));
const dec = (b64) => {
  if (!b64) return '';
  try { return decBuf(Buffer.from(b64, 'base64')).toString('utf8'); } catch { return '[복호화 실패]'; }
};
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const token = (n = 32) => crypto.randomBytes(n).toString('hex');

module.exports = { enc, dec, encBuf, decBuf, sha, token };
