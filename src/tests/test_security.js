import { 
  initMasterDatabase, 
  toggleRevendaStatus,
  getRevendaBySlug
} from '../database/master.js';
import axios from 'axios';

async function testLockdown() {
  await initMasterDatabase();
  const slug = 'filho-1';
  const revenda = getRevendaBySlug(slug);
  
  if (!revenda) {
    console.log('❌ Erro: Revenda "filho-1" não encontrada para o teste.');
    return;
  }

  console.log(`\n🛡️ TESTE DE SEGURANÇA: BLOQUEIO DA LOJA [${slug}]`);
  
  // 1. Bloquear a loja
  console.log(`1. Bloqueando loja ID ${revenda.id}...`);
  toggleRevendaStatus(revenda.id, 'bloqueado');

  // 2. Simular acesso via middleware (Manual check)
  console.log('2. Verificando acesso via sistema de assinatura...');
  
  // Re-importar checkAssinatura para testar a lógica do middleware
  const { checkAssinatura } = await import('../database/master.js');
  const check = checkAssinatura(slug);
  
  if (!check.valid && check.reason === 'bloqueado') {
    console.log('✅ SUCESSO: O sistema detectou o bloqueio e impediu o acesso.');
  } else {
    console.log('❌ FALHA: O acesso ainda está liberado ou erro inesperado.');
    console.log('Check result:', check);
  }

  // 3. Restaurar para não quebrar outros testes
  console.log('\n3. Restaurando status para "ativo"...');
  toggleRevendaStatus(revenda.id, 'ativo');
  console.log('✓ Loja liberada novamente.\n');
}

testLockdown().catch(console.error);
