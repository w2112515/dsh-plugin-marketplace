/** Fail when the DSH load identity drifts from package.json name. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const expected = pkg.name
if (typeof expected !== 'string' || expected.length === 0) {
  fail('package.json name is missing.')
}

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
const patchNames = [...patch.matchAll(/^\s+name:\s*(?:'([^']+)'|"([^"]+)"|(\S+))\s*$/gmu)]
  .map(match => match[1] ?? match[2] ?? match[3])
  .filter(name => name !== undefined)
if (!patchNames.includes(expected)) {
  fail(`cordis.patch.yml row name must be ${JSON.stringify(expected)}; found ${JSON.stringify(patchNames)}.`)
}

const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
const clientId = /id:\s*"([^"]+)"/u.exec(client)?.[1]
if (clientId !== expected) {
  fail(`lib/client.js module id must be ${JSON.stringify(expected)}; found ${JSON.stringify(clientId)}.`)
}

process.stdout.write(`PASS: bundle identity ${expected}\n`)

function fail(message) {
  process.stderr.write(`FAIL: ${message}\n`)
  process.exit(1)
}
