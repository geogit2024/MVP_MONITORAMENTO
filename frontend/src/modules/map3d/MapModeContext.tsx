import React, { createContext, useContext, useMemo, useState } from 'react'

export type MapViewMode = '2d' | '3d'

interface MapModeContextValue {
  mode: MapViewMode
  setMode: (mode: MapViewMode) => void
  toggleMode: () => void
}

const MapModeContext = createContext<MapModeContextValue | undefined>(undefined)

interface MapModeProviderProps {
  children: React.ReactNode
}

export function MapModeProvider({ children }: MapModeProviderProps) {
  const [mode, setMode] = useState<MapViewMode>('2d')

  const value = useMemo<MapModeContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode: () => setMode((current) => (current === '2d' ? '3d' : '2d')),
    }),
    [mode],
  )

  return <MapModeContext.Provider value={value}>{children}</MapModeContext.Provider>
}

export function useMapMode() {
  const context = useContext(MapModeContext)
  if (!context) {
    throw new Error('useMapMode deve ser usado dentro de MapModeProvider')
  }
  return context
}
