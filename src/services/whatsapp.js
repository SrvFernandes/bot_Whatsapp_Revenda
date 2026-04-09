import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from 'baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Boom } from '@hapi/boom';
import * as db from '../database/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Gerenciador de Instâncias
class WhatsAppService {
  constructor() {
    this.sessions = new Map(); // slug -> { sock, connected, currentQR, reconnectAttempts }
  }

  async startTenantBot(slug) {
    console.log(`[WhatsApp] Iniciando bot da revenda: ${slug}`);
    
    // Caminho de autenticação isolado por cliente
    const authPath = path.join(__dirname, '..', '..', 'auth', slug);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      browser: ['CarFlow SaaS', 'Chrome', '1.0.0'],
      getMessage: async (key) => ({ conversation: 'Bot de Revenda' })
    });

    // Inicializar estado no Map
    this.sessions.set(slug, { 
      sock, 
      connected: false, 
      currentQR: null, 
      reconnectAttempts: 0 
    });

    const session = this.sessions.get(slug);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        session.currentQR = qr;
        console.log(`[${slug}] Novo QR Code disponível`);
      }

      if (connection === 'close') {
        session.connected = false;
        const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`[${slug}] Conexão fechada. Motivo: ${statusCode}. Reconectando: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          if (session.reconnectAttempts < 5) {
            session.reconnectAttempts++;
            setTimeout(() => this.startTenantBot(slug), 5000);
          }
        } else {
          console.log(`[${slug}] Desconectado (Sessão encerrada).`);
          fs.rmSync(authPath, { recursive: true, force: true });
          this.sessions.delete(slug);
        }
      } else if (connection === 'open') {
        session.connected = true;
        session.currentQR = null;
        session.reconnectAttempts = 0;
        console.log(`[${slug}] ✓ WhatsApp Conectado com sucesso!`);
      }
    });

    // Lógica de Mensagens Centralizada por Loja
    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      
      const { db: tenantDb, dbPath } = await db.initTenantDatabase(slug);

      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid;
        const telefone = remoteJid.replace('@s.whatsapp.net', '');
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        if (!texto) continue;

        // Logs no banco do cliente
        db.updateBotStats(tenantDb, dbPath, 'mensagem_recebida');
        db.logBotMessage(tenantDb, dbPath, telefone, 'recebida', texto);

        // Resposta Inteligente via BotEngine (Orquestrador de Agentes)
        const response = await botEngine.processMessage(slug, tenantDb, dbPath, telefone, texto);
        
        await sock.sendMessage(remoteJid, { text: response });
        db.updateBotStats(tenantDb, dbPath, 'mensagem_enviada');
        db.logBotMessage(tenantDb, dbPath, telefone, 'enviada', response);
      }
    });

    return sock;
  }

  getSession(slug) {
    return this.sessions.get(slug);
  }

  async disconnectTenant(slug) {
    const session = this.sessions.get(slug);
    if (session && session.sock) {
      session.sock.end(undefined);
      this.sessions.delete(slug);
      const authPath = path.join(__dirname, '..', '..', 'auth', slug);
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
      }
      return true;
    }
    return false;
  }
}

export default new WhatsAppService();
