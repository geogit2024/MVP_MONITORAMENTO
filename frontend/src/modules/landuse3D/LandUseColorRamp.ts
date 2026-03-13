import { Color } from 'cesium'

export interface LandUseLegendItem3D {
  classId: number
  className: string
  hexColor: string
  heightM: number
}

const DEFAULT_LANDUSE_3D_STYLES: LandUseLegendItem3D[] = [
  { classId: 3, className: 'Vegetacao', hexColor: '#1f7a3e', heightM: 15 },
  { classId: 1, className: 'Agricultura', hexColor: '#9bd770', heightM: 10 },
  { classId: 6, className: 'Area urbana', hexColor: '#7f8c8d', heightM: 25 },
  { classId: 4, className: 'Solo exposto', hexColor: '#8d5524', heightM: 5 },
  { classId: 5, className: 'Corpo d\'agua', hexColor: '#2e86de', heightM: 2 },
  { classId: 7, className: 'Area degradada', hexColor: '#c0392b', heightM: 8 },
]

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const matchLegendByName = (className: string) => {
  const normalized = normalizeText(className)
  if (!normalized) return null
  if (normalized.includes('urb')) return DEFAULT_LANDUSE_3D_STYLES[2]
  if (normalized.includes('degrad')) return DEFAULT_LANDUSE_3D_STYLES[5]
  if (normalized.includes('agua')) return DEFAULT_LANDUSE_3D_STYLES[4]
  if (normalized.includes('solo')) return DEFAULT_LANDUSE_3D_STYLES[3]
  if (normalized.includes('agric')) return DEFAULT_LANDUSE_3D_STYLES[1]
  if (normalized.includes('pastag')) return DEFAULT_LANDUSE_3D_STYLES[1]
  if (normalized.includes('veget') || normalized.includes('florest')) return DEFAULT_LANDUSE_3D_STYLES[0]
  return null
}

const matchLegendByClassId = (classId: number) => {
  if (classId === 1) return DEFAULT_LANDUSE_3D_STYLES[1]
  if (classId === 2) return DEFAULT_LANDUSE_3D_STYLES[1]
  if (classId === 3) return DEFAULT_LANDUSE_3D_STYLES[0]
  if (classId === 4) return DEFAULT_LANDUSE_3D_STYLES[3]
  if (classId === 5) return DEFAULT_LANDUSE_3D_STYLES[4]
  if (classId === 6) return DEFAULT_LANDUSE_3D_STYLES[2]
  return null
}

const getStyleMatch = (classId: number, className: string) =>
  matchLegendByName(className) || matchLegendByClassId(classId) || null

export function getLandUseColor(classId: number, className: string, alpha = 0.78) {
  const style = getStyleMatch(classId, className)
  const hex = style?.hexColor || '#999999'
  return Color.fromCssColorString(hex).withAlpha(Math.max(0.12, Math.min(alpha, 1)))
}

export function getLandUseHeight(classId: number, className: string) {
  const style = getStyleMatch(classId, className)
  return style?.heightM ?? 8
}

export function getLandUseHexColor(classId: number, className: string) {
  const style = getStyleMatch(classId, className)
  return style?.hexColor ?? '#999999'
}

export function getLandUseLegendTemplate(): LandUseLegendItem3D[] {
  return DEFAULT_LANDUSE_3D_STYLES
}
