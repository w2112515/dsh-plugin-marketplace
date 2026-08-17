import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, relative, resolve } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig, type UserConfig } from 'tsdown'

const PACKAGE_ID = createRequire(import.meta.url)('./package.json').name as string
const CSS_PREFIX = '\0marketplace-css:'
const CSS_SUFFIX = '.mjs'
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const

const host: UserConfig = {
  name: PACKAGE_ID,
  entry: {
    index: 'src/index.ts',
    catalog: 'src/catalog.ts',
    types: 'src/types.ts',
  },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  dts: true,
  clean: true,
  sourcemap: true,
}

const client: UserConfig = {
  name: `${PACKAGE_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: false,
  sourcemap: true,
  deps: { neverBundle: [...CLIENT_EXTERNALS] },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [{
    name: 'marketplace-css-modules',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css') || importer === undefined) return null
      const pathname = new URL(source, `file:///${importer.replace(/\\/g, '/')}`).pathname
      const absolute = process.platform === 'win32' && /^\/[A-Za-z]:/.test(pathname) ? pathname.slice(1) : pathname
      // The virtual id lands in the bundle as a region comment, so it must be
      // machine-independent: repo-relative, POSIX separators.
      return `${CSS_PREFIX}${relative(process.cwd(), absolute).replace(/\\/g, '/')}${CSS_SUFFIX}`
    },
    async load(id: string) {
      if (!id.startsWith(CSS_PREFIX)) return null
      // The id is already the repo-relative POSIX name; recover the file.
      const stableName = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
      const file = resolve(process.cwd(), stableName)
      this.addWatchFile(file)
      // lightningcss folds `filename` into the css-modules class hash, so an
      // absolute path would make the build machine-dependent and the tracked
      // lib/ output impossible to verify in CI. A repo-relative name keeps
      // class names stable on every machine.
      const result = transform({
        filename: stableName,
        code: await readFile(file),
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classes = Object.fromEntries(
        Object.entries(result.exports ?? {})
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => [key, value.name]),
      )
      const tagId = `${PACKAGE_ID}/${basename(file)}`
      return [
        `const css = ${JSON.stringify(result.code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        "if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
        "  const tag = document.createElement('style');",
        `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classes)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([host, client])
