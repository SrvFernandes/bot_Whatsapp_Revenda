import { AgenteConsulta } from '../agents/agenteConsulta.js';
import { AgenteCadastro } from '../agents/agenteCadastro.js';
import * as db from '../database/db.js';

class BotEngine {
  constructor() {
    this.sessions = new Map(); // slug -> Map(userId -> { state, data })
    this.consulta = new AgenteConsulta();
    this.cadastro = new AgenteCadastro();
  }

  async processMessage(slug, tenantDb, dbPath, userId, text) {
    console.log(`[BotEngine] Processando para ${slug} | User: ${userId} | Msg: ${text}`);

    // 1. Verificar se está em fluxo de cadastro
    if (this.cadastro.isInRegistration(userId)) {
      const result = this.cadastro.processInput(userId, text, tenantDb, dbPath);
      if (result) {
        // Se o cadastro foi concluído/cancelado, o AgenteCadastro já limpou a sessão interna
        return result.message;
      }
    }

    const normalized = text.toLowerCase().trim();

    // 2. Comandos de Menu
    if (normalized === 'menu' || normalized === 'oi' || normalized === 'olá' || normalized === 'ola') {
      const config = db.getConfig(tenantDb);
      return `${config.mensagem_boas_vindas || 'Olá! Como podemos ajudar?'}\n\n1. Ver veículos disponíveis\n2. Buscar veículo específico\n3. Quero vender/cadastrar um veículo\n4. Falar com atendente`;
    }

    // 3. Fluxo de Cadastro (Venda)
    if (normalized === '3' || normalized.includes('vender') || normalized.includes('cadastrar')) {
      this.cadastro.startRegistration(userId);
      return 'Ótimo! Vamos iniciar o cadastro do seu veículo. Qual a marca?';
    }

    // 4. Consulta de Estoque
    if (normalized === '1' || normalized.includes('estoque') || normalized.includes('disponíveis')) {
      const vehicles = db.filterVehicles(tenantDb, { status: 'disponivel' });
      return this.consulta.formatListMessage(vehicles);
    }

    // 5. Busca Específica
    if (normalized === '2' || normalized.includes('buscar') || normalized.length > 3) {
      const searchResult = this.consulta.search(text, tenantDb);
      if (searchResult.found) {
        if (searchResult.results.length === 1) {
          return this.consulta.formatVehicleMessage(searchResult.results[0]);
        }
        return this.consulta.formatListMessage(searchResult.results);
      }
    }

    // 6. Falar com Atendente
    if (normalized === '4' || normalized.includes('atendente') || normalized.includes('falar')) {
      return 'Entendido. Em instantes um de nossos consultores entrará em contato com você por aqui mesmo! 👨‍💼';
    }

    return 'Desculpe, não entendi sua solicitação. Digite "menu" para ver as opções.';
  }
}

export default new BotEngine();
