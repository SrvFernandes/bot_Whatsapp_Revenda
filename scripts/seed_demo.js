import { initTenantDatabase, execute } from '../src/database/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tenantDbsPath = path.join(__dirname, '..', 'src', 'data', 'tenants');

async function seed(slug) {
  console.log(`🚀 Iniciando carga de dados para o tenant: ${slug}`);
  
  const { db, dbPath } = await initTenantDatabase(slug);

  // 1. Limpar dados anteriores
  console.log(`🧹 Limpando dados antigos de ${slug}...`);
  db.run('DELETE FROM veiculos');
  db.run('DELETE FROM clientes');
  db.run('DELETE FROM bot_stats');
  db.run('DELETE FROM bot_logs');
  db.run('DELETE FROM conversas');
  db.run('DELETE FROM mensagens');

  // 2. Inserir 20 Veículos (15 disponiveis, 5 vendidos)
  console.log(`🚗 Inserindo 20 veículos premium em ${slug}...`);
  const veiculos = [
    ['Porsche', '911 Carrera S', 2023, 'Cinza Sólido', 0, 1150000.00, 'Estado de zero, único dono.', 'disponivel'],
    ['Toyota', 'Corolla Cross XRE', 2024, 'Branco Perolizado', 0, 185000.00, 'Lançamento 2024, híbrido flex.', 'disponivel'],
    ['Honda', 'Civic Type R', 2023, 'Vermelho Rally', 500, 430000.00, 'O esportivo mais desejado do momento.', 'disponivel'],
    ['BMW', 'X5 xDrive45e', 2022, 'Preto Carbono', 12000, 580000.00, 'Híbrida plug-in, blindagem nível III-A.', 'disponivel'],
    ['Ford', 'Mustang Mach-E', 2024, 'Azul Grabber', 0, 450000.00, 'SUV 100% elétrico, performance absurda.', 'disponivel'],
    ['Jeep', 'Compass Longitude', 2022, 'Prata Billet', 25000, 168000.00, 'Revisado na concessionária, teto solar.', 'vendido'],
    ['VW', 'Nivus Highline', 2023, 'Cinzento Moonstone', 8000, 145000.00, 'Painel digital, ACC, impecável.', 'disponivel'],
    ['Hyundai', 'HB20 Platinum Plus', 2024, 'Azul Sapphire', 0, 122000.00, 'Topo de linha, pronta entrega.', 'disponivel'],
    ['Fiat', 'Fastback Limited', 2023, 'Branco Banchisa', 15000, 158000.00, 'Motor Turbo 270 by Abarth.', 'vendido'],
    ['Chevrolet', 'Onix Premier', 2024, 'Vermelho Carmine', 0, 115000.00, 'Lançamento, Wi-Fi integrado.', 'disponivel'],
    ['Land Rover', 'Defender 110', 2023, 'Verde Pangea', 5000, 750000.00, 'Expedição ready, acessórios originais.', 'disponivel'],
    ['Mitsubishi', 'L200 Triton HPE-S', 2022, 'Branco Diamond', 35000, 245000.00, 'Tração 4x4, diesel, bruta.', 'vendido'],
    ['Toyota', 'Hilux SRX Limited', 2024, 'Prata Metálico', 0, 335000.00, 'Top de linha diesel, zero km.', 'disponivel'],
    ['Audi', 'Q5 TFSIe Black', 2023, 'Azul Navarra', 1000, 445000.00, 'Híbrida quattro, tecnologia alemã.', 'disponivel'],
    ['Mercedes-Benz', 'C200 AMG Line', 2022, 'Prata Iridium', 18000, 315000.00, 'Luxo e esportividade reunidos.', 'vendido'],
    ['Volvo', 'XC60 Recharge', 2023, 'Branco Crystal', 9000, 415000.00, 'Segurança e sustentabilidade.', 'disponivel'],
    ['BYD', 'Seal Performance', 2024, 'Preto Cosmos', 0, 298000.00, 'Aceleração de supercarro, elétrico.', 'disponivel'],
    ['GWM', 'Ora 03 GT', 2024, 'Vermelho Solar', 0, 185000.00, 'Futuro elétrico compacto e potente.', 'vendido'],
    ['Renault', 'Kardian Premiere', 2024, 'Laranja Energy', 0, 132000.00, 'Novo SUV Renault, motor turbo.', 'disponivel'],
    ['Nissan', 'Sentra Advance', 2023, 'Cinza Grafite', 12000, 155000.00, 'Conforto e elegância japonesa.', 'disponivel']
  ];

  for (const v of veiculos) {
    execute(db, dbPath, `INSERT INTO veiculos (marca, modelo, ano, cor, quilometragem, preco, descricao, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, v);
  }

  // 3. Inserir 10 Clientes
  const clientes = [
    ['João da Silva', '5511999990001', 'joao.silva@email.com', 'Porsche 911', 'novo', 'Viu o anúncio no Instagram.'],
    ['Maria Aparecida', '5511999990002', 'maria.apa@email.com', 'Corolla Cross', 'interessado', 'Quer financiar com 50% de entrada.'],
    ['Carlos Alberto', '5511999990003', 'carlos.beto@email.com', 'Hyundai HB20', 'contatado', 'Aguardando avaliação da troca.'],
    ['Ricardo Santos', '5511999990004', 'ricardo.santos@email.com', 'Porsche 911', 'vendido', 'Comprou à vista, feliz com o atendimento.'],
    ['Fernanda Lima', '5511999990005', 'fer.lima@email.com', 'Jeep Compass', 'novo', 'Interessada em SUV blindado.'],
    ['Lucas Mendes', '5511999990006', 'lucas.mendes@email.com', 'BMW X5', 'interessado', 'Agendou test drive para amanhã.'],
    ['Ana Paula', '5511999990007', 'ana.paula@email.com', 'VW Nivus', 'interessado', 'Buscando cor Cinza Moonstone.'],
    ['Pedro Rocha', '5511999990008', 'pedro.rocha@email.com', 'Fiat Fastback', 'contatado', 'Simulando seguro hoje.'],
    ['Juliana Costa', '5511999990009', 'juju.costa@email.com', 'BYD Seal', 'novo', 'Dúvidas sobre autonomia elétrica.'],
    ['Marcos Oliveira', '5511999990010', 'marcos.oli@email.com', 'Onix Premier', 'vendido', 'Entregue com laudo cautelar aprovado.']
  ];

  for (const c of clientes) {
    execute(db, dbPath, `INSERT INTO clientes (nome, telefone, email, veiculo_interesse, status, observacoes) VALUES (?, ?, ?, ?, ?, ?)`, c);
  }

  // 4. Termos de Busca (Insights)
  console.log(`📈 Gerando histórico de buscas para Insights em ${slug}...`);
  const buscas = [
    ['Porsche', 'marca'], ['Porsche', 'marca'], ['Porsche', 'marca'],
    ['Toyota', 'marca'], ['Toyota', 'marca'],
    ['BMW', 'marca'], ['BMW', 'marca'],
    ['Hilux', 'modelo'], ['Hilux', 'modelo'], ['Hilux', 'modelo'],
    ['Civic', 'modelo'], ['Civic', 'modelo'],
    ['Mustang', 'modelo'],
    ['911 Carrera S', 'modelo'], ['911 Carrera S', 'modelo'],
    ['Audi', 'marca'], ['BYD', 'marca']
  ];
  for (const b of buscas) {
    execute(db, dbPath, `INSERT INTO termo_buscas (termo, tipo, timestamp) VALUES (?, ?, datetime('now', '-${Math.floor(Math.random()*10)} days'))`, b);
  }

  // 5. Histórico WhatsApp (Conversas e Mensagens)
  console.log(`💬 Criando histórico de conversas realista em ${slug}...`);
  const chatData = [
    ['5511999990001', 'João da Silva', 'atendida', 'Sérgio'],
    ['5511999990002', 'Maria Aparecida', 'aberta', null],
    ['5511999990003', 'Carlos Alberto', 'atendida', 'Sérgio']
  ];

  for (const chat of chatData) {
    const res = execute(db, dbPath, `INSERT INTO conversas (telefone, nome, status, vendedor_atendente, ultima_mensagem) VALUES (?, ?, ?, ?, ?)`, 
      [chat[0], chat[1], chat[2], chat[3], 'Obrigado pelas informações!']);
    const conversaId = res.lastInsertRowid;
    
    const msgs = [
      ['recebida', 'Olá, gostaria de saber mais sobre o Porsche 911.'],
      ['enviada', 'Olá João! Com certeza. O 911 Carrera S 2023 está disponível por R$ 1.150.000,00. Deseja agendar uma visita?'],
      ['recebida', 'Sim, por favor! Pode ser amanhã às 14h?'],
      ['enviada', 'Agendado! Te aguardamos na nossa loja.'],
      ['recebida', 'Perfeito, até amanhã.']
    ];
    
    for (const m of msgs) {
      execute(db, dbPath, `INSERT INTO mensagens (conversa_id, telefone, tipo, mensagem, timestamp) VALUES (?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random()*5)} hours'))`, 
        [conversaId, chat[0], m[0], m[1]]);
    }
  }

  // 6. Estatísticas 30 dias
  console.log(`📊 Gerando 30 dias de estatísticas em ${slug}...`);
  for (let i = 30; i >= 0; i--) {
    const data = new Date();
    data.setDate(data.getDate() - i);
    const dataStr = data.toISOString().split('T')[0];
    execute(db, dbPath, `INSERT OR REPLACE INTO bot_stats (data, mensagens_recebidas, mensagens_enviadas, interessados, veiculos_buscados) VALUES (?, ?, ?, ?, ?)`, 
      [dataStr, Math.floor(Math.random() * 40) + 10, Math.floor(Math.random() * 80) + 30, Math.floor(Math.random() * 5), Math.floor(Math.random() * 20)]);
  }

  console.log(`✨ Demo completa e blindada para: ${slug}`);
}

async function run() {
  const arg = process.argv[2];
  if (arg === 'all' || !arg) {
    const files = fs.readdirSync(tenantDbsPath).filter(f => f.endsWith('.db'));
    for (const file of files) {
      await seed(file.replace('.db', ''));
    }
  } else {
    await seed(arg);
  }
}

run().catch(console.error);
