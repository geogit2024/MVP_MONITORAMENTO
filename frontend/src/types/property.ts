import type { Feature, Geometry, Polygon } from 'geojson';

export interface Property {
  id: string | number;
  propriedade_nome: string;
  proprietario_nome?: string;
  municipio?: string;
  estado?: string;
  incra_codigo?: string;
  area_total?: number;
  cpf_cnpj?: string;
  email?: string;
  matricula?: string;
  ccir?: string;
  geometry?: Feature<Polygon> | Geometry;
  doc_identidade_path?: string;
  doc_terra_path?: string;
}
