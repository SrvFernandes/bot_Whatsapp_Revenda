import fs from 'fs';
import initSqlJs from 'sql.js';

async function check() {
  const dbPath = 'src/data/tenants/caio-veiculos.db';
  if (!fs.existsSync(dbPath)) {
    console.error('Banco não encontrado:', dbPath);
    return;
  }
  const buffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(buffer);
  
  console.log('--- Colunas de configuracoes ---');
  const res = db.exec("PRAGMA table_info(configuracoes)");
  console.log(JSON.stringify(res, null, 2));

  console.log('--- Dados de configuracoes ---');
  const data = db.exec("SELECT * FROM configuracoes");
  console.log(JSON.stringify(data, null, 2));
}

check().catch(console.error);
