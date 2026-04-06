import { addVehicle, updateVehicle, updateStatus, getVehicleById } from '../database/db.js';

export class AgenteCadastro {
  constructor() {
    this.pendingRegistrations = new Map();
  }

  startRegistration(userId) {
    this.pendingRegistrations.set(userId, { step: 'marca', data: {} });
  }

  processInput(userId, input) {
    const session = this.pendingRegistrations.get(userId);
    if (!session) return null;

    switch (session.step) {
      case 'marca':
        session.data.marca = input.trim();
        session.step = 'modelo';
        return { status: 'continue', message: 'Agora me informe o modelo do veículo:' };

      case 'modelo':
        session.data.modelo = input.trim();
        session.step = 'ano';
        return { status: 'continue', message: 'Qual o ano do veículo?' };

      case 'ano':
        const ano = parseInt(input);
        if (isNaN(ano)) {
          return { status: 'continue', message: 'Ano inválido. Por favor, digite um ano válido (ex: 2020):' };
        }
        session.data.ano = ano;
        session.step = 'cor';
        return { status: 'continue', message: 'Qual a cor do veículo?' };

      case 'cor':
        session.data.cor = input.trim();
        session.step = 'quilometragem';
        return { status: 'continue', message: 'Qual a quilometragem do veículo?' };

      case 'quilometragem':
        const km = parseInt(input.replace(/\D/g, ''));
        if (isNaN(km)) {
          return { status: 'continue', message: 'Quilometragem inválida. Digite apenas números:' };
        }
        session.data.quilometragem = km;
        session.step = 'preco';
        return { status: 'continue', message: 'Qual o preço de venda? (Ex: 80000)' };

      case 'preco':
        const preco = parseFloat(input.replace(/[R$\.,]/g, ''));
        if (isNaN(preco)) {
          return { status: 'continue', message: 'Preço inválida. Digite apenas números:' };
        }
        session.data.preco = preco;
        session.step = 'descricao';
        return { status: 'continue', message: 'Adicione uma descrição (opcional) ou digite "pular":' };

      case 'descricao':
        if (input.toLowerCase() !== 'pular') {
          session.data.descricao = input.trim();
        }
        session.step = 'confirmar';
        
        const v = session.data;
        return {
          status: 'confirm',
          message: `Confirme o cadastro do veículo:

🚗 ${v.marca} ${v.modelo} ${v.ano}
💰 R$ ${v.preco.toLocaleString('pt-BR')}
📊 ${v.quilometragem.toLocaleString('pt-BR')} km
🎨 Cor: ${v.cor}
${v.descricao ? `📝 ${v.descricao}` : ''}

Digite "sim" para confirmar ou "não" para cancelar.`
        };

      case 'confirmar':
        if (input.toLowerCase() === 'sim') {
          const vehicle = addVehicle(session.data);
          this.pendingRegistrations.delete(userId);
          return {
            status: 'success',
            message: `✅ Veículo cadastrado com sucesso!\n\nID: ${vehicle.id}\n${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}`
          };
        } else {
          this.pendingRegistrations.delete(userId);
          return { status: 'cancelled', message: 'Cadastro cancelado.' };
        }
    }
  }

  isInRegistration(userId) {
    return this.pendingRegistrations.has(userId);
  }

  cancelRegistration(userId) {
    this.pendingRegistrations.delete(userId);
  }
}

export class AgenteVenda {
  updateStatus(vehicleId, newStatus) {
    return updateStatus(vehicleId, newStatus);
  }
}