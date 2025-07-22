import React, { createContext, useState, ReactNode } from 'react';
import { FeatureCollection } from 'geojson';

// 1. Define o formato dos dados que nosso contexto irá gerenciar
interface IMapStateContext {
  plotLines: FeatureCollection | null;
  setPlotLines: (data: FeatureCollection | null) => void;
}

// 2. Cria o Contexto com um valor padrão
export const MapStateContext = createContext<IMapStateContext>({
  plotLines: null,
  setPlotLines: () => {},
});

// 3. Cria o "Provedor" do nosso contexto. É ele quem vai guardar o estado.
export const MapStateProvider = ({ children }: { children: ReactNode }) => {
  const [plotLines, setPlotLines] = useState<FeatureCollection | null>(null);

  return (
    <MapStateContext.Provider value={{ plotLines, setPlotLines }}>
      {children}
    </MapStateContext.Provider>
  );
};