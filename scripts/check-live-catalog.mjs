/** Fetch the published catalog and reject it when it is too large or invalid. */
import { parseMarketplaceCatalogText } from '../lib/catalog.mjs'

const url = process.env.DSH_PLUGIN_MARKETPLACE_CATALOG_URL
  ?? 'https://w2112515.github.io/dsh-plugin-marketplace/plugin-marketplace/catalog-v1.json'
const maxBytes = 15_000_000

const response = await fetch(url, {
  headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-marketplace-check-live-catalog' },
  signal: AbortSignal.timeout(60_000),
})
if (!response.ok) {
  throw new Error(`Live catalog returned HTTP ${String(response.status)}`)
}
const buffer = Buffer.from(await response.arrayBuffer())
if (buffer.byteLength > maxBytes) {
  throw new Error(`Live catalog is ${String(buffer.byteLength)} bytes; maxBytes is ${String(maxBytes)}`)
}
const catalog = parseMarketplaceCatalogText(buffer.toString('utf8'))
process.stdout.write(
  `PASS: live catalog ${String(catalog.entries.length)} entries, ${String(buffer.byteLength)} bytes, generated ${catalog.generatedAt}\n`,
)
