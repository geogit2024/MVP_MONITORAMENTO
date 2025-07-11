// src/mockProperties.ts

import { Feature, Polygon } from 'geojson';

// Define a estrutura de uma propriedade, agora alinhada com o formulário
export interface Property {
  id: string; // Mantido para uso interno do React
  propriedade_nome: string;
  proprietario_nome: string;
  municipio: string;
  estado: string;
  geometry: Feature<Polygon>; // Mantido para a funcionalidade do mapa
  
  // Campos adicionados para corresponder ao formulário
  incra_codigo: string;
  area_total: number;
  cpf_cnpj: string;
  email: string;
  matricula: string;
  ccir: string;
}

// Cria uma lista de propriedades de exemplo para usar na aplicação
export const mockProperties: Property[] = [
  {
    id: '1',
    propriedade_nome: 'Fazenda Boa Esperança',
    proprietario_nome: 'José da Silva',
    municipio: 'Petrópolis',
    estado: 'RJ',
    // --- Campos Adicionais ---
    incra_codigo: '123.456.789-0',
    area_total: 150.75,
    cpf_cnpj: '111.222.333-44',
    email: 'jose.silva@email.com',
    matricula: '98765',
    ccir: '987654321-0',
    // --- Geometria ---
    geometry: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-43.20, -22.50],
            [-43.18, -22.50],
            [-43.18, -22.48],
            [-43.20, -22.48],
            [-43.20, -22.50]
          ]
        ]
      }
    }
  },
  {
    id: '2',
    propriedade_nome: 'Sítio Recanto Verde',
    proprietario_nome: 'Maria Oliveira',
    municipio: 'Teresópolis',
    estado: 'RJ',
    // --- Campos Adicionais ---
    incra_codigo: '098.765.432-1',
    area_total: 75.50,
    cpf_cnpj: '555.666.777-88',
    email: 'maria.oliveira@email.com',
    matricula: '54321',
    ccir: '123456789-1',
    // --- Geometria ---
    geometry: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-43.00, -22.45],
            [-42.98, -22.45],
            [-42.98, -22.43],
            [-43.00, -22.43],
            [-43.00, -22.45]
          ]
        ]
      }
    }
  },
  {
    id: '3',
    propriedade_nome: 'Haras Vista Linda',
    proprietario_nome: 'Carlos Pereira (ME)',
    municipio: 'Itaipava',
    estado: 'RJ',
    // --- Campos Adicionais ---
    incra_codigo: '112.233.445-5',
    area_total: 210.00,
    cpf_cnpj: '12.345.678/0001-99',
    email: 'contato@harasvistalinda.com.br',
    matricula: '13579',
    ccir: '543210987-2',
    // --- Geometria ---
    geometry: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-43.15, -22.42],
            [-43.13, -22.42],
            [-43.13, -22.40],
            [-43.15, -22.40],
            [-43.15, -22.42]
          ]
        ]
      }
    }
  }
];