const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, 'dist');
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'};
const previews = new Set();
let reloadTimer;
require('node:fs').watch(root, {recursive:true}, () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => { for (const preview of previews) preview.write('data: reload\n\n'); }, 150);
});
http.createServer((req,res) => {
  if (req.url === '/__preview_events') {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    res.write(': connected\n\n'); previews.add(res);
    req.on('close', () => previews.delete(res)); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error,data) => { if(error) {res.writeHead(404).end('Not found');return;} res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}); if(path.extname(file) === '.html') data = data.toString().replace('</body>', '<script>new EventSource("/__preview_events").onmessage = () => location.reload();</script></body>'); res.end(data); });
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
