import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import QRCode from 'qrcode';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

// Serviços e Banco de Dados
import whatsappService from './services/whatsapp.js';
import botEngine from './services/botEngine.js';
import { 
  initMasterDatabase, 
  getRevendaBySlug, 
  checkAssinatura, 
  renovarAssinatura,
  getAdminStats,
  getDetailedRevendas,
  toggleRevendaStatus,
  manualExtendAssinatura
} from './database/master.js';
import * as db from './database/db.js';
import { getMarcasComModelos, getModelos, getAnos } from './data/marcas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rota da Landing Page Comercial (Prioritária)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'landing.html'));
});

// Arquivos Estáticos Globais
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads')));

// Configuração de Upload (Centralizada)
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

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
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  }
});

// --- MIDDLEWARE DE TENANT (O CORAÇÃO DO SAAS) ---

const tenantManager = new Map(); // Cache de conexões slug -> { db, dbPath }

// Rota de Sistema para Limpar Cache (Útil para Demos e Updates de Banco)
app.post('/api/system/refresh-tenant/:slug', (req, res) => {
  const { slug } = req.params;
  if (tenantManager.has(slug)) {
    console.log(`[SYSTEM] Limpando cache do tenant: ${slug} para recarregar do disco.`);
    tenantManager.delete(slug);
  }
  res.json({ message: `Cache de ${slug} limpo. Próxima requisição recarregará do disco.` });
});

const tenantResolver = async (req, res, next) => {
  const slug = req.params.slug || req.headers['x-tenant-slug'];
  console.log(`[Resolver] Recebida requisição para tenant: ${slug}`);
  
  if (!slug) return res.status(400).json({ error: 'Slug da loja não fornecido' });

    // 1. Validar Assinatura no Master
    const validador = checkAssinatura(slug);
    console.log(`[Resolver] Verificação de assinatura para ${slug}:`, validador.valid);
    
    if (!validador.valid) {
      return res.status(403).json({ error: 'Assinatura inválida', reason: validador.reason });
    }

    try {
      // 2. Garantir conexão com o banco da loja
      if (!tenantManager.has(slug)) {
        console.log(`[V9] Inicializando banco para o tenant: ${slug}`);
        const dbInfo = await db.initTenantDatabase(slug);
        tenantManager.set(slug, dbInfo);
        // Iniciar bot se necessário (Bootstrap)
        whatsappService.startTenantBot(slug).catch(e => console.error(`[Bot] Erro ao iniciar ${slug}:`, e));
      }

      // 3. Injetar no Request
      const dbInstance = tenantManager.get(slug);
      req.tenant = {
        slug,
        revenda: validador.revenda,
        ...dbInstance,
        session: whatsappService.getSession(slug)
      };

      next();
    } catch (innerError) {
      console.error(`[CRITICAL] Falha no Tenant Resolver (${slug}):`, innerError);
      res.status(500).json({ 
        error: 'Conexão falhou', 
        details: innerError.message,
        slug: slug 
      });
    }
};

// --- ROTAS DO ADMIN (MASTER) ---

// Rota protegida (Futuramente adicionar Login)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/api/admin/dashboard', (req, res) => {
  try {
    const stats = getAdminStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/revendas', (req, res) => {
  try {
    const revendas = getDetailedRevendas();
    res.json(revendas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/revendas/:id/action', (req, res) => {
  const { id } = req.params;
  const { action, value } = req.body;

  try {
    if (action === 'toggle-status') {
      toggleRevendaStatus(id, value);
      return res.json({ success: true, message: `Status alterado para ${value}` });
    }
    
    if (action === 'extend') {
      manualExtendAssinatura(id, value || 30);
      return res.json({ success: true, message: 'Assinatura estendida com sucesso!' });
    }

    res.status(400).json({ error: 'Ação inválida' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ROTAS DO PAINEL ---


// Serve o index.html e injeta o Slug
app.get('/:slug', (req, res, next) => {
  const { slug } = req.params;
  if (slug.includes('.') || ['api', 'uploads', 'admin'].includes(slug)) return next();
  
  const revenda = getRevendaBySlug(slug);
  if (!revenda) return res.status(404).send('Revenda não encontrada');

  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- API ROUTES (PREFIXADAS POR SLUG) ---

// Veículos
app.get('/api/:slug/veiculos', tenantResolver, (req, res) => {
  const vehicles = db.filterVehicles(req.tenant.db, req.query);
  res.json(vehicles);
});

app.get('/api/:slug/veiculos/:id', tenantResolver, (req, res) => {
  const vehicle = db.getVehicleById(req.tenant.db, parseInt(req.params.id));
  vehicle ? res.json(vehicle) : res.status(404).json({ error: 'Não encontrado' });
});

app.post('/api/:slug/veiculos', tenantResolver, upload.array('fotos', 10), (req, res) => {
  const vehicleData = req.body;
  if (req.files) vehicleData.fotos = req.files.map(f => `/uploads/${f.filename}`);
  const result = db.addVehicle(req.tenant.db, req.tenant.dbPath, vehicleData);
  res.json(result);
});

app.put('/api/:slug/veiculos/:id', tenantResolver, (req, res) => {
  db.updateVehicle(req.tenant.db, req.tenant.dbPath, parseInt(req.params.id), req.body);
  res.json({ success: true });
});

app.patch('/api/:slug/veiculos/:id/status', tenantResolver, (req, res) => {
  db.updateStatus(req.tenant.db, req.tenant.dbPath, parseInt(req.params.id), req.body.status);
  res.json({ success: true });
});

// WhatsApp Bot Control
app.get('/api/:slug/bot/connection', tenantResolver, async (req, res) => {
  const session = req.tenant.session;
  let qrCode = null;
  if (session?.currentQR) qrCode = await QRCode.toDataURL(session.currentQR);
  res.json({
    connected: session?.connected || false,
    qr: qrCode
  });
});

// Rota de Teste do Bot (Nova Versão Multi-Tenant)
app.get('/api/:slug/bot/test', tenantResolver, async (req, res) => {
  res.json({
    success: true,
    canal: req.tenant.slug,
    status: req.tenant.session?.connected ? 'online' : 'offline',
    timestamp: new Date().toISOString()
  });
});

// Fallback Global para Teste (Evitar 404)
app.get('/api/bot/test', (req, res) => {
  res.json({ success: true, message: 'Servidor CarFlow SaaS Online. Use /api/:slug/bot/test para testar uma instância específica.' });
});

app.post('/api/:slug/bot/reconnect', tenantResolver, async (req, res) => {
  whatsappService.startTenantBot(req.tenant.slug);
  res.json({ success: true });
});

app.post('/api/:slug/bot/disconnect', tenantResolver, async (req, res) => {
  await whatsappService.disconnectTenant(req.tenant.slug);
  res.json({ success: true });
});

// Simulação do Chatbot (Emulator)
app.post('/api/:slug/bot/simulate', tenantResolver, async (req, res) => {
  const { message, userId } = req.body;
  const response = await botEngine.processMessage(
    req.tenant.slug, 
    req.tenant.db, 
    req.tenant.dbPath, 
    userId || 'simulated-user', 
    message
  );
  res.json({ response });
});

// WhatsApp Chat History
app.get('/api/:slug/conversas', tenantResolver, (req, res) => {
  const conversas = db.getAllConversas(req.tenant.db);
  res.json(conversas);
});

app.get('/api/:slug/conversas/:id/mensagens', tenantResolver, (req, res) => {
  const mensagens = db.getMensagensPorConversa(req.tenant.db, parseInt(req.params.id));
  res.json(mensagens);
});

app.post('/api/:slug/conversas/:id/atender', tenantResolver, (req, res) => {
  db.atualizarConversa(req.tenant.db, req.tenant.dbPath, parseInt(req.params.id), null, 'em_atendimento', 'Admin');
  res.json({ success: true });
});

// Estatísticas e Logs
app.get('/api/:slug/bot/stats', tenantResolver, (req, res) => {
  const stats = db.getBotStats(req.tenant.db, 30);
  res.json({ month: stats, today: stats[0] || {} });
});

app.get('/api/:slug/bot/logs', tenantResolver, (req, res) => {
  const logs = db.queryAll(req.tenant.db, 'SELECT * FROM bot_logs ORDER BY timestamp DESC LIMIT 20');
  res.json(logs);
});

app.get('/api/:slug/stats/trending', tenantResolver, (req, res) => {
  const marcas = db.getStatsBuscas(req.tenant.db, 'marca', 7);
  const modelos = db.getStatsBuscas(req.tenant.db, 'modelo', 7);
  res.json({ marcas, modelos });
});

// Clientes
app.get('/api/:slug/clientes', tenantResolver, (req, res) => {
  const clientes = db.getAllClientes(req.tenant.db);
  res.json(clientes);
});

app.get('/api/:slug/marcas', tenantResolver, (req, res) => {
  const marcas = db.queryAll(req.tenant.db, 'SELECT DISTINCT marca as label, marca as value FROM veiculos ORDER BY marca');
  res.json(marcas.length > 0 ? marcas : [{label: 'Chevrolet', value: 'Chevrolet'}, {label: 'Fiat', value: 'Fiat'}, {label: 'Ford', value: 'Ford'}, {label: 'VW', value: 'VW'}]);
});

app.get('/api/:slug/marcas/:marca/modelos', tenantResolver, (req, res) => {
  const { marca } = req.params;
  const modelos = db.queryAll(req.tenant.db, 'SELECT DISTINCT modelo FROM veiculos WHERE marca = ? ORDER BY modelo', [marca]);
  res.json(modelos.map(m => m.modelo));
});

app.get('/api/:slug/modelos/:modelo/anos', tenantResolver, (req, res) => {
  const { modelo } = req.params;
  const anos = db.queryAll(req.tenant.db, 'SELECT DISTINCT ano FROM veiculos WHERE modelo = ? ORDER BY ano DESC', [modelo]);
  res.json(anos.map(a => a.ano));
});

app.post('/api/:slug/bot/broadcast', tenantResolver, async (req, res) => {
  const { mensagem, filtros } = req.body;
  if (!mensagem) return res.status(400).json({ error: 'Mensagem é obrigatória' });

  const session = whatsappService.getSession(req.tenant.slug);
  if (!session || !session.connected) {
    return res.status(400).json({ error: 'O WhatsApp não está conectado para este canal.' });
  }

  try {
    const statusArray = Array.isArray(filtros) ? filtros : [];
    const clientes = db.getClientesFiltrados(req.tenant.db, statusArray);
    
    console.log(`[Broadcast] Iniciando envio para ${clientes.length} clientes segmentados (${statusArray.join(',') || 'Todos'}) da revenda ${req.tenant.slug}`);
    
    res.json({ success: true, message: `Iniciado envio para ${clientes.length} contatos filtrados.` });
    
    for (const cliente of clientes) {
      const telefone = cliente.telefone.replace(/\D/g, '');
      const remoteJid = `${telefone}@s.whatsapp.net`;
      
      try {
        await session.sock.sendMessage(remoteJid, { text: mensagem });
        db.updateBotStats(req.tenant.db, req.tenant.dbPath, 'mensagem_enviada');
        db.logBotMessage(req.tenant.db, req.tenant.dbPath, telefone, 'enviada', `[Broadcast] ${mensagem}`);
      } catch (err) {
        console.error(`[Broadcast Error] Falha ao enviar para ${telefone}:`, err);
      }
      
      // Delay de 1.5s entre mensagens para evitar spam/bloqueio
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log(`[Broadcast] Finalizado para ${req.tenant.slug}`);
  } catch (error) {
    // Como respondemos cedo, esse catch só loga
    console.error('[Broadcast Full Error]:', error);
  }
});

app.get('/api/:slug/config', tenantResolver, (req, res) => {
  try {
    if (!req.tenant || !req.tenant.db) {
      throw new Error('Tenant DB not loaded');
    }
    const localConfig = db.getConfig(req.tenant.db) || {};
    const nomeExibicao = req.tenant.revenda?.nome || req.tenant.slug || 'Minha Loja';
    
    res.json({
      ...localConfig,
      nome_loja: nomeExibicao,
      logo_url: req.tenant.revenda?.logo_url || '',
      status: 'online'
    });
  } catch (error) {
    console.error(`[Server] Erro critico na config de ${req.params.slug}:`, error.message);
    // Fallback de segurança para não quebrar o frontend
    res.json({ 
      nome_loja: req.params.slug,
      status: 'recovery-mode',
      mensagem_boas_vindas: 'Bem-vindo ao CarFlow'
    });
  }
});

app.post('/api/:slug/config', tenantResolver, (req, res) => {
  db.updateConfig(req.tenant.db, req.tenant.dbPath, req.body);
  res.json({ success: true });
});

// Marcas e Modelos (Helper)
app.get('/api/helper/marcas', (req, res) => res.json(getMarcasComModelos()));

// Autenticação (Multi-Tenant)
app.post('/api/:slug/login', tenantResolver, (req, res) => {
  const { email, senha } = req.body;
  const { slug } = req.tenant;
  console.log(`[V11] Tentativa de login | Tenant: ${slug} | Email: ${email}`);
  
  try {
    const user = db.loginUsuario(req.tenant.db, email, senha);
    if (user) {
      console.log(`[V11] Login SUCESSO | User: ${user.nome}`);
      res.json({ success: true, usuario: user, slug: req.tenant.slug });
    } else {
      console.warn(`[V11] Login FALHOU | Credenciais inválidas para: ${email}`);
      res.status(401).json({ error: 'Credenciais inválidas' });
    }
  } catch (err) {
    console.error(`[CRITICAL] Erro fatal no Login (${slug}):`, err);
    res.status(500).json({ error: 'Erro interno no servidor de autenticação' });
  }
});

// --- SISTEMA E ATUALIZAÇÕES (Global Admin) ---
app.post('/api/admin/update', async (req, res) => {
  try {
    const { stdout } = await execAsync('git pull origin main && npm install');
    res.json({ success: true, details: stdout });
    setTimeout(() => process.exit(0), 2000);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- WEBHOOK ASAAS (ASSINATURAS) ---
app.post('/api/webhooks/asaas', async (req, res) => {
  const tokenHeader = req.headers['asaas-access-token'];
  const tokenSecret = process.env.ASAAS_WEBHOOK_SECRET || 'token_padrao_carflow';

  // 1. Validar Segurança
  if (tokenHeader !== tokenSecret) {
    console.warn('[Asaas Webhook] Tentativa de acesso não autorizada');
    return res.status(401).json({ error: 'Token inválido' });
  }

  const { event, payment } = req.body;
  console.log(`[Asaas Webhook] Evento Recebido: ${event} | Pagamento: ${payment?.id}`);

  // 2. Processar Pagamento Confirmado
  if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
    const asaasCustomerId = payment.customer; // 'cus_XXXX'
    const result = renovarAssinatura(asaasCustomerId, 30);
    
    if (result.success) {
      // Notificar Padrinho se houve indicação
      if (result.padrinho) {
        const { padrinho, revenda } = result;
        const msg = `🚀 *BOAS NOTÍCIAS!* Sua indicação *${revenda.nome}* acaba de realizar o pagamento.
\nComo você tem *${padrinho.referrals_active || 'mais'}* indicações ativas, seu novo valor de mensalidade foi ajustado para *R$ ${padrinho.valor_mensalidade.toFixed(2).replace('.', ',')}*!
\nObrigado por ajudar a nossa rede a crescer! 👊`;

        const session = whatsappService.getSession(padrinho.slug);
        if (session && session.connected) {
          const remoteJid = `${padrinho.telefone.replace(/\D/g, '')}@s.whatsapp.net`;
          session.sock.sendMessage(remoteJid, { text: msg }).catch(err => console.error('Erro ao notificar padrinho:', err));
        }
      }
      return res.status(200).json({ success: true });
    } else {
      return res.status(404).json({ error: 'Revenda não encontrada' });
    }
  }

  // Ignorar outros eventos (CREATED, etc) com 200 OK
  res.status(200).send('OK');
});

// --- INICIALIZAÇÃO ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n🚀 SERVIDOR CARFLOW SaaS ONLINE [V29] [Porta ${PORT}]`);
  console.log('✓ Banco Master carregado e sincronizado');
  console.log('💡 DICA: Use CTRL+F5 no navegador para ver o novo visual Dark.');
  await initMasterDatabase();
  console.log('✓ Banco Master Inicializado');
});