const { spawn } = require('child_process');
const server = spawn('node', ['src/server.js'], { 
  cwd: 'C:\\Projetos\\Bot_whatsapp',
  detached: true,
  stdio: 'ignore'
});
server.unref();
console.log('Servidor iniciado em background');