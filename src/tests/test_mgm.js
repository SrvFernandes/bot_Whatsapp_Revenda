import { 
  initMasterDatabase, 
  createRevenda, 
  renovarAssinatura, 
  getRevendaBySlug,
  executeMaster
} from '../database/master.js';

async function runTest() {
  await initMasterDatabase();
  console.log('🧪 INICIANDO TESTE DO FLUXO SaaS + MGM\n');

  // 0. Limpar banco para o teste (Opcional, mas seguro)
  // executeMaster('DELETE FROM revendas');

  // 1. Criar o Padrinho (Pai de todos)
  console.log('1. Criando Padrinho: Caio Pai...');
  let padrinho = createRevenda('Caio Pai', 'caio-pai');
  // Simular que ele já tem um ID do Asaas
  executeMaster('UPDATE revendas SET asaas_customer_id = ? WHERE id = ?', ['cus_padrinho_01', padrinho.id]);
  padrinho = getRevendaBySlug('caio-pai');
  console.log(`   ✓ Padrinho criado: ID ${padrinho.id} | Código: ${padrinho.referral_code} | Valor: R$ ${padrinho.valor_mensalidade}\n`);

  // 2. Criar 2 Indicações (Para chegar nos R$ 200,00)
  console.log('2. Criando 2 indicações para o Caio Pai...');
  const filho1 = createRevenda('Filho 1', 'filho-1', padrinho.id);
  const filho2 = createRevenda('Filho 2', 'filho-2', padrinho.id);
  
  // Registrar IDs do Asaas para os filhos
  executeMaster('UPDATE revendas SET asaas_customer_id = ? WHERE id = ?', ['cus_filho_1', filho1.id]);
  executeMaster('UPDATE revendas SET asaas_customer_id = ? WHERE id = ?', ['cus_filho_2', filho2.id]);

  console.log('   ✓ Indicações criadas. Vamos simular os pagamentos agora...\n');

  // 3. Simular Pagamento do Filho 1
  console.log('3. Simulando Pagamento do Filho 1...');
  renovarAssinatura('cus_filho_1', 30);
  
  // 4. Simular Pagamento do Filho 2 (Aqui deve triggar o desconto de R$ 200)
  console.log('4. Simulando Pagamento do Filho 2...');
  renovarAssinatura('cus_filho_2', 30);

  padrinho = getRevendaBySlug('caio-pai');
  console.log(`\n📊 STATUS APÓS 2 INDICAÇÕES:`);
  console.log(`   - Novo Valor Mensalidade: R$ ${padrinho.valor_mensalidade}`);
  console.log(`   - Expected: R$ 200.00\n`);

  // 5. Criar mais 2 indicações (Para chegar nos R$ 150,00)
  console.log('5. Criando mais 2 indicações (Total 4)...');
  const filho3 = createRevenda('Filho 3', 'filho-3', padrinho.id);
  const filho4 = createRevenda('Filho 4', 'filho-4', padrinho.id);
  executeMaster('UPDATE revendas SET asaas_customer_id = ? WHERE id = ?', ['cus_filho_3', filho3.id]);
  executeMaster('UPDATE revendas SET asaas_customer_id = ? WHERE id = ?', ['cus_filho_4', filho4.id]);
  
  renovarAssinatura('cus_filho_3', 30);
  renovarAssinatura('cus_filho_4', 30);

  padrinho = getRevendaBySlug('caio-pai');
  console.log(`\n🏆 STATUS FINAL APÓS 4 INDICAÇÕES:`);
  console.log(`   - Novo Valor Mensalidade: R$ ${padrinho.valor_mensalidade}`);
  console.log(`   - Expected: R$ 150.00\n`);

  if (padrinho.valor_mensalidade === 150) {
    console.log('✅ TESTE DE SUCESSO! O fluxo Progressivo e de Webhook está funcionando.');
  } else {
    console.log('❌ FALHA NO TESTE. Verifique a lógica de cálculo.');
  }
}

runTest();
