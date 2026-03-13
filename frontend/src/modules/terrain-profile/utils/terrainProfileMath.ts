export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const toRadians = (value: number) => (value * Math.PI) / 180

export const haversineDistanceMeters = (
  startLongitude: number,
  startLatitude: number,
  endLongitude: number,
  endLatitude: number,
) => {
  const earthRadiusMeters = 6371008.8
  const dLat = toRadians(endLatitude - startLatitude)
  const dLon = toRadians(endLongitude - startLongitude)
  const lat1 = toRadians(startLatitude)
  const lat2 = toRadians(endLatitude)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusMeters * c
}

export const mean = (values: number[]) => {
  if (!values.length) return 0
  return values.reduce((sum, current) => sum + current, 0) / values.length
}

export const roundTo = (value: number, decimals = 2) => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
