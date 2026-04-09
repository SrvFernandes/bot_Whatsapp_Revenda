import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const masterDbPath = path.join(__dirname, '..', 'data', 'master.db');

let masterDb = null;

/**
 * Gera um código de indicação único baseado no nome
 */
function generateReferralCode(nome) {
  const prefix = nome.substring(0, 3).toUpperCase();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${random}`;
}

export function getRevendaByReferralCode(code) {
  return queryOneMaster('SELECT * FROM revendas WHERE referral_code = ?', [code]);
}

export async function initMasterDatabase() {
  const SQL = await initSqlJs();
  
  if (!fs.existsSync(path.dirname(masterDbPath))) {
    fs.mkdirSync(path.dirname(masterDbPath), { recursive: true });
  }

  if (fs.existsSync(masterDbPath)) {
    const buffer = fs.readFileSync(masterDbPath);
    masterDb = new SQL.Database(buffer);
    console.log('✓ Banco Master carregado');
  } else {
    masterDb = new SQL.Database();
    console.log('✓ Banco Master criado do zero');
  }

  // Tabela de Revendas (Clientes do SaaS)
  masterDb.run(`
    CREATE TABLE IF NOT EXISTS revendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      whatsapp_id TEXT,
      status TEXT DEFAULT 'ativo', -- ativo, bloqueado, expirado
      data_expiracao DATETIME,
      ativo INTEGER DEFAULT 1,
      api_key_groq TEXT,
      asaas_customer_id TEXT,
      asaas_subscription_id TEXT,
      valor_mensalidade REAL DEFAULT 249.00,
      referral_code TEXT UNIQUE,
      referred_by_id INTEGER REFERENCES revendas(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Pagamentos/Histórico
  masterDb.run(`
    CREATE TABLE IF NOT EXISTS pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      revenda_id INTEGER,
      valor REAL,
      status TEXT,
      metodo TEXT,
      gateway_id TEXT,
      pago_em DATETIME,
      vencimento DATETIME,
      FOREIGN KEY(revenda_id) REFERENCES revendas(id)
    )
  `);

  // Migration: Garantir que colunas novas existam (SaaS/MGM)
  const columns = [
    { name: 'status', type: "TEXT DEFAULT 'ativo'" },
    { name: 'asaas_customer_id', type: 'TEXT' },
    { name: 'asaas_subscription_id', type: 'TEXT' },
    { name: 'valor_mensalidade', type: 'REAL DEFAULT 249.00' },
    { name: 'referral_code', type: 'TEXT UNIQUE' },
    { name: 'referred_by_id', type: 'INTEGER REFERENCES revendas(id)' }
  ];

  columns.forEach(col => {
    try {
      masterDb.run(`ALTER TABLE revendas ADD COLUMN ${col.name} ${col.type}`);
      console.log(`✓ Coluna adicionada: ${col.name}`);
    } catch (e) {
      // Já existe ou erro na alteração
    }
  });

  saveMasterDatabase();
  return masterDb;
}

function saveMasterDatabase() {
  const data = masterDb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(masterDbPath, buffer);
}

export function queryAllMaster(sql, params = []) {
  const stmt = masterDb.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function queryOneMaster(sql, params = []) {
  const results = queryAllMaster(sql, params);
  return results[0] || null;
}

export function executeMaster(sql, params = []) {
  masterDb.run(sql, params);
  saveMasterDatabase();
}

// Funções de Gerenciamento SaaS & MGM

export function getRevendaBySlug(slug) {
  return queryOneMaster('SELECT * FROM revendas WHERE slug = ? AND ativo = 1', [slug]);
}

export function getAllRevendas() {
  return queryAllMaster('SELECT * FROM revendas ORDER BY nome');
}

/**
 * Cria uma nova revenda (SaaS) com suporte a indicações
 */
export function createRevenda(nome, slug, referidoPorId = null) {
  const dataExpiracao = new Date();
  dataExpiracao.setDate(dataExpiracao.getDate() + 7); // 7 dias de trial
  
  const referralCode = generateReferralCode(nome);
  
  executeMaster(`
    INSERT INTO revendas (nome, slug, data_expiracao, referred_by_id, referral_code) 
    VALUES (?, ?, ?, ?, ?)`,
    [nome, slug, dataExpiracao.toISOString(), referidoPorId, referralCode]
  );
  
  return getRevendaBySlug(slug);
}

/**
 * Recalcula desconto por indicações ativas
 */
export function updateReferrerDiscount(referrerId) {
  const referrals = queryAllMaster(`
    SELECT id FROM revendas 
    WHERE referred_by_id = ? AND status = 'ativo'
  `, [referrerId]);

  const count = referrals.length;
  let novoValor = 249.00;
  
  if (count >= 4) novoValor = 150.00;
  else if (count >= 2) novoValor = 200.00;

  executeMaster('UPDATE revendas SET valor_mensalidade = ? WHERE id = ?', [novoValor, referrerId]);
  
  console.log(`[MasterDB] Desconto atualizado para ID ${referrerId}: ${count} indicações -> R$ ${novoValor}`);
}

/**
 * Renova assinatura e aciona bônus para o padrinho
 */
export function renovarAssinatura(asaasCustomerId, dias = 30) {
  const revenda = queryOneMaster('SELECT * FROM revendas WHERE asaas_customer_id = ?', [asaasCustomerId]);
  
  if (!revenda) return { success: false };

  const baseDate = new Date(revenda.data_expiracao || Date.now());
  const now = new Date();
  const finalBase = baseDate < now ? now : baseDate;
  
  finalBase.setDate(finalBase.getDate() + dias);
  const novaData = finalBase.toISOString();
  
  executeMaster('UPDATE revendas SET status = ?, data_expiracao = ? WHERE id = ?', 
    ['ativo', novaData, revenda.id]);

  let padrinho = null;
  // Se foi indicado por alguém, atualiza o desconto do "Padrinho"
  if (revenda.referred_by_id) {
    updateReferrerDiscount(revenda.referred_by_id);
    padrinho = queryOneMaster('SELECT * FROM revendas WHERE id = ?', [revenda.referred_by_id]);
  }

  return { 
    success: true, 
    revenda: { ...revenda, data_expiracao: novaData },
    padrinho 
  };
}

export function checkAssinatura(slug) {
  const revenda = getRevendaBySlug(slug);
  if (!revenda) return { valid: false, reason: 'não encontrada' };
  
  if (revenda.status === 'bloqueado') return { valid: false, reason: 'bloqueado' };
  
  const expira = new Date(revenda.data_expiracao);
  const hoje = new Date();
  
  if (hoje > expira) {
    executeMaster('UPDATE revendas SET status = ? WHERE slug = ?', ['expirado', slug]);
    return { valid: false, reason: 'expirado', revenda };
  }
  
  return { valid: true, revenda };
}

// --- Funções Administrativas ---

export function getAdminStats() {
  const total = queryOneMaster('SELECT COUNT(*) as count FROM revendas').count;
  const ativas = queryOneMaster("SELECT COUNT(*) as count FROM revendas WHERE status = 'ativo'").count;
  const expiradas = queryOneMaster("SELECT COUNT(*) as count FROM revendas WHERE status = 'expirado'").count;
  const bloqueadas = queryOneMaster("SELECT COUNT(*) as count FROM revendas WHERE status = 'bloqueado'").count;
  const faturamento = queryOneMaster('SELECT SUM(valor_mensalidade) as total FROM revendas WHERE status = "ativo"').total || 0;

  return { total, ativas, expiradas, bloqueadas, faturamento };
}

export function getDetailedRevendas() {
  return queryAllMaster(`
    SELECT r.*, 
    (SELECT COUNT(*) FROM revendas f WHERE f.referred_by_id = r.id AND f.status = 'ativo') as indicações_ativas
    FROM revendas r
    ORDER BY r.created_at DESC
  `);
}

export function toggleRevendaStatus(id, novoStatus) {
  executeMaster('UPDATE revendas SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [novoStatus, id]);
  return true;
}

export function manualExtendAssinatura(id, dias = 30) {
  const revenda = queryOneMaster('SELECT data_expiracao FROM revendas WHERE id = ?', [id]);
  if (!revenda) return false;

  const base = new Date(revenda.data_expiracao || Date.now());
  const now = new Date();
  const finalBase = base < now ? now : base;
  
  finalBase.setDate(finalBase.getDate() + dias);
  
  executeMaster('UPDATE revendas SET data_expiracao = ?, status = "ativo" WHERE id = ?', [finalBase.toISOString(), id]);
  return true;
}
