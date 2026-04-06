import { createInterface } from 'readline';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from './baileys.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth'));
  
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('Escaneie o QR Code acima com seu WhatsApp');
    }
    
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log('Conexão fechada:', reason);
      
      if (reason !== DisconnectReason.loggedOut) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('Conectado ao WhatsApp!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages[0].key.fromMe) {
      const message = messages[0];
      const from = message.key.remoteJid;
      const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
      
      if (text) {
        console.log(`Mensagem recebida de ${from}: ${text}`);
        await processMessage(sock, from, text);
      }
    }
  });
}

async function processMessage(sock, from, text) {
  const normalizedText = text.toLowerCase().trim();
  
  if (normalizedText === 'menu' || normalizedText === 'início' || normalizedText === 'start') {
    await sock.sendMessage(from, {
      text: `Bem-vindo à Revenda Auto! 🚗

Escolha uma opção:
1️⃣ - Ver veículos disponíveis
2️⃣ - Buscar veículo específico
3️⃣ - Falar com atendente

Digite o número da opção desejada.`
    });
    return;
  }

  if (normalizedText === '1') {
    const vehicles = getVehicles();
    if (vehicles.length === 0) {
      await sock.sendMessage(from, { text: 'Nenhum veículo disponível no momento.' });
    } else {
      let response = '🚗 Veículos Disponíveis:\n\n';
      vehicles.forEach(v => {
        response += `${v.id}. ${v.marca} ${v.modelo} ${v.ano}\n   R$ ${v.preco.toLocaleString('pt-BR')}\n   ${v.quilometragem}km\n\n`;
      });
      response += '\nDigite o número do veículo para mais detalhes.';
      await sock.sendMessage(from, { text: response });
    }
    return;
  }

  const vehicleId = parseInt(normalizedText);
  if (!isNaN(vehicleId)) {
    const vehicle = getVehicleById(vehicleId);
    if (vehicle) {
      const details = `
🚗 ${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}

💰 Preço: R$ ${vehicle.preco.toLocaleString('pt-BR')}
📊 Quilometragem: ${vehicle.quilometragem.toLocaleString('pt-BR')} km
🎨 Cor: ${vehicle.cor}

${vehicle.descricao || 'Veículo em excelente estado de conservação.'}

Para mais informações ou agendar uma visita, digite "agendar".`;
      await sock.sendMessage(from, { text: details });
    }
    return;
  }

  const searchResult = searchVehicles(normalizedText);
  if (searchResult.length > 0) {
    let response = `🔍 Resultados para "${text}":\n\n`;
    searchResult.forEach(v => {
      response += `${v.id}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}\n`;
    });
    response += '\nDigite o número para ver detalhes.';
    await sock.sendMessage(from, { text: response });
  } else {
    const similar = getSimilarVehicles(normalizedText);
    if (similar.length > 0) {
      await sock.sendMessage(from, {
        text: `Não encontramos "${text}", mas temos opções similares:\n\n` +
          similar.map(v => `${v.id}. ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}`).join('\n')
      });
    } else {
      await sock.sendMessage(from, {
        text: `Não encontrei veículos matching "${text}".\n\nDigite "menu" para ver as opções.`
      });
    }
  }
}

function getVehicles() {
  const db = loadDatabase();
  return db.veiculos.filter(v => v.status === 'disponivel');
}

function getVehicleById(id) {
  const db = loadDatabase();
  return db.veiculos.find(v => v.id === id);
}

function searchVehicles(query) {
  const db = loadDatabase();
  const q = query.toLowerCase();
  return db.veiculos.filter(v => 
    v.status === 'disponivel' && (
      v.marca.toLowerCase().includes(q) ||
      v.modelo.toLowerCase().includes(q) ||
      v.ano.toString().includes(q)
    )
  );
}

function getSimilarVehicles(query) {
  const db = loadDatabase();
  const q = query.toLowerCase();
  return db.veiculos
    .filter(v => v.status === 'disponivel')
    .filter(v => 
      v.marca.toLowerCase().includes(q) ||
      v.modelo.toLowerCase().includes(q)
    )
    .slice(0, 3);
}

function loadDatabase() {
  const dbPath = path.join(__dirname, '..', 'data', 'database.json');
  if (fs.existsSync(dbPath)) {
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }
  return { veiculos: [], nextId: 1 };
}

connectToWhatsApp();