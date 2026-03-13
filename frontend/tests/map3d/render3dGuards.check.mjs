import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

const readSource = (relativePath) => {
  const absolute = path.join(projectRoot, relativePath)
  return fs.readFileSync(absolute, 'utf8')
}

const checks = [
  {
    name: 'NDVI 3D outlines disabled on entities',
    run: () => {
      const source = readSource('src/modules/map3d/layers/NDVIExtrusionLayer.ts')
      assert.match(source, /outline:\s*new ConstantProperty\(false\)/)
      assert.doesNotMatch(source, /outline:\s*new ConstantProperty\(true\)/)
    },
  },
  {
    name: 'NDVI 3D palette matches 2D thematic colors',
    run: () => {
      const source = readSource('src/modules/map3d/layers/NDVIExtrusionLayer.ts')
      assert.match(source, /#4287f5/)
      assert.match(source, /#d4a276/)
      assert.match(source, /#a6d96a/)
      assert.match(source, /#1a9641/)
      assert.match(source, /if \(ndvi < 0\) return 'Agua'/)
      assert.match(source, /if \(ndvi < 0\.25\) return 'Solo Exposto'/)
      assert.match(source, /if \(ndvi < 0\.5\) return 'Vegetacao Rala'/)
      assert.match(source, /return 'Vegetacao Densa'/)
      assert.match(source, /class_id\?: number/)
      assert.match(source, /NDVI_CLASS_ID_TO_LABEL/)
      assert.match(source, /NDVI_CLASS_ID_TO_REPR/)
    },
  },
  {
    name: 'AOI 3D avoids polygon heightReference and uses clamped boundary polyline',
    run: () => {
      const source = readSource('src/modules/map3d/Globe3D.tsx')
      assert.doesNotMatch(source, /polygon\.heightReference/)
      assert.match(source, /polyline:\s*\{[\s\S]*clampToGround:\s*true/)
    },
  },
  {
    name: 'DynamicTileLayer uses retry and fallback',
    run: () => {
      const source = readSource('src/components/MapView.tsx')
      assert.match(source, /maxTileErrorsBeforeDisable\s*=\s*14/)
      assert.match(source, /newLayer\.redraw\(\)/)
      assert.match(source, /Camada desativada por falha persistente de tiles/)
    },
  },
  {
    name: 'Swipe raster layer handles retry and fatal fallback',
    run: () => {
      const source = readSource('src/modules/swipe/SwipeRasterLayer.tsx')
      assert.match(source, /maxTileErrorsBeforeDisable\s*=\s*12/)
      assert.match(source, /tileLayer\.redraw\(\)/)
      assert.match(source, /layer:tile:fatal/)
    },
  },
  {
    name: 'Swipe console debug is opt-in',
    run: () => {
      const source = readSource('src/modules/swipe/swipeDebug.ts')
      assert.match(source, /__SWIPE_DEBUG_CONSOLE__/)
      assert.match(source, /window\.__SWIPE_DEBUG_CONSOLE__ !== true/)
    },
  },
]

let failed = false
for (const check of checks) {
  try {
    check.run()
    console.log(`[PASS] ${check.name}`)
  } catch (error) {
    failed = true
    console.error(`[FAIL] ${check.name}`)
    console.error(error instanceof Error ? error.message : error)
  }
}

if (failed) {
  process.exitCode = 1
} else {
  console.log(`[OK] ${checks.length} verificacoes de guarda passaram.`)
}
