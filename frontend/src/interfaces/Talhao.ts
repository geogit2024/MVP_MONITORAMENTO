// src/interfaces/Talhao.ts
import { Feature, Polygon } from 'geojson'; // Adicione Polygon aqui

export interface Talhao {
  id?: string; // Opcional para novos talhões antes de serem salvos
  nome: string;
  area: number; // Em hectares
  cultura_principal?: string;
  geometry: Feature<Polygon>; // NOVO: Cada talhão tem sua própria geometria
}