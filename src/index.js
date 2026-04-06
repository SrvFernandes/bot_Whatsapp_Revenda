import { createInterface } from 'readline';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from 'baileys';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, getAllVehicles, getVehicleById, searchVehicles, getSimilarVehicles, addVehicle, updateStatus } from './database/db.js';
import { AgenteCadastro } from './agents/agenteCadastro.js';
import { AgenteConsulta } from './agents/agenteConsulta.js';
import { AgenteRecomendacao } from './agents/agenteRecomendacao.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const agenteCadastro = new AgenteCadastro();
const agenteConsulta = new AgenteConsulta();
const agenteRecomendacao = new AgenteRecomendacao();

let activeRegistrations = new Map();
let awaitingResponse = new Map();

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth'));
  
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    browser: ['Revenda Auto Bot', 'Chrome', '120.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n=== ESCANEIE O QR CODE ABAIXO ===');
      console.log('Abra o WhatsApp > Configurações > Aparelhos');
      console.log('==============================\n');
    }
    
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log('Conexão fechada:', DisconnectReason[reason]);
      
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(connectToWhatsApp, 5000);
      }
    } else if (connection === 'open') {
      console.log('\n✅ BOT CONECTADO AO WHATSAPP!\n');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages[0].key.fromMe) {
      const msg = messages[0];
      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
      
      if (text) {
        console.log(`\n[MENSAGEM] ${from}: ${text}`);
        await processMessage(sock, from, text);
      }
    }
  });

  return sock;
}

async function processMessage(sock, from, text) {
  const normalized = text.toLowerCase().trim();

  if (activeRegistrations.has(from)) {
    const result = agenteCadastro.processInput(from, text);
    
    if (result.status === 'continue' || result.status === 'confirm') {
      await sock.sendMessage(from, { text: result.message });
    } else if (result.status === 'success') {
      await sock.sendMessage(from, { text: result.message });
      activeRegistrations.delete(from);
    } else if (result.status === 'cancelled') {
      await sock.sendMessage(from, { text: result.message });
      activeRegistrations.delete(from);
    }
    return;
  }

  if (normalized === 'menu' || normalized === 'inicio' || normalized === 'start' || normalized === 'início') {
    await sendMainMenu(sock, from);
    return;
  }

  if (normalized === '1') {
    const vehicles = getAllVehicles();
    await sock.sendMessage(from, { text: agenteConsulta.formatListMessage(vehicles) });
    return;
  }

  if (normalized === '2') {
    await sock.sendMessage(from, { 
      text: '🔍 Buscar veículo\n\nDigite a marca, modelo ou ano que deseja buscar.\n\nExemplo: "Toyota Corolla" ou "2020"' 
    });
    awaitingResponse.set(from, 'search');
    return;
  }

  if (normalized === '3') {
    await sock.sendMessage(from, { 
      text: '📞 Em breve você será atendido por um de nossos consultores.\n\nHorário de atendimento: Segunda a Sábado das 9h às 18h.' 
    });
    return;
  }

  if (normalized === '4') {
    activeRegistrations.set(from, true);
    agenteCadastro.startRegistration(from);
    await sock.sendMessage(from, { 
      text: '🚗 *Cadastro de Veículo*\n\nVamos começar!\n\nQual a marca do veículo?' 
    });
    return;
  }

  if (awaitingResponse.get(from) === 'search') {
    awaitingResponse.delete(from);
    const searchResult = agenteConsulta.search(text);
    
    if (searchResult.found) {
      await sock.sendMessage(from, { text: agenteConsulta.formatListMessage(searchResult.results) });
    } else {
      const similar = getSimilarVehicles(text, 3);
      if (similar.length > 0) {
        const msg = agenteRecomendacao.formatRecommendationMessage(similar, text);
        await sock.sendMessage(from, { text: msg });
      } else {
        await sock.sendMessage(from, { 
          text: `Não encontrei veículos matching "${text}".\n\nDigite "menu" para ver as opções.` 
        });
      }
    }
    return;
  }

  const vehicleId = parseInt(normalized);
  if (!isNaN(vehicleId) && vehicleId > 0 && vehicleId <= 100) {
    const vehicle = getVehicleById(vehicleId);
    if (vehicle) {
      if (vehicle.status === 'vendido') {
        const msg = agenteRecomendacao.formatSoldMessage(vehicle);
        await sock.sendMessage(from, { text: msg });
      } else {
        const msg = agenteConsulta.formatVehicleMessage(vehicle);
        await sock.sendMessage(from, { text: msg });
      }
    } else {
      await sock.sendMessage(from, { text: 'Veículo não encontrado. Digite "menu" para ver as opções.' });
    }
    return;
  }

  const searchResult = agenteConsulta.search(text);
  if (searchResult.found) {
    await sock.sendMessage(from, { text: agenteConsulta.formatListMessage(searchResult.results) });
    return;
  }

  const similar = getSimilarVehicles(text, 3);
  if (similar.length > 0) {
    const msg = agenteRecomendacao.formatRecommendationMessage(similar, text);
    await sock.sendMessage(from, { text: msg });
    return;
  }

  await sendMainMenu(sock, from);
}

async function sendMainMenu(sock, from) {
  const menu = `🏠 *BEM-VINDO À REVENDA AUTO*

Seu concessionário virtual de confiança!

*O QUE VOCÊ DESEJA?*

1️⃣ - Ver veículos disponíveis
2️⃣ - Buscar veículo específico
3️⃣ - Falar com atendente
4️⃣ - Cadastrar veículo (venda)

Digite o número da opção desejada.`;

  await sock.sendMessage(from, { text: menu });
}

console.log('\n🤖 INICIANDO BOT DE REVENDA...\n');
await initDatabase();
connectToWhatsApp();