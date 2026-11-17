// 디자인 시안만 제공하는 로컬 서버. 임의 경로를 읽지 않습니다.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const html = path.join(__dirname, '../design/preview.html');
http.createServer((req, res) => { if (req.url !== '/' && req.url !== '/preview.html') {
    res.writeHead(404);
    res.end();
    return;
} res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(html)); }).listen(4317, '127.0.0.1', () => console.log('Design review: http://127.0.0.1:4317'));
