import fetch from 'node-fetch';

async function testSimulador() {
  const slug = 'caio-veiculos';
  const url = `http://localhost:3000/api/${slug}/bot/simulate`;

  console.log('--- Testando Simulador do Bot ---');

  // Teste 1: Saudação
  const r1 = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'oi', userId: 'test-user-1' })
  });
  const d1 = await r1.json();
  console.log('Usuário: oi');
  console.log('Bot:', d1.response);

  // Teste 2: Consulta
  const r2 = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Quero um Corolla', userId: 'test-user-1' })
  });
  const d2 = await r2.json();
  console.log('Usuário: Quero um Corolla');
  console.log('Bot:', d2.response);

  // Teste 3: Iniciar Cadastro
  const r3 = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Quero vender meu carro', userId: 'test-user-1' })
  });
  const d3 = await r3.json();
  console.log('Usuário: Quero vender meu carro');
  console.log('Bot:', d3.response);
}

testSimulador().catch(console.error);
