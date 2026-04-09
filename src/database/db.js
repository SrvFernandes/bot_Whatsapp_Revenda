import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tenantDbsPath = path.join(__dirname, '..', 'data', 'tenants');

// Garantir que a pasta de tenants existe
if (!fs.existsSync(tenantDbsPath)) {
  fs.mkdirSync(tenantDbsPath, { recursive: true });
}

export async function initTenantDatabase(slug) {
  const dbFile = path.join(tenantDbsPath, `${slug}.db`);
  const SQL = await initSqlJs();
  let db;
  
  if (fs.existsSync(dbFile)) {
    const buffer = fs.readFileSync(dbFile);
    db = new SQL.Database(buffer);
    console.log(`✓ Banco [${slug}] carregado`);
  } else {
    db = new SQL.Database();
    console.log(`✓ Banco [${slug}] criado`);
  }

  // Schema
  db.run(`
    CREATE TABLE IF NOT EXISTS veiculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marca TEXT NOT NULL,
      modelo TEXT NOT NULL,
      ano INTEGER NOT NULL,
      cor TEXT,
      quilometragem INTEGER DEFAULT 0,
      preco REAL NOT NULL,
      descricao TEXT,
      fotos TEXT,
      placa TEXT,
      status TEXT DEFAULT 'disponivel' CHECK(status IN ('disponivel', 'vendido')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE TABLE IF NOT EXISTS bot_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, telefone TEXT NOT NULL, tipo TEXT NOT NULL, acao TEXT NOT NULL, detalhes TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS bot_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, data DATE DEFAULT CURRENT_DATE, mensagens_recebidas INTEGER DEFAULT 0, mensagens_enviadas INTEGER DEFAULT 0, conversas_iniciadas INTEGER DEFAULT 0, veiculos_buscados INTEGER DEFAULT 0, interessados INTEGER DEFAULT 0, UNIQUE(data))`);
  db.run(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, telefone TEXT NOT NULL UNIQUE, email TEXT, fonte TEXT DEFAULT 'whatsapp', veiculo_interesse TEXT, status TEXT DEFAULT 'novo', observacoes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS conversas (id INTEGER PRIMARY KEY AUTOINCREMENT, telefone TEXT NOT NULL, nome TEXT, ultima_mensagem TEXT, status TEXT DEFAULT 'aberta', vendedor_atendente TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS mensagens (id INTEGER PRIMARY KEY AUTOINCREMENT, conversa_id INTEGER NOT NULL, telefone TEXT NOT NULL, tipo TEXT NOT NULL, mensagem TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(conversa_id) REFERENCES conversas(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS termo_buscas (id INTEGER PRIMARY KEY AUTOINCREMENT, termo TEXT NOT NULL, tipo TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS configuracoes (id INTEGER PRIMARY KEY CHECK (id = 1), nome_loja TEXT, telefone_loja TEXT, mensagem_boas_vindas TEXT, groq_api_key TEXT, groq_ativado INTEGER DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE, senha TEXT NOT NULL, nivel TEXT DEFAULT 'vendedor' CHECK(nivel IN ('admin', 'vendedor')), ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  // Migrações
  try { db.run('ALTER TABLE configuracoes ADD COLUMN groq_api_key TEXT DEFAULT ""'); } catch(e){}
  try { db.run('ALTER TABLE configuracoes ADD COLUMN groq_ativado INTEGER DEFAULT 0'); } catch(e){}
  try { db.run('ALTER TABLE configuracoes ADD COLUMN horario_funcionamento TEXT DEFAULT ""'); } catch(e){}
  try { db.run('ALTER TABLE configuracoes ADD COLUMN endereco_loja TEXT DEFAULT ""'); } catch(e){}
  try { db.run('ALTER TABLE configuracoes ADD COLUMN possui_estacionamento INTEGER DEFAULT 0'); } catch(e){}

  // Garantir linha de configuração inicial
  db.run('INSERT OR IGNORE INTO configuracoes (id, nome_loja) VALUES (1, "Revenda CarFlow")');

  // --- BOOTSTRAP DE USUÁRIO V11 ---
  const adminEmail = 'admin@revenda.com';
  const adminExists = queryOne(db, 'SELECT id FROM usuarios WHERE email = ?', [adminEmail]);
  if (!adminExists) {
    console.log(`[V11] Criando Admin para o tenant: ${slug}`);
    execute(db, dbFile, `INSERT INTO usuarios (nome, email, senha, nivel, ativo) VALUES (?, ?, ?, ?, ?)`,
      ['Administrador', adminEmail, 'admin123', 'admin', 1]);
  } else {
    // Garantir que esteja ativo
    execute(db, dbFile, `UPDATE usuarios SET ativo = 1 WHERE email = ?`, [adminEmail]);
  }

  saveDatabase(db, dbFile);
  return { db, dbPath: dbFile };
}

export function saveDatabase(db, dbPath) {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) { results.push(stmt.getAsObject()); }
  stmt.free();
  return results;
}

export function queryOne(db, sql, params = []) {
  const results = queryAll(db, sql, params);
  return results[0] || null;
}

export function execute(db, dbPath, sql, params = []) {
  db.run(sql, params);
  saveDatabase(db, dbPath);
  try {
    const res = db.exec("SELECT last_insert_rowid()");
    return { lastInsertRowid: res[0]?.values[0][0] };
  } catch (e) {
    return { changes: 1 };
  }
}

// --- FUNÇÕES DE NEGÓCIO (TENANT AWARE) ---

export function getAllVehicles(db, status = 'disponivel') {
  return queryAll(db, 'SELECT * FROM veiculos WHERE status = ?', [status]);
}

export function filterVehicles(db, filters = {}) {
  let sql = 'SELECT * FROM veiculos WHERE 1=1';
  const params = [];

  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  } else {
    // Por padrão mostra disponíveis se não especificado 'vendido'
    sql += ' AND status = "disponivel"';
  }

  if (filters.marca) {
    sql += ' AND marca = ?';
    params.push(filters.marca);
  }

  if (filters.modelo) {
    sql += ' AND modelo = ?';
    params.push(filters.modelo);
  }

  if (filters.search) {
    const q = `%${filters.search}%`;
    sql += ' AND (marca LIKE ? OR modelo LIKE ? OR cor LIKE ?)';
    params.push(q, q, q);
  }

  sql += ' ORDER BY created_at DESC';
  return queryAll(db, sql, params);
}

export function getVehicleById(db, id) {
  return queryOne(db, 'SELECT * FROM veiculos WHERE id = ?', [id]);
}

export function searchVehicles(db, query) {
  const q = `%${query}%`;
  return queryAll(db, `
    SELECT * FROM veiculos 
    WHERE status = 'disponivel' 
    AND (marca LIKE ? OR modelo LIKE ? OR CAST(ano AS TEXT) LIKE ?)
  `, [q, q, q]);
}

export function addVehicle(db, dbPath, vehicle) {
  execute(db, dbPath, `
    INSERT INTO veiculos (marca, modelo, ano, cor, quilometragem, preco, descricao, fotos, placa, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    vehicle.marca, vehicle.modelo, vehicle.ano, vehicle.cor || '',
    vehicle.quilometragem || 0, vehicle.preco, vehicle.descricao || '',
    JSON.stringify(vehicle.fotos || []), vehicle.placa || '',
    vehicle.status || 'disponivel'
  ]);
  const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0][0];
  return { id: lastId, ...vehicle };
}

export function updateVehicle(db, dbPath, id, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id') {
      fields.push(`${key} = ?`);
      values.push(key === 'fotos' ? JSON.stringify(value) : value);
    }
  }
  values.push(id);
  execute(db, dbPath, `UPDATE veiculos SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
  return { changes: 1 };
}

export function updateStatus(db, dbPath, id, status) {
  execute(db, dbPath, 'UPDATE veiculos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  return { changes: 1 };
}

export function deleteVehicle(db, dbPath, id) {
  execute(db, dbPath, 'DELETE FROM veiculos WHERE id = ?', [id]);
}

export function logBotMessage(db, dbPath, telefone, tipo, acao, detalhes = '') {
  execute(db, dbPath, 'INSERT INTO bot_logs (telefone, tipo, acao, detalhes) VALUES (?, ?, ?, ?)',
    [telefone, tipo, acao, detalhes]);
}

export function updateBotStats(db, dbPath, tipo) {
  const today = new Date().toISOString().split('T')[0];
  const fieldMap = {
    'mensagem_recebida': 'mensagens_recebidas',
    'mensagem_enviada': 'mensagens_enviadas',
    'conversa_iniciada': 'conversas_iniciadas',
    'veiculo_buscado': 'veiculos_buscados',
    'interessado': 'interessados'
  };
  const field = fieldMap[tipo];
  if (!field) return;
  execute(db, dbPath, `
    INSERT INTO bot_stats (data, ${field}) VALUES (?, 1)
    ON CONFLICT(data) DO UPDATE SET ${field} = ${field} + 1
  `, [today]);
}

export function getBotStats(db, days = 30) {
  return queryAll(db, 'SELECT * FROM bot_stats ORDER BY data DESC LIMIT ?', [days]);
}

export function addCliente(db, dbPath, cliente) {
  execute(db, dbPath, `
    INSERT INTO clientes (nome, telefone, email, fonte, veiculo_interesse, status, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    cliente.nome || '', cliente.telefone, cliente.email || '',
    cliente.fonte || 'whatsapp', cliente.veiculo_interesse || '',
    cliente.status || 'novo', cliente.observacoes || ''
  ]);
  const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0][0];
  return { id: lastId, ...cliente };
}

export function getAllClientes(db) {
  return queryAll(db, 'SELECT * FROM clientes ORDER BY created_at DESC');
}

export function getClientesFiltrados(db, statusList = []) {
  if (statusList.length === 0) return queryAll(db, 'SELECT * FROM clientes ORDER BY created_at DESC');
  
  const placeholders = statusList.map(() => '?').join(',');
  return queryAll(db, `SELECT * FROM clientes WHERE status IN (${placeholders}) ORDER BY created_at DESC`, statusList);
}

export function getClienteByTelefone(db, telefone) {
  return queryOne(db, 'SELECT * FROM clientes WHERE telefone = ?', [telefone]);
}

export function getOuCriarConversa(db, dbPath, telefone, nome = '') {
  let conversa = queryOne(db, 'SELECT * FROM conversas WHERE telefone = ?', [telefone]);
  if (!conversa) {
    execute(db, dbPath, 'INSERT INTO conversas (telefone, nome, ultima_mensagem, status) VALUES (?, ?, ?, ?)', 
      [telefone, nome, '', 'aberta']);
    conversa = queryOne(db, 'SELECT * FROM conversas WHERE telefone = ?', [telefone]);
  }
  return conversa;
}

export function getAllConversas(db) {
  return queryAll(db, 'SELECT * FROM conversas ORDER BY updated_at DESC');
}

export function getMensagensPorConversa(db, conversa_id) {
  return queryAll(db, 'SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY id ASC', [conversa_id]);
}

export function atualizarConversa(db, dbPath, id, ultima_mensagem, status = null, vendedor = null) {
  let sql = 'UPDATE conversas SET ultima_mensagem = ?, updated_at = CURRENT_TIMESTAMP';
  let params = [ultima_mensagem];
  if (status) { sql += ', status = ?'; params.push(status); }
  if (vendedor) { sql += ', vendedor_atendente = ?'; params.push(vendedor); }
  sql += ' WHERE id = ?';
  params.push(id);
  execute(db, dbPath, sql, params);
}

export function adicionarMensagem(db, dbPath, conversa_id, telefone, tipo, mensagem) {
  execute(db, dbPath, 'INSERT INTO mensagens (conversa_id, telefone, tipo, mensagem) VALUES (?, ?, ?, ?)',
    [conversa_id, telefone, tipo, mensagem]);
}

export function getRecentMessages(db, telefone, limit = 10) {
  const sql = `
    SELECT tipo, mensagem FROM (
      SELECT id, tipo, mensagem FROM mensagens 
      WHERE telefone = ? 
      ORDER BY id DESC 
      LIMIT ?
    ) ORDER BY id ASC
  `;
  return queryAll(db, sql, [telefone, limit]);
}

export function getConfig(db) {
  return queryOne(db, 'SELECT * FROM configuracoes WHERE id = 1');
}

export function updateConfig(db, dbPath, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id') {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  values.push(1);
  execute(db, dbPath, `UPDATE configuracoes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
}

export function loginUsuario(db, email, senha) {
  return queryOne(db, 'SELECT id, nome, email, nivel FROM usuarios WHERE email = ? AND senha = ? AND ativo = 1', [email, senha]);
}

export function registrarBusca(db, dbPath, termo, tipo) {
  if (!termo || termo.length < 2) return;
  execute(db, dbPath, 'INSERT INTO termo_buscas (termo, tipo) VALUES (?, ?)', [termo.trim().toLowerCase(), tipo]);
}

export function getStatsBuscas(db, tipo, dias = 30) {
  // Ajustado para 30 dias por padrão para garantir visibilidade
  return queryAll(db, `
    SELECT termo, COUNT(*) as total 
    FROM termo_buscas 
    WHERE tipo = ?
    GROUP BY termo 
    ORDER BY total DESC 
    LIMIT 5
  `, [tipo]);
}