import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'database.db');

let db = null;

export async function initDatabase() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('✓ Banco carregado');
  } else {
    db = new SQL.Database();
    console.log('✓ Banco vazio, criando...');
  }

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

  try {
    db.run('ALTER TABLE veiculos ADD COLUMN placa TEXT');
  } catch (e) {
    // Coluna já existe
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS bot_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefone TEXT NOT NULL,
      tipo TEXT NOT NULL,
      acao TEXT NOT NULL,
      detalhes TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bot_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data DATE DEFAULT CURRENT_DATE,
      mensagens_recebidas INTEGER DEFAULT 0,
      mensagens_enviadas INTEGER DEFAULT 0,
      conversas_iniciadas INTEGER DEFAULT 0,
      veiculos_buscados INTEGER DEFAULT 0,
      interessados INTEGER DEFAULT 0,
      UNIQUE(data)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      telefone TEXT NOT NULL UNIQUE,
      email TEXT,
      fonte TEXT DEFAULT 'whatsapp',
      veiculo_interesse TEXT,
      status TEXT DEFAULT 'novo',
      observacoes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS conversas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefone TEXT NOT NULL,
      nome TEXT,
      ultima_mensagem TEXT,
      status TEXT DEFAULT 'aberta',
      vendedor_atendente TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversa_id INTEGER NOT NULL,
      telefone TEXT NOT NULL,
      tipo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversa_id) REFERENCES conversas(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nome_loja TEXT DEFAULT 'Revenda Auto',
      telefone_loja TEXT,
      mensagem_boas_vindas TEXT,
      groq_api_key TEXT,
      groq_ativado INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE,
      senha TEXT NOT NULL,
      nivel TEXT DEFAULT 'vendedor' CHECK(nivel IN ('admin', 'vendedor')),
      ativo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const config = queryOne('SELECT * FROM configuracoes WHERE id = 1');
  if (!config) {
    execute(`INSERT INTO configuracoes (id, nome_loja) VALUES (1, 'Revenda Auto')`);
  }

  const adminExists = queryOne('SELECT id FROM usuarios WHERE email = ?', ['admin@revenda.com']);
  if (!adminExists) {
    execute(`INSERT INTO usuarios (nome, email, senha, nivel) VALUES (?, ?, ?, ?)`,
      ['Administrador', 'admin@revenda.com', 'admin123', 'admin']);
    console.log('✓ Usuário admin criado: admin@revenda.com / admin123');
  }

  saveDatabase();
  console.log('Banco de dados inicializado:', dbPath);
  
  insertDadosExemplo();
  return db;
}

function insertDadosExemplo() {
  try {
    const jaTem = queryOne('SELECT COUNT(*) as total FROM conversas');
    if (jaTem && jaTem.total > 0) return;
    
    execute(`INSERT INTO conversas (telefone, nome, ultima_mensagem, status, vendedor_atendente) VALUES 
      ('5511988776655', 'João Silva', 'Olá, tenho interesse em um carro', 'aberta', NULL),
      ('5511999998888', 'Maria Santos', 'Vocês têm Uno 2015?', 'atendida', 'Sérgio'),
      ('5511977776666', 'Pedro Costa', 'Qual o menor preço?', 'aberta', NULL)
    `);
    
    const conversas = queryAll('SELECT id FROM conversas');
    if (conversas.length >= 3) {
      execute(`INSERT INTO mensagens (conversa_id, telefone, tipo, mensagem) VALUES 
        (?, '5511988776655', 'recebida', 'Olá, tenho interesse em um carro'),
        (?, '5511988776655', 'enviada', 'Olá João! Como posso ajudar?'),
        (?, '5511999998888', 'recebida', 'Vocês têm Uno 2015?'),
        (?, '5511999998888', 'enviada', 'Temos sim! Qual cor você prefere?'),
        (?, '5511977776666', 'recebida', 'Qual o menor preço?')
      `, [conversas[0].id, conversas[0].id, conversas[1].id, conversas[1].id, conversas[2].id]);
    }
    
    execute(`INSERT INTO clientes (nome, telefone, email, veiculo_interesse, status) VALUES 
      ('João Silva', '5511988776655', 'joao@email.com', 'Toyota Corolla', 'interessado'),
      ('Maria Santos', '5511999998888', 'maria@email.com', 'Fiat Uno', 'interessado')
    `);
    
    console.log('✓ Dados de exemplo inseridos');
  } catch (e) {
    console.log('Dados de exemplo já existem ou erro:', e.message);
  }
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, buffer);
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results[0] || null;
}

function execute(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] };
}

export function getAllVehicles(status = 'disponivel') {
  return queryAll('SELECT * FROM veiculos WHERE status = ?', [status]);
}

export function getVehicleById(id) {
  return queryOne('SELECT * FROM veiculos WHERE id = ?', [id]);
}

export function searchVehicles(query) {
  const q = `%${query}%`;
  return queryAll(`
    SELECT * FROM veiculos 
    WHERE status = 'disponivel' 
    AND (marca LIKE ? OR modelo LIKE ? OR CAST(ano AS TEXT) LIKE ?)
  `, [q, q, q]);
}

export function getSimilarVehicles(query, limit = 3) {
  const q = `%${query}%`;
  return queryAll(`
    SELECT * FROM veiculos 
    WHERE status = 'disponivel' 
    AND (marca LIKE ? OR modelo LIKE ?)
    LIMIT ?
  `, [q, q, limit]);
}

export function filterVehicles({ status, marca, modelo, anoDe, anoAte, precoDe, precoAte, q }) {
  let sql = 'SELECT * FROM veiculos WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (marca) {
    sql += ' AND marca = ?';
    params.push(marca);
  }
  if (modelo) {
    sql += ' AND modelo LIKE ?';
    params.push(`%${modelo}%`);
  }
  if (anoDe) {
    sql += ' AND ano >= ?';
    params.push(parseInt(anoDe));
  }
  if (anoAte) {
    sql += ' AND ano <= ?';
    params.push(parseInt(anoAte));
  }
  if (precoDe) {
    sql += ' AND preco >= ?';
    params.push(parseFloat(precoDe));
  }
  if (precoAte) {
    sql += ' AND preco <= ?';
    params.push(parseFloat(precoAte));
  }
  if (q) {
    sql += ' AND (marca LIKE ? OR modelo LIKE ? OR descricao LIKE ? OR placa LIKE ?)';
    const qq = `%${q}%`;
    params.push(qq, qq, qq, qq);
  }

  sql += ' ORDER BY id DESC';
  return queryAll(sql, params);
}

export function addVehicle(vehicle) {
  execute(`
    INSERT INTO veiculos (marca, modelo, ano, cor, quilometragem, preco, descricao, fotos, placa, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    vehicle.marca,
    vehicle.modelo,
    vehicle.ano,
    vehicle.cor || '',
    vehicle.quilometragem || 0,
    vehicle.preco,
    vehicle.descricao || '',
    JSON.stringify(vehicle.fotos || []),
    vehicle.placa || '',
    vehicle.status || 'disponivel'
  ]);

  const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0][0];
  return { id: lastId, ...vehicle };
}

export function updateVehicle(id, updates) {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id') {
      fields.push(`${key} = ?`);
      values.push(key === 'fotos' ? JSON.stringify(value) : value);
    }
  }

  values.push(id);
  execute(`UPDATE veiculos SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
  return { changes: 1 };
}

export function updateStatus(id, status) {
  execute('UPDATE veiculos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  return { changes: 1 };
}

export function logBotMessage(telefone, tipo, acao, detalhes = '') {
  execute(
    'INSERT INTO bot_logs (telefone, tipo, acao, detalhes) VALUES (?, ?, ?, ?)',
    [telefone, tipo, acao, detalhes]
  );
}

export function getBotLogs(limit = 50) {
  return queryAll('SELECT * FROM bot_logs ORDER BY timestamp DESC LIMIT ?', [limit]);
}

export function updateBotStats(tipo) {
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
  
  execute(`
    INSERT INTO bot_stats (data, ${field}) VALUES (?, 1)
    ON CONFLICT(data) DO UPDATE SET ${field} = ${field} + 1
  `, [today]);
}

export function getBotStats(days = 30) {
  return queryAll('SELECT * FROM bot_stats ORDER BY data DESC LIMIT ?', [days]);
}

export function getBotStatsToday() {
  const today = new Date().toISOString().split('T')[0];
  return queryOne('SELECT * FROM bot_stats WHERE data = ?', [today]);
}

export function addCliente(cliente) {
  execute(`
    INSERT INTO clientes (nome, telefone, email, fonte, veiculo_interesse, status, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    cliente.nome || '',
    cliente.telefone,
    cliente.email || '',
    cliente.fonte || 'whatsapp',
    cliente.veiculo_interesse || '',
    cliente.status || 'novo',
    cliente.observacoes || ''
  ]);
  const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0][0];
  return { id: lastId, ...cliente };
}

export function getAllClientes() {
  return queryAll('SELECT * FROM clientes ORDER BY created_at DESC');
}

export function getClienteById(id) {
  console.log('DB: Buscando cliente ID:', id);
  return queryOne('SELECT * FROM clientes WHERE id = ?', [id]);
}

export function getClienteByTelefone(telefone) {
  return queryOne('SELECT * FROM clientes WHERE telefone = ?', [telefone]);
}

export function updateCliente(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id') {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  values.push(id);
  execute(`UPDATE clientes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
  return { changes: 1 };
}

export function searchClientes(q) {
  const qq = `%${q}%`;
  return queryAll(`
    SELECT * FROM clientes 
    WHERE nome LIKE ? OR telefone LIKE ? OR email LIKE ? OR veiculo_interesse LIKE ?
    ORDER BY created_at DESC
  `, [qq, qq, qq, qq]);
}

export function getClientesInteressados(veiculo) {
  const marca = veiculo.marca || '';
  const modelo = veiculo.modelo || '';
  const marcaLower = marca.toLowerCase();
  const modeloLower = modelo.toLowerCase();
  
  return queryAll(`
    SELECT * FROM clientes 
    WHERE status = 'interessado' 
    AND (
      veiculo_interesse LIKE ? 
      OR veiculo_interesse LIKE ?
      OR veiculo_interesse LIKE ?
    )
  `, [`%${marca}%`, `%${modelo}%`, `%${marcaLower}%`]);
}

export function getDB() {
  return db;
}

export function getOuCriarConversa(telefone, nome = '') {
  let conversa = queryOne('SELECT * FROM conversas WHERE telefone = ?', [telefone]);
  if (!conversa) {
    execute('INSERT INTO conversas (telefone, nome, ultima_mensagem, status) VALUES (?, ?, ?, ?)', 
      [telefone, nome, '', 'aberta']);
    conversa = queryOne('SELECT * FROM conversas WHERE telefone = ?', [telefone]);
  }
  return conversa;
}

export function atualizarConversa(id, ultima_mensagem, status = null, vendedor = null) {
  let sql = 'UPDATE conversas SET ultima_mensagem = ?, updated_at = CURRENT_TIMESTAMP';
  let params = [ultima_mensagem];
  if (status) {
    sql += ', status = ?';
    params.push(status);
  }
  if (vendedor) {
    sql += ', vendedor_atendente = ?';
    params.push(vendedor);
  }
  sql += ' WHERE id = ?';
  params.push(id);
  execute(sql, params);
}

export function getAllConversas() {
  return queryAll('SELECT * FROM conversas ORDER BY updated_at DESC');
}

export function getMensagensConversa(conversa_id) {
  return queryAll('SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY timestamp ASC', [conversa_id]);
}

export function adicionarMensagem(conversa_id, telefone, tipo, mensagem) {
  execute('INSERT INTO mensagens (conversa_id, telefone, tipo, mensagem) VALUES (?, ?, ?, ?)',
    [conversa_id, telefone, tipo, mensagem]);
}

export function atribuirVendedor(conversa_id, vendedor) {
  execute('UPDATE conversas SET vendedor_atendente = ?, status = ? WHERE id = ?',
    [vendedor, 'atendida', conversa_id]);
}

export function getConfig() {
  return queryOne('SELECT * FROM configuracoes WHERE id = 1');
}

export function updateConfig(updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id') {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  values.push(1);
  execute(`UPDATE configuracoes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
}

export function addUsuario(usuario) {
  execute(`INSERT INTO usuarios (nome, email, senha, nivel) VALUES (?, ?, ?, ?)`,
    [usuario.nome, usuario.email, usuario.senha, usuario.nivel || 'vendedor']);
  const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0][0];
  return { id: lastId, ...usuario };
}

export function getAllUsuarios() {
  return queryAll('SELECT id, nome, email, nivel, ativo, created_at FROM usuarios ORDER BY nome');
}

export function getUsuarioById(id) {
  return queryOne('SELECT id, nome, email, nivel, ativo FROM usuarios WHERE id = ?', [id]);
}

export function getUsuarioByEmail(email) {
  return queryOne('SELECT * FROM usuarios WHERE email = ?', [email]);
}

export function updateUsuario(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id') {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  values.push(id);
  execute(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`, values);
}

export function loginUsuario(email, senha) {
  return queryOne('SELECT id, nome, email, nivel FROM usuarios WHERE email = ? AND senha = ? AND ativo = 1', [email, senha]);
}