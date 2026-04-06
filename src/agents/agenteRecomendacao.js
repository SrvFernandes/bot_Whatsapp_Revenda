import { getSimilarVehicles, getAllVehicles, getVehicleById } from '../database/db.js';

export class AgenteRecomendacao {
  constructor() {
    this.categories = {
      'sedan': ['corolla', 'civic', 'jetta', 'cruze', 'fusion', 'accord'],
      'hatch': ['gol', 'onix', 'HB20', 'argo', 'fit', 'polo'],
      'suv': ['creta', 'ecosport', 'hr-v', 'renegade', 'compass', ' Tracker'],
      'utilitario': ['hilux', 'sw4', 'strada', 'montana', 's10', 'ranger'],
      'popular': ['gol', 'onix', 'mob', 'kwid', 'logan']
    };
  }

  getSimilar(query, limit = 3) {
    return getSimilarVehicles(query, limit);
  }

  filterByPrice(minPrice, maxPrice) {
    const vehicles = getAllVehicles();
    return vehicles.filter(v => v.preco >= minPrice && v.preco <= maxPrice);
  }

  filterByBrand(brand) {
    return getAllVehicles().filter(v => v.marca.toLowerCase() === brand.toLowerCase());
  }

  filterByCategory(category) {
    const models = this.categories[category.toLowerCase()] || [];
    const vehicles = getAllVehicles();
    return vehicles.filter(v => 
      models.some(m => v.modelo.toLowerCase().includes(m.toLowerCase()))
    );
  }

  getRecommendations(vehicleId) {
    const vehicle = getVehicleById(vehicleId);
    if (!vehicle) return [];

    const similar = this.getSimilar(vehicle.modelo, 3);
    const sameBrand = this.filterByBrand(vehicle.marca).filter(v => v.id !== vehicleId);
    const samePriceRange = this.filterByPrice(vehicle.preco * 0.8, vehicle.preco * 1.2)
      .filter(v => v.id !== vehicleId);

    const all = [...similar, ...sameBrand, ...samePriceRange];
    const unique = all.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
    
    return unique.slice(0, 3);
  }

  formatRecommendationMessage(vehicles, originalQuery) {
    if (vehicles.length === 0) {
      return null;
    }

    let message = `🔍 *Não encontramos "${originalQuery}"*\n\n`;
    message += `Mas temos opções similares que podem interessar:\n\n`;

    vehicles.forEach((v, index) => {
      message += `${index + 1}. ${v.marca} ${v.modelo} ${v.ano}\n`;
      message += `   💰 R$ ${v.preco.toLocaleString('pt-BR')}\n`;
      message += `   📊 ${v.quilometragem.toLocaleString('pt-BR')} km\n\n`;
    });

    message += `Digite o número para ver detalhes ou "menu" para voltar.`;
    return message;
  }

  formatSoldMessage(vehicle) {
    const recommendations = this.getRecommendations(vehicle.id);
    
    let message = `❌ *Veículo Indisponível*\n\n`;
    message += `O ${vehicle.marca} ${vehicle.modelo} ${vehicle.ano} já foi vendido.\n\n`;

    if (recommendations.length > 0) {
      message += `🎯 *Sugestões para você:*\n\n`;
      
      recommendations.forEach((v, index) => {
        message += `${index + 1}. ${v.marca} ${v.modelo} ${v.ano}\n`;
        message += `   💰 R$ ${v.preco.toLocaleString('pt-BR')}\n\n`;
      });

      message += `Digite o número para ver detalhes.`;
    } else {
      message += `Digite "menu" para ver todos os veículos disponíveis.`;
    }

    return message;
  }

  createPersuasiveMessage(vehicle) {
    const photos = vehicle.fotos ? JSON.parse(vehicle.fotos) : [];
    
    let message = `✨ *Oportunidade Única!*\n\n`;
    message += `🚗 ${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}\n\n`;
    message += `💰 Por apenas R$ ${vehicle.preco.toLocaleString('pt-BR')}\n\n`;
    
    message += `📊 Características:\n`;
    message += `• ${vehicle.quilometragem.toLocaleString('pt-BR')} km\n`;
    message += `• Cor: ${vehicle.cor}\n`;
    
    if (vehicle.descricao) {
      message += `\n📝 ${vehicle.descricao}\n`;
    }

    message += `\n🏁 Não perca esta oportunidade!\n`;
    message += `Digite "agendar" para visitar ou fazer um test drive.`;

    return message;
  }
}