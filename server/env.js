// .env 파일 읽기 (Node 22 내장 기능 사용)
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', '.env');
if (fs.existsSync(f)) process.loadEnvFile(f);

// 한국 시간 기준으로 기록 (Codespaces 등 서버 기본값이 UTC여도)
process.env.TZ = process.env.TZ || 'Asia/Seoul';
