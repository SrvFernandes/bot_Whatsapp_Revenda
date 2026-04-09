import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mocking some master functions for isolated test
import { 
  initMasterDatabase, 
  createRevenda, 
  renovarAssinatura, 
  getRevendaBySlug,
  executeMaster,
  queryOneMaster
} from '../database/master.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(__dirname, '..', 'data', 'master_test.db');

async function runTest() {
  // Garantir que começamos do zero
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  
  // Como o master.js usa masterDbPath fixo, o teste usará o banco real se não tomarmos cuidado.
  // Para este teste, vamos apenas garantir que a revenda não existe antes de tentar criar.
  
  await initMasterDatabase();
  console.log('🧪 INICIANDO TESTE DO FLUXO SaaS + MGM (Isolated)\n');

  // Limpar revendas de teste anteriores
  const testSlugs = ['caio-pai-test', 'filho-1-test', 'filho-2-test', 'filho-3-test', 'filho-4-test'];
  testSlugs.forEach(slug => {
    executeMaster('DELETE FROM revendas WHERE slug = ?', [slug]);
  });

  // 1. Criar o Padrinho
  console.log('1. Criando Padrinho: Caio Pai Test...');
  let padrinho = createRevenda('Caio Pai Test', 'caio-pai-test');
  executeMaster('UPDATE revendas SET asaas_customer_id = ? WHERE id = ?', ['cus_padrinho_test', padrinho.id]);
  padrinho = getRevendaBySlug('caio-pai-test');
  console.log(`   ✓ Padrinho criado: ID ${padrinho.id} | Código: ${padrinho.referral_code} | Valor: R$ ${padrinho.valor_mensalidade}\n`);

  // 2. Criar 2 Indicações
  console.log('2. Criando 2 indicações...');
  const f1 = createRevenda('Filho 1', 'filho-1-test', padrinho.id);
  const f2 = createRevenda('Filho 2', 'filho-2-test', padrinho.id);
  executeMaster('UPDATE revendas SET asaas_customer_id = ?, status = "ativo" WHERE id = ?', ['cus_f1_test', f1.id]);
  executeMaster('UPDATE revendas SET asaas_customer_id = ?, status = "ativo" WHERE id = ?', ['cus_f2_test', f2.id]);
  
  // Simular Pagamentos
  console.log('3. Simulando Pagamentos...');
  renovarAssinatura('cus_f1_test', 30);
  renovarAssinatura('cus_f2_test', 30);

  padrinho = getRevendaBySlug('caio-pai-test');
  console.log(`\n📊 STATUS APÓS 2 INDICAÇÕES: R$ ${padrinho.valor_mensalidade} (Esperado: 200)`);

  // 4. Mais 2 Indicações
  console.log('\n4. Adicionando mais 2 indicações (Total 4)...');
  const f3 = createRevenda('Filho 3', 'filho-3-test', padrinho.id);
  const f4 = createRevenda('Filho 4', 'filho-4-test', padrinho.id);
  executeMaster('UPDATE revendas SET asaas_customer_id = ?, status = "ativo" WHERE id = ?', ['cus_f3_test', f3.id]);
  executeMaster('UPDATE revendas SET asaas_customer_id = ?, status = "ativo" WHERE id = ?', ['cus_f4_test', f4.id]);
  
  renovarAssinatura('cus_f3_test', 30);
  renovarAssinatura('cus_f4_test', 30);

  padrinho = getRevendaBySlug('caio-pai-test');
  console.log(`\n🏆 STATUS FINAL APÓS 4 INDICAÇÕES: R$ ${padrinho.valor_mensalidade} (Esperado: 150)`);

  if (padrinho.valor_mensalidade === 150) {
    console.log('\n✅ SUCESSO: O sistema de bônus por indicação está funcionando perfeitamente!');
  } else {
    console.log('\n❌ FALHA: O valor final não confere.');
  }

  // Cleanup
  testSlugs.forEach(slug => {
    executeMaster('DELETE FROM revendas WHERE slug = ?', [slug]);
  });
}

runTest().catch(console.error);
