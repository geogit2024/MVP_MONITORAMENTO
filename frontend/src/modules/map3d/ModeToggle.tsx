import React from 'react'
import { useMapMode } from './MapModeContext'

interface ModeToggleProps {
  className?: string
}

export default function ModeToggle({ className }: ModeToggleProps) {
  const { mode, toggleMode } = useMapMode()
  const buttonLabel = mode === '2d' ? 'Modo 3D' : 'Modo 2D'

  return (
    <button type="button" className={className} onClick={toggleMode} aria-label={buttonLabel}>
      {buttonLabel}
    </button>
  )
}
