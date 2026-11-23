// .env 파일 읽기 (Node 22 내장 기능 사용)
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', '.env');
if (fs.existsSync(f)) process.loadEnvFile(f);
