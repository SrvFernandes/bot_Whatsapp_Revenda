import { getVehicleById, getAllVehicles, searchVehicles } from '../database/db.js';

export class AgenteConsulta {
  parseQuery(text) {
    const normalized = text.toLowerCase().trim();
    
    const patterns = [
      /(\w+)\s+(\d{4})/,
      /(\w+)\s+(\w+)/,
      /(\d{4})/,
      /(corolla|civic|gol|onix| HB20|creta|ecosport| Hilux|sw4|argo|strada|montana)/i
    ];

    const brands = ['toyota', 'honda', 'volkswagen', 'chevrolet', 'hyundai', 'ford', 'fiat', 'jeep'];
    const brandMap = {
      'toyota': 'Toyota', 'honda': 'Honda', 'volkswagen': 'Volkswagen',
      'chevrolet': 'Chevrolet', 'hyundai': 'Hyundai', 'ford': 'Ford',
      'fiat': 'Fiat', 'jeep': 'Jeep'
    };

    const yearMatch = normalized.match(/\b(20\d{2}|19\d{2})\b/);
    
    let marca = null;
    let modelo = null;
    let ano = yearMatch ? parseInt(yearMatch[1]) : null;

    for (const brand of brands) {
      if (normalized.includes(brand)) {
        marca = brandMap[brand];
        break;
      }
    }

    const modelKeywords = ['corolla', 'civic', 'gol', 'onix', 'hb20', 'creta', 'ecosport', 'hilux', 'sw4', 'argo', 'strada', 'montana'];
    for (const model of modelKeywords) {
      if (normalized.includes(model)) {
        modelo = model.charAt(0).toUpperCase() + model.slice(1);
        break;
      }
    }

    return { marca, modelo, ano, raw: normalized };
  }

  search(query) {
    const parsed = this.parseQuery(query);
    const results = searchVehicles(parsed.raw);
    
    return {
      parsed,
      results,
      found: results.length > 0
    };
  }

  getVehicleDetails(vehicleId) {
    return getVehicleById(vehicleId);
  }

  formatVehicleMessage(vehicle) {
    const fotos = vehicle.fotos ? JSON.parse(vehicle.fotos) : [];
    
    return `
🚗 *${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}*

💰 Preço: R$ ${vehicle.preco.toLocaleString('pt-BR')}
📊 Quilometragem: ${vehicle.quilometragem.toLocaleString('pt-BR')} km
🎨 Cor: ${vehicle.cor}
📍 Status: ${vehicle.status === 'disponivel' ? '✅ Disponível' : '❌ Vendido'}

${vehicle.descricao || 'Veículo em excelente estado de conservação.'}

---

Para agendar uma visita ou teste drive, digite "agendar".
Para voltar ao menu, digite "menu".
    `.trim();
  }

  formatListMessage(vehicles) {
    if (vehicles.length === 0) {
      return 'Nenhum veículo disponível no momento.';
    }

    let message = '🚗 *Veículos Disponíveis:*\n\n';
    
    vehicles.forEach((v, index) => {
      message += `${index + 1}. ${v.marca} ${v.modelo} ${v.ano}\n`;
      message += `   💰 R$ ${v.preco.toLocaleString('pt-BR')}\n`;
      message += `   📊 ${v.quilometragem.toLocaleString('pt-BR')} km\n\n`;
    });

    message += '\nDigite o número do veículo para mais detalhes.';
    return message;
  }
}