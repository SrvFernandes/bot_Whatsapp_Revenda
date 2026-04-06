import { initDatabase, addVehicle } from './src/database/db.js';

const sampleVehicles = [
  { marca: 'Volkswagen', modelo: 'Gol', ano: 2015, cor: 'Branco', quilometragem: 80000, preco: 35000, descricao: 'Gol 1.0 flex, completo, ipva pago', status: 'disponivel' },
  { marca: 'Chevrolet', modelo: 'Onix', ano: 2020, cor: 'Preto', quilometragem: 45000, preco: 58000, descricao: 'Onix Premier 1.0 turbo, completo', status: 'disponivel' },
  { marca: 'Ford', modelo: 'Ka', ano: 2019, cor: 'Prata', quilometragem: 52000, preco: 52000, descricao: 'Ka SE 1.5 automático', status: 'disponivel' },
  { marca: 'Toyota', modelo: 'Corolla', ano: 2022, cor: 'Branco', quilometragem: 25000, preco: 115000, descricao: 'Corolla XEi 2.0 híbrido', status: 'disponivel' },
  { marca: 'Honda', modelo: 'Civic', ano: 2021, cor: 'Cinza', quilometragem: 38000, preco: 105000, descricao: 'Civic EX 2.0 flex', status: 'disponivel' },
  { marca: 'Jeep', modelo: 'Renegade', ano: 2018, cor: 'Vermelho', quilometragem: 65000, preco: 75000, descricao: 'Renegade Longitude 1.8', status: 'disponivel' },
  { marca: 'Nissan', modelo: 'Kicks', ano: 2020, cor: 'Azul', quilometragem: 42000, preco: 88000, descricao: 'Kicks SV 1.6 flex', status: 'disponivel' },
  { marca: 'Hyundai', modelo: 'Creta', ano: 2021, cor: 'Preto', quilometragem: 35000, preco: 105000, descricao: 'Creta Prestige 2.0', status: 'disponivel' },
  { marca: 'Volkswagen', modelo: 'Polo', ano: 2022, cor: 'Branco', quilometragem: 18000, preco: 82000, descricao: 'Polo MSI 1.6', status: 'disponivel' },
  { marca: 'Fiat', modelo: 'Toro', ano: 2023, cor: 'Cinza', quilometragem: 10000, preco: 135000, descricao: 'Toro Ultra 2.0 turbo diesel', status: 'disponivel' }
];

await initDatabase();

for (const v of sampleVehicles) {
  const result = addVehicle(v);
  console.log(`✓ Cadastrado: ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}`);
}

console.log(`\n${sampleVehicles.length} veículos cadastrados!`);
process.exit(0);
