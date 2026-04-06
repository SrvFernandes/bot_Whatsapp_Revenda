import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from 'baileys';
import QRCode from 'qrcode';
import multer from 'multer';
import fs from 'fs';
import { initDatabase, getAllVehicles, getVehicleById, searchVehicles, getSimilarVehicles, addVehicle, updateVehicle, updateStatus, filterVehicles, logBotMessage, updateBotStats, getBotStats, getBotStatsToday, getBotLogs, addCliente, getAllClientes, getClienteById, getClienteByTelefone, updateCliente, searchClientes, getClientesInteressados, getOuCriarConversa, atualizarConversa, getAllConversas, getMensagensConversa, adicionarMensagem, atribuirVendedor, getConfig, updateConfig, addUsuario, getAllUsuarios, getUsuarioById, updateUsuario, loginUsuario } from './database/db.js';
import { getMarcasComModelos, getModelos, getAnos } from './data/marcas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '..')));

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  console.log('Serving:', indexPath);
  res.sendFile(indexPath);
});

app.get('/api/veiculos', (req, res) => {
  const { status, marca, modelo, anoDe, anoAte, precoDe, precoAte, q } = req.query;
  const vehicles = filterVehicles({ status, marca, modelo, anoDe, anoAte, precoDe, precoAte, q });
  res.json(vehicles);
});

app.get('/api/veiculos/:id', (req, res) => {
  const vehicle = getVehicleById(parseInt(req.params.id));
  if (vehicle) {
    res.json(vehicle);
  } else {
    res.status(404).json({ error: 'Veículo não encontrado' });
  }
});

app.post('/api/veiculos', upload.array('fotos', 10), (req, res) => {
  try {
    const vehicle = req.body;
    if (req.files && req.files.length > 0) {
      vehicle.fotos = req.files.map(f => `/uploads/${f.filename}`);
    }
    const result = addVehicle(vehicle);
    
    const interessados = getClientesInteressados(vehicle);
    res.json({ ...result, interessados });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/veiculos/:id/notificar-interessados', async (req, res) => {
  try {
    const vehicle = getVehicleById(parseInt(req.params.id));
    if (!vehicle) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }
    
    const interessados = getClientesInteressados(vehicle);
    
    let count = 0;
    if (sock && connected && interessados.length > 0) {
      for (const cliente of interessados) {
        const msg = `🚗 *NOVO VEÍCULO DISPONÍVEL!* \n\n${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}\n\n💰 R$ ${vehicle.preco?.toLocaleString('pt-BR')}\n\nJá está disponível! Interesse? Responda aqui.`;
        await sock.sendMessage(cliente.telefone + '@s.whatsapp.net', { text: msg });
        updateBotStats('mensagem_enviada');
        logBotMessage(cliente.telefone, 'enviada', `Notificação: ${vehicle.marca} ${vehicle.modelo}`);
        count++;
      }
    }
    
    res.json({ success: true, quantos: count });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/veiculos/:id/fotos', upload.array('fotos', 10), (req, res) => {
  try {
    const vehicle = getVehicleById(parseInt(req.params.id));
    if (!vehicle) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }
    const fotos = vehicle.fotos ? JSON.parse(vehicle.fotos) : [];
    const newFotos = req.files.map(f => `/uploads/${f.filename}`);
    updateVehicle(parseInt(req.params.id), { fotos: JSON.stringify([...fotos, ...newFotos]) });
    res.json({ success: true, fotos: [...fotos, ...newFotos] });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/veiculos/:id', (req, res) => {
  try {
    updateVehicle(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch('/api/veiculos/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    updateStatus(parseInt(req.params.id), status);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/search', (req, res) => {
  const { q } = req.query;
  const results = searchVehicles(q || '');
  res.json(results);
});

app.get('/api/marcas', (req, res) => {
  res.json(getMarcasComModelos());
});

app.get('/api/marcas/:marca/modelos', (req, res) => {
  const modelos = getModelos(req.params.marca);
  res.json(modelos);
});

app.get('/api/modelos/:modelo/anos', (req, res) => {
  const anos = getAnos(req.params.modelo);
  res.json(anos);
});

app.get('/api/bot/stats', (req, res) => {
  const today = getBotStatsToday();
  const week = getBotStats(7);
  const month = getBotStats(30);
  res.json({ today, week, month });
});

app.get('/api/bot/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const logs = getBotLogs(limit);
  res.json(logs);
});

app.get('/api/bot/connection', async (req, res) => {
  let qrDataUrl = null;
  if (currentQR) {
    try {
      qrDataUrl = await QRCode.toDataURL(currentQR);
    } catch (e) {
      qrDataUrl = null;
    }
  }
  res.json({ connected, reconnectAttempts, qr: qrDataUrl });
});

app.post('/api/bot/disconnect', async (req, res) => {
  if (sock) {
    sock.end(undefined);
    sock = null;
    connected = false;
    currentQR = null;
    
    const authDir = path.join(__dirname, '..', 'auth');
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
    
    console.log('❌ WhatsApp desconectado. Auth removido.');
    res.json({ success: true });
  }
});

app.post('/api/bot/reconnect', async (req, res) => {
  reconnectAttempts = 0;
  await startBot();
  res.json({ success: true });
});

app.post('/api/bot/broadcast', async (req, res) => {
  const { mensagem, filtro } = req.body;
  
  if (!mensagem || mensagem.trim() === '') {
    return res.status(400).json({ error: 'Mensagem obrigatória' });
  }
  
  let sql = 'SELECT * FROM clientes';
  const params = [];
  if (filtro && filtro !== 'todos') {
    sql += ' WHERE status = ?';
    params.push(filtro);
  }
  
  const clientes = queryAll(sql, params);
  
  let enviados = 0;
  let erros = 0;
  
  if (sock && connected && clientes.length > 0) {
    for (const cliente of clientes) {
      try {
        const telefone = cliente.telefone.replace('@s.whatsapp.net', '');
        await sock.sendMessage(cliente.telefone + '@s.whatsapp.net', { text: mensagem });
        logBotMessage(telefone, 'enviada', 'Broadcast: ' + mensagem.substring(0, 30));
        updateBotStats('mensagem_enviada');
        enviados++;
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log('Erro ao enviar para', cliente.telefone, e.message);
        erros++;
      }
    }
  }
  
  res.json({ success: true, enviados, erros, total: clientes.length });
});

app.get('/api/clientes', (req, res) => {
  const { q } = req.query;
  const clientes = q ? searchClientes(q) : getAllClientes();
  res.json(clientes);
});

app.post('/api/clientes', (req, res) => {
  try {
    const cliente = addCliente(req.body);
    res.json(cliente);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/clientes/:id', (req, res) => {
  try {
    console.log('Buscando cliente ID:', req.params.id);
    const cliente = getClienteById(parseInt(req.params.id));
    if (cliente) {
      res.json(cliente);
    } else {
      res.status(404).json({ error: 'Cliente não encontrado' });
    }
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clientes/telefone/:telefone', (req, res) => {
  try {
    const telefone = req.params.telefone;
    let cliente = getClienteByTelefone(telefone);
    
    if (!cliente) {
      cliente = getClienteByTelefone(telefone + '@s.whatsapp.net');
    }
    
    if (cliente) {
      res.json(cliente);
    } else {
      res.status(404).json({ error: 'Cliente não encontrado' });
    }
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clientes/:id', (req, res) => {
  try {
    updateCliente(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/conversas', (req, res) => {
  const conversas = getAllConversas();
  res.json(conversas);
});

app.get('/api/conversas/:id', (req, res) => {
  const conversas_id = parseInt(req.params.id);
  const mensagens = getMensagensConversa(conversas_id);
  res.json(mensagens);
});

app.post('/api/conversas/:id/atender', (req, res) => {
  const { vendedor } = req.body;
  atribuirVendedor(parseInt(req.params.id), vendedor);
  res.json({ success: true });
});

app.post('/api/conversas/:id/mensagens', (req, res) => {
  try {
    const conversa_id = parseInt(req.params.id);
    const { telefone, mensagem } = req.body;
    
    adicionarMensagem(conversa_id, telefone, 'enviada', mensagem);
    
    if (sock && connected) {
      sock.sendMessage(telefone + '@s.whatsapp.net', { text: mensagem });
      logBotMessage(telefone, 'enviada', mensagem.substring(0, 50));
      updateBotStats('mensagem_enviada');
    }
    
    atualizarConversa(conversa_id, mensagem);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/config', (req, res) => {
  const config = getConfig();
  res.json(config);
});

app.put('/api/config', (req, res) => {
  try {
    updateConfig(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/usuarios/login', (req, res) => {
  try {
    const { email, senha } = req.body;
    const usuario = loginUsuario(email, senha);
    if (usuario) {
      res.json({ success: true, usuario });
    } else {
      res.status(401).json({ error: 'Email ou senha incorretos' });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/usuarios', (req, res) => {
  const usuarios = getAllUsuarios();
  res.json(usuarios);
});

app.post('/api/usuarios', (req, res) => {
  try {
    const usuario = addUsuario(req.body);
    res.json(usuario);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/usuarios/:id', (req, res) => {
  try {
    updateUsuario(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/usuarios/:id', (req, res) => {
  try {
    updateUsuario(parseInt(req.params.id), { ativo: 0 });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/bot/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Teste do Bot</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        body { background: #f5f5f5; padding: 20px; }
        .chat-box { max-width: 600px; margin: 0 auto; }
        .message { padding: 10px 15px; border-radius: 15px; margin-bottom: 10px; max-width: 80%; }
        .user-msg { background: #007bff; color: white; margin-left: auto; }
        .bot-msg { background: #e9ecef; color: #333; }
        .input-group { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); max-width: 600px; width: 100%; }
      </style>
    </head>
    <body>
      <div class="chat-box">
        <div class="card">
          <div class="card-header bg-dark text-white">🤖 Teste do Bot WhatsApp</div>
          <div class="card-body" id="chat" style="height: 400px; overflow-y: auto;"></div>
        </div>
      </div>
      <div class="input-group">
        <input type="text" class="form-control" id="msg" placeholder="Digite sua mensagem..." onkeyup="if(event.key==='Enter')send()">
        <button class="btn btn-primary" onclick="send()">Enviar</button>
      </div>
      <script>
        async function send() {
          const input = document.getElementById('msg');
          const text = input.value.trim();
          if (!text) return;
          
          addMessage(text, 'user-msg');
          input.value = '';
          
          const resp = await fetch('/api/bot/testsend', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text })
          });
          const data = await resp.json();
          addMessage(data.response, 'bot-msg');
        }
        
        function addMessage(text, type) {
          const div = document.createElement('div');
          div.className = 'message ' + type;
          div.innerHTML = text.replace(/\\n/g, '<br>').replace(/\\d️⃣/g, m => m);
          document.getElementById('chat').appendChild(div);
          document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;
        }
      </script>
    </body>
    </html>
  `);
});

app.post('/api/bot/testsend', express.json(), async (req, res) => {
  const { text } = req.body;
  const mockSock = {
    sendMessage: async (to, msg) => { 
      console.log('Bot:', msg.text); 
    }
  };
  const response = await processMessage(mockSock, 'test@test.com', text);
  res.json({ response });
});

let sock = null;
let connected = false;
let reconnectAttempts = 0;
let lastSearchResults = [];
let currentQR = null;
const MAX_RECONNECT_ATTEMPTS = 10;

async function startBot() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('❌ Limite de tentativas de reconexão atingido. Reinicie o servidor.');
    return;
  }

  console.log(`🔄 Tentando conexão... (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
  
  try {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth'));
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      browser: ['Revenda Auto Bot', 'Chrome', '120.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr;
        console.log('\n=== ESCANEIE O QR CODE ===\n');
        QRCode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
          if (!err) {
            console.log(url);
            console.log('\nWhatsApp Web > three dots (⋮) > Linked devices > Connect a device');
            console.log('==========================\n');
          }
        });
      } else if (connection === 'open') {
        currentQR = null;
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const reasonName = DisconnectReason[reason] || reason;
        console.log(`⚠️ Conexão fechada: ${reasonName}`);
        
        if (reason === DisconnectReason.loggedOut) {
          console.log('❌ Sessão expirou. Remova a pasta "auth" e escaneie novamente.');
        } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = Math.min(5000 * reconnectAttempts, 30000);
          console.log(`⏳ Reconectando em ${delay/1000}s...`);
          setTimeout(startBot, delay);
        }
      } else if (connection === 'open') {
        connected = true;
        reconnectAttempts = 0;
        console.log('\n✅ BOT CONECTADO AO WHATSAPP!\n');
      }
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar o bot:', error.message);
    console.log('⏳ Tentando novamente em 10s...');
    setTimeout(startBot, 10000);
  }

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages[0]?.key.fromMe) {
      const msg = messages[0];
      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

      if (text) {
        console.log(`[${from}]: ${text}`);
        
        const conversa = getOuCriarConversa(from);
        adicionarMensagem(conversa.id, from, 'recebida', text);
        atualizarConversa(conversa.id, text);
        
        const clienteExistente = getClienteByTelefone(from);
        if (!clienteExistente) {
          const nome = msg.pushName || '';
          addCliente({
            telefone: from,
            nome: nome,
            fonte: 'whatsapp',
            status: 'novo',
            veiculo_interesse: '',
            observacoes: 'Cadastrado automaticamente via WhatsApp'
          });
          console.log(`✓ Novo cliente cadastrado: ${from}`);
        }
        
        logBotMessage(from, 'recebida', text.substring(0, 50));
        updateBotStats('mensagem_recebida');
        await processMessage(sock, from, text);
      }
    }
  });
}

async function processMessage(sock, from, text) {
  const normalized = text.toLowerCase().trim();
  
  const config = getConfig();
  const nomeLoja = config?.nome_loja || 'Revenda Auto';
  
  if (config.groq_ativado && config.groq_api_key) {
    const groqResponse = await fetch('https://api.groq.com/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.groq_api_key}`
      },
      body: JSON.stringify({ message: text })
    });
    const groqData = await groqResponse.json();

    if (sock.sendMessage && groqData.response) {
      await sock.sendMessage(from, { text: groqData.response });
      logBotMessage(from, 'enviada', 'Resposta Groq');
      updateBotStats('mensagem_ia');
      return groqData.response;
    }
  }

  const menuText = `🏠 *BEM-VINDO À ${nomeLoja.toUpperCase()}*

 1️⃣ - Ver veículos disponíveis
 2️⃣ - Buscar veículo específico
 3️⃣ - Falar com atendente

 Digite o número da opção.`;

  const saudações = ['oi', 'olá', 'ola', 'olaa', 'oooi', 'hello', 'hi', 'hey', 'bom dia', 'boa tarde', 'boa noite', 'buenos días', 'buenas'];
  if (saudações.some(s => normalized === s || normalized.startsWith(s + ' '))) {
    const response = `Olá! 👋\n\nSou o assistente da ${nomeLoja}!\n\nComo posso ajudar?\n\n1️⃣ - Ver veículos disponíveis\n2️⃣ - Buscar veículo específico\n3️⃣ - Falar com atendente\n\nDigite o número da opção.`;
    if (sock.sendMessage) {
      await sock.sendMessage(from, { text: response });
      logBotMessage(from, 'enviada', 'Saudação');
      updateBotStats('mensagem_enviada');
      updateBotStats('conversa_iniciada');
    }
    return response;
  }

  if (normalized === 'menu' || normalized === 'inicio') {
    const response = menuText;
    if (sock.sendMessage) {
      await sock.sendMessage(from, { text: menuText });
      updateBotStats('mensagem_enviada');
    }
    return menuText;
  }

  if (normalized === 'menu' || normalized === 'inicio') {
    lastSearchResults = [];
    const vehicles = getAllVehicles();
    let response;
    if (vehicles.length === 0) {
      response = 'Nenhum veículo disponível no momento.';
    } else {
      response = '🚗 *Veículos Disponíveis:*\n\n';
      vehicles.slice(0, 10).forEach((v, i) => {
        response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
      });
      if (vehicles.length > 10) {
        response += `\n... e mais ${vehicles.length - 10} veículos. Digite "todos" para ver completa.`;
      }
    }
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  if (normalized === '2') {
    lastSearchResults = [];
    const buscaOptions = `🔍 *BUSCA DE VEÍCULO*

Como você deseja buscar?

1️⃣ - Por modelo (ex: Gol, Civic, Spin)
2️⃣ - Por marca (ex: Volkswagen, Honda)
3️⃣ - Por faixa de preço

Digite o número da opção.`;
    if (sock.sendMessage) await sock.sendMessage(from, { text: buscaOptions });
    return buscaOptions;
  }

  if (normalized === 'marca' || normalized === 'm') {
    lastSearchResults = [];
    const brands = [...new Set(getAllVehicles().map(v => v.marca))];
    let response = `🔍 *Buscar por marca*\n\n*Marcas disponíveis:*\n`;
    brands.forEach((m, i) => {
      response += `${i + 1}. ${m}\n`;
    });
    response += `\nDigite o número da marca que deseja ver os modelos.`;
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  if (normalized === 'preço' || normalized === 'preco' || normalized === 'p') {
    lastSearchResults = [];
    const response = '🔍 *Buscar por faixa de preço*\n\nQual faixa de preço você busca?\n\n💡 Você pode digitar de várias formas:\n- "de 30000 até 50000"\n- "30000 a 50000"\n- "30 mil a 50 mil"';
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  const priceMatch = normalized.match(/(?:de\s+)?(\d+(?:\.\d+)?)\s*(?:mil|milhar)?\s*(?:a|até|ate)\s*(\d+(?:\.\d+)?)\s*(?:mil|milhar)?/i);
  if (priceMatch) {
    let min = parseFloat(priceMatch[1].replace(/\./g, ''));
    let max = parseFloat(priceMatch[2].replace(/\./g, ''));
    
    if (normalized.includes('mil') && min < 1000) min = min * 1000;
    if (normalized.includes('mil') && max < 1000) max = max * 1000;
    
    lastSearchResults = [];
    const vehicles = getAllVehicles().filter(v => v.preco >= min && v.preco <= max);
    
    let response;
    if (vehicles.length === 0) {
      response = `😕 Não temos veículos nessa faixa de R$ ${min.toLocaleString('pt-BR')} até R$ ${max.toLocaleString('pt-BR')}.\n\n- Digite "preço" para nova busca\n- Digite "menu" para voltar`;
    } else {
      lastSearchResults = vehicles;
      response = `🚗 *Veículos entre R$ ${min.toLocaleString('pt-BR')} e R$ ${max.toLocaleString('pt-BR')}:*\n\n`;
      vehicles.forEach((v, i) => {
        response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
      });
      response += '\nDigite o número para ver detalhes.';
    }
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  if (normalized === '3') {
    lastSearchResults = [];
    
    const existingCliente = getClienteByTelefone(from);
    if (!existingCliente) {
      addCliente({
        telefone: from,
        nome: '',
        fonte: 'whatsapp',
        status: 'interessado',
        veiculo_interesse: '',
        observacoes: 'Solicitou atendimento via bot'
      });
    } else {
      updateCliente(existingCliente.id, { status: 'interessado', observacoes: (existingCliente.observacoes || '') + '; Atualizado: solicitou atendimento' });
    }
    
    const response = '📞 Em breve nosso atendente entrará em contato.\n\nHorário: Seg-Sáb 9h-18h';
    if (sock.sendMessage) {
      await sock.sendMessage(from, { text: response });
      logBotMessage(from, 'enviada', 'Atendente solicitado');
      updateBotStats('mensagem_enviada');
      updateBotStats('interessado');
    }
    return response;
  }

  if (normalized === '1') {
    const vehicles = getAllVehicles();
    let response;
    if (vehicles.length === 0) {
      response = 'Nenhum veículo disponível no momento.';
    } else {
      if (normalized.match(/^(\d+)$/)) {
        const num = parseInt(normalized);
        if (num > 0 && num <= vehicles.length) {
          const v = vehicles[num - 1];
          const responseDet = `🚗 *${v.marca} ${v.modelo} ${v.ano}*

💰 Preço: R$ ${v.preco.toLocaleString('pt-BR')}
🎨 Cor: ${v.cor || 'Não informada'}
📊 KM: ${(v.quilometragem || 0).toLocaleString('pt-BR')}
📝 ${v.descricao || 'Sem descrição'}

Interessado? Digite:
- "whatsapp" para falar no WhatsApp
- "menu" para voltar ao menu principal`;
          if (sock.sendMessage) {
            await sock.sendMessage(from, { text: responseDet });
            logBotMessage(from, 'enviada', 'Detalhes veículo');
            updateBotStats('mensagem_enviada');
          }
          return responseDet;
        }
      }
      response = '🚗 *Veículos Disponíveis:*\n\n';
      vehicles.slice(0, 10).forEach((v, i) => {
        response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
      });
      if (vehicles.length > 10) {
        response += `\n... e mais ${vehicles.length - 10} veículos. Digite "todos" para ver completa.`;
      }
      logBotMessage(from, 'enviada', 'Listou veículos');
      updateBotStats('mensagem_enviada');
      updateBotStats('veiculo_buscado');
    }
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  if (normalized === 'todos') {
    const vehicles = getAllVehicles();
    let response = '🚗 *Todos os Veículos:*\n\n';
    vehicles.forEach((v, i) => {
      response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
    });
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  if (normalized === '2') {
    const response = 'Digite a marca que deseja buscar (ex: Volkswagen, Honda, Ford):';
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  if (normalized === '3') {
    const response = 'Qual faixa de preço você busca?\n\nDigite no formato: de-minimo até-maximo\nExemplo: de 30000 até 60000';
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  if (normalized.match(/^\d+$/) && !['1','2','3'].includes(normalized)) {
    const num = parseInt(normalized);
    const vehicles = getAllVehicles();
    
    if (lastSearchResults && num > 0 && num <= lastSearchResults.length) {
      const v = lastSearchResults[num - 1];
      const responseDet = `🚗 *${v.marca} ${v.modelo} ${v.ano}*

💰 Preço: R$ ${v.preco.toLocaleString('pt-BR')}
🎨 Cor: ${v.cor || 'Não informada'}
📊 KM: ${(v.quilometragem || 0).toLocaleString('pt-BR')}
📝 ${v.descricao || 'Sem descrição'}

Interessado? Digite:
- "whatsapp" para falar no WhatsApp
- "menu" para voltar ao menu principal`;
      if (sock.sendMessage) await sock.sendMessage(from, { text: responseDet });
      return responseDet;
    }
    
    if (num > 0 && num <= vehicles.length) {
      const v = vehicles[num - 1];
      const responseDet = `🚗 *${v.marca} ${v.modelo} ${v.ano}*

💰 Preço: R$ ${v.preco.toLocaleString('pt-BR')}
🎨 Cor: ${v.cor || 'Não informada'}
📊 KM: ${(v.quilometragem || 0).toLocaleString('pt-BR')}
📝 ${v.descricao || 'Sem descrição'}

Interessado? Digite:
- "whatsapp" para falar no WhatsApp
- "menu" para voltar ao menu principal`;
      if (sock.sendMessage) await sock.sendMessage(from, { text: responseDet });
      return responseDet;
    }
  }

  const brands = [...new Set(getAllVehicles().map(v => v.marca))];
  const num = parseInt(normalized);
  if (normalized.match(/^\d+$/) && num > 0 && num <= brands.length) {
    const marcaSelecionada = brands[num - 1];
    const vehicles = getAllVehicles().filter(v => v.marca === marcaSelecionada);
    let response = `🚗 *Veículos ${marcaSelecionada}:*\n\n`;
    vehicles.forEach((v, i) => {
      response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
    });
    response += '\nDigite o número para ver detalhes ou "menu" para voltar.';
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  const searchResult = searchVehicles(text);
  if (searchResult.length > 0) {
    lastSearchResults = searchResult;
    
    if (normalized.match(/^(\d+)$/)) {
      const num = parseInt(normalized);
      if (num > 0 && num <= searchResult.length) {
        const v = searchResult[num - 1];
        const response = `🚗 *${v.marca} ${v.modelo} ${v.ano}*

💰 Preço: R$ ${v.preco.toLocaleString('pt-BR')}
🎨 Cor: ${v.cor || 'Não informada'}
📊 KM: ${(v.quilometragem || 0).toLocaleString('pt-BR')}
📝 ${v.descricao || 'Sem descrição'}

Interessado? Digite:
- "whatsapp" para falar no WhatsApp
- "menu" para voltar ao menu principal`;
        if (sock.sendMessage) {
          await sock.sendMessage(from, { text: response });
          logBotMessage(from, 'enviada', 'Resultado busca');
          updateBotStats('mensagem_enviada');
          updateBotStats('veiculo_buscado');
        }
        return response;
      }
    }
    let response = `🔍 *Resultados para "${text}":*\n\n`;
    searchResult.forEach((v, i) => {
      response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
    });
    response += '\nDigite o número para ver detalhes.';
    if (sock.sendMessage) {
      await sock.sendMessage(from, { text: response });
      updateBotStats('mensagem_enviada');
      updateBotStats('veiculo_buscado');
    }
    return response;
  }

  const marcaBusca = text.toLowerCase();
  const vehiclesPorMarca = getAllVehicles().filter(v => 
    v.marca.toLowerCase().includes(marcaBusca)
  );
  if (vehiclesPorMarca.length > 0) {
    let response = `🔍 *Veículos da marca "${text}":*\n\n`;
    vehiclesPorMarca.forEach((v, i) => {
      response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
    });
    response += '\nDigite o número para detalhes.';
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  const similar = getSimilarVehicles(text, 3);
  if (similar.length > 0) {
    let response = `😕 O veículo "${text}" não foi encontrado nos disponíveis.\n\n`;
    response += `Mas tenho veículos similares:\n\n`;
    similar.forEach((v, i) => {
      response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
    });
    response += '\nDeseja ver mais opções? Digite:\n- "todos" para ver todos\n- "marca" para buscar por marca\n- "preço" para buscar por faixa de preço';
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  if (brands.length > 0) {
    const similar = getSimilarVehicles(text, 3);
    
    let response = `😕 O veículo "${text}" não foi encontrado no momento.\n\n`;
    
    if (similar.length > 0) {
      response += `*Talvez você se interesse por:*\n\n`;
      similar.forEach((v, i) => {
        response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
      });
      response += `\nDigite o número para ver detalhes ou continue buscando.`;
    } else {
      response += `*Temos outras opções disponíveis:*\n\n`;
      const vehicles = getAllVehicles();
      vehicles.slice(0, 5).forEach((v, i) => {
        response += `${i + 1}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
      });
      response += `\nDigite o número para ver detalhes.`;
    }
    
    response += `\n\n📌 *Quer buscar de outra forma?*\n`;
    response += `   - Digite "marca" para buscar por marca\n`;
    response += `   - Digite "preço" para buscar por faixa de preço\n`;
    response += `   - Digite "menu" para voltar ao menu principal`;
    
    if (sock.sendMessage) await sock.sendMessage(from, { text: response });
    return response;
  }

  if (sock.sendMessage) {
    await sock.sendMessage(from, { text: menuText });
    updateBotStats('mensagem_enviada');
  }
  return menuText;
}

const PORT = 3000;
app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   🚗  REVENDA AUTO - BOT WHATSAPP             ║
║                                               ║
║   📊 Painel:  http://localhost:${PORT}          ║
║   🤖 Bot:     Aguardando conexão...            ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);
  
  await initDatabase();
  await startBot();
});