import { initDatabase, addVehicle } from './src/database/db.js';

const sampleVehicles = [
  { marca: 'Fiat', modelo: 'Uno', ano: 2017, cor: 'Vermelho', quilometragem: 72000, preco: 32000, descricao: 'Uno Vivace 1.0, flex', status: 'disponivel' },
  { marca: 'Renault', modelo: 'Kwid', ano: 2021, cor: 'Azul', quilometragem: 30000, preco: 52000, descricao: 'Kwid Zen 1.0', status: 'disponivel' },
  { marca: 'Volkswagen', modelo: 'Saveiro', ano: 2020, cor: 'Branco', quilometragem: 55000, preco: 68000, descricao: 'Saveiro Robust 1.6', status: 'disponivel' },
  { marca: 'Chevrolet', modelo: 'Spin', ano: 2019, cor: 'Prata', quilometragem: 48000, preco: 62000, descricao: 'Spin LT 1.8', status: 'disponivel' },
  { marca: 'Peugeot', modelo: '208', ano: 2022, cor: 'Cinza', quilometragem: 22000, preco: 78000, descricao: '208 Like 1.5', status: 'disponivel' },
  { marca: 'Citroën', modelo: 'C3', ano: 2021, cor: 'Branco', quilometragem: 28000, preco: 65000, descricao: 'C3 Live 1.2', status: 'disponivel' },
  { marca: 'Toyota', modelo: 'Etios', ano: 2018, cor: 'Preto', quilometragem: 65000, preco: 48000, descricao: 'Etios X 1.5', status: 'disponivel' },
  { marca: 'Honda', modelo: 'HR-V', ano: 2020, cor: 'Cinza', quilometragem: 42000, preco: 98000, descricao: 'HR-V EX 1.8', status: 'disponivel' },
  { marca: 'Jeep', modelo: 'Compass', ano: 2021, cor: 'Preto', quilometragem: 38000, preco: 135000, descricao: 'Compass Limited 2.0 diesel', status: 'disponivel' },
  { marca: 'Mitsubishi', modelo: 'Outlander', ano: 2019, cor: 'Prata', quilometragem: 55000, preco: 115000, descricao: 'Outlander PHEV híbrido', status: 'disponivel' }
];

await initDatabase();

for (const v of sampleVehicles) {
  const result = addVehicle(v);
  console.log(`✓ ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}`);
}

console.log(`\n${sampleVehicles.length} veículos adicionais cadastrados!`);
process.exit(0);
