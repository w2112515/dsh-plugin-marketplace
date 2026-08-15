import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { afterEach, describe, expect, it } from 'vitest'
import {
  detectMarketplaceOperationCapabilities,
  MarketplaceProfileOperations,
  type MarketplaceProfileRuntime,
} from '../src/profile-operations.ts'
import type { MarketplaceCatalogSnapshot } from '../src/types.ts'
import { catalogFixture } from './fixture.ts'

const roots: string[] = []
const capabilities = {
  packageManager: 'pnpm' as const,
  profileWritable: true,
  profileName: 'web',
  message: null,
}
type TestManifest = ProfileManifest & {
  dependencies: Record<string, string>
  dsh: { profile: { bundles: string[] } }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function stageProfile(): Promise<MarketplaceProfileRuntime> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-marketplace-profile-'))
  roots.push(root)
  const dir = join(root, 'profiles', 'web')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [] } },
  }, undefined, 2)}\n`)
  await writeFile(join(dir, 'cordis.patch.yml'), '[]\n')
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages: []\nnodeLinker: hoisted\n')
  return { profileName: 'web', dir, bundlesAtLaunch: [], dependenciesAtLaunch: {} }
}

async function readManifest(dir: string): Promise<TestManifest> {
  return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as TestManifest
}

async function stageInstalledPackage(dir: string, catalog: MarketplaceCatalogSnapshot): Promise<void> {
  const entry = catalog.entries[0]!
  const packageName = entry.package.name!
  const packageDir = join(dir, 'node_modules', ...packageName.split('/'))
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({
    name: packageName,
    version: entry.package.version,
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(packageDir, 'cordis.patch.yml'), '[]\n')
}

async function stageActiveProfile(
  catalog: MarketplaceCatalogSnapshot,
  installedSpec = catalog.entries[0]!.source.ref,
): Promise<MarketplaceProfileRuntime> {
  const runtime = await stageProfile()
  const entry = catalog.entries[0]!
  const manifest = await readManifest(runtime.dir)
  manifest.dependencies[entry.package.name!] = installedSpec
  manifest.dsh.profile.bundles.push(entry.package.name!)
  await writeFile(join(runtime.dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
  await stageInstalledPackage(runtime.dir, catalog)
  return {
    ...runtime,
    dependenciesAtLaunch: { [entry.package.name!]: installedSpec },
    bundlesAtLaunch: [entry.package.name!],
  }
}

describe('MarketplaceProfileOperations', () => {
  it('installs only the reviewed immutable source and stages activation for restart', async () => {
    const runtime = await stageProfile()
    const catalog = catalogFixture()
    const calls: string[][] = []
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => catalog,
      capabilities,
      runPnpm: async (args) => {
        calls.push([...args])
        const entry = catalog.entries[0]!
        const manifest = await readManifest(runtime.dir)
        manifest.dependencies[entry.package.name!] = entry.source.ref
        await writeFile(join(runtime.dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
        await stageInstalledPackage(runtime.dir, catalog)
        return { exitCode: 0, unavailable: false }
      },
    })

    const plan = operations.plan({ repositoryId: '123456', action: 'install' })
    expect(plan).toMatchObject({ status: 'ready', sourceRef: catalog.entries[0]!.source.ref })
    const result = await operations.execute({ planId: plan.planId! })
    expect(result).toMatchObject({
      status: 'succeeded', code: 'succeeded', requiresRestart: true, rollback: 'not-needed',
    })
    expect(result.snapshot.plugins[0]?.state).toBe('pending-install')
    expect(calls).toEqual([['add', '--ignore-scripts', '--save-exact', catalog.entries[0]!.source.ref]])
    expect((await readManifest(runtime.dir)).dsh.profile.bundles).toEqual(['@example/dsh-weather-bundle'])
  })

  it('restores the profile and repairs dependencies when pnpm fails', async () => {
    const runtime = await stageProfile()
    const catalog = catalogFixture()
    const original = await readFile(join(runtime.dir, 'package.json'), 'utf8')
    let calls = 0
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => catalog,
      capabilities,
      runPnpm: async () => {
        calls += 1
        if (calls === 1) {
          await writeFile(join(runtime.dir, 'package.json'), '{"corrupted":true}\n')
          return { exitCode: 1, unavailable: false }
        }
        return { exitCode: 0, unavailable: false }
      },
    })

    const plan = operations.plan({ repositoryId: '123456', action: 'install' })
    await expect(operations.execute({ planId: plan.planId! })).resolves.toMatchObject({
      status: 'failed', code: 'pnpm-failed', rollback: 'succeeded',
    })
    expect(calls).toBe(2)
    expect(await readFile(join(runtime.dir, 'package.json'), 'utf8')).toBe(original)
  })

  it('blocks unsafe or unreviewed catalog requests before pnpm starts', async () => {
    const runtime = await stageProfile()
    const manual = catalogFixture({
      entries: [{ ...catalogFixture().entries[0]!, installability: 'manual' }],
    })
    let calls = 0
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => manual,
      capabilities,
      runPnpm: async () => {
        calls += 1
        return { exitCode: 0, unavailable: false }
      },
    })

    expect(operations.plan({ repositoryId: '123456', action: 'install' })).toMatchObject({
      status: 'blocked', blockCode: 'not-one-click-eligible',
    })
    expect(operations.plan({ repositoryId: 'missing', action: 'install' })).toMatchObject({
      status: 'blocked', blockCode: 'catalog-entry-missing',
    })
    const invalidCatalog = catalogFixture({
      entries: [{
        ...catalogFixture().entries[0]!,
        validation: { status: 'invalid', code: 'bundle-declaration-missing', message: 'missing' },
      }],
    })
    const invalidOperations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => invalidCatalog,
      capabilities,
      runPnpm: async () => { throw new Error('must not run') },
    })
    expect(invalidOperations.plan({ repositoryId: '123456', action: 'install' })).toMatchObject({
      status: 'blocked', blockCode: 'catalog-entry-missing',
    })
    expect(calls).toBe(0)
  })

  it('updates and removes an active bundle while preserving restart truth', async () => {
    const catalog = catalogFixture()
    const oldSpec = 'git+https://github.com/example/dsh-weather-bundle.git#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const runtime = await stageActiveProfile(catalog, oldSpec)
    const calls: string[][] = []
    const runner = async (args: readonly string[]) => {
      calls.push([...args])
      const manifest = await readManifest(runtime.dir)
      const entry = catalog.entries[0]!
      if (args[0] === 'remove') delete manifest.dependencies[entry.package.name!]
      else {
        manifest.dependencies[entry.package.name!] = entry.source.ref
        await stageInstalledPackage(runtime.dir, catalog)
      }
      await writeFile(join(runtime.dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
      return { exitCode: 0, unavailable: false }
    }
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => catalog,
      capabilities,
      runPnpm: runner,
    })

    const update = operations.plan({ repositoryId: '123456', action: 'install' })
    expect(update).toMatchObject({ status: 'ready', action: 'update' })
    await expect(operations.execute({ planId: update.planId! })).resolves.toMatchObject({
      status: 'succeeded', action: 'update', snapshot: { plugins: [{ state: 'pending-update' }] },
    })

    // A restart is required before a second operation is admitted. Model that
    // restart with a new manager whose immutable launch snapshot is current.
    const restarted = { ...runtime, dependenciesAtLaunch: { [catalog.entries[0]!.package.name!]: catalog.entries[0]!.source.ref } }
    const removal = new MarketplaceProfileOperations({
      runtime: restarted,
      catalog: () => catalog,
      capabilities,
      runPnpm: runner,
    })
    const remove = removal.plan({ repositoryId: '123456', action: 'remove' })
    expect(remove).toMatchObject({ status: 'ready', action: 'remove' })
    await expect(removal.execute({ planId: remove.planId! })).resolves.toMatchObject({
      status: 'succeeded', action: 'remove', snapshot: { plugins: [{ state: 'pending-removal' }] },
    })
    expect(calls.map(args => args[0])).toEqual(['add', 'remove'])
  })

  it('rejects expired plans and profile drift without invoking pnpm', async () => {
    const runtime = await stageProfile()
    const catalog = catalogFixture()
    let now = 1_000
    let calls = 0
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => catalog,
      capabilities,
      now: () => now,
      runPnpm: async () => {
        calls += 1
        return { exitCode: 0, unavailable: false }
      },
    })
    const expired = operations.plan({ repositoryId: '123456', action: 'install' })
    now += 5 * 60 * 1000 + 1
    await expect(operations.execute({ planId: expired.planId! })).resolves.toMatchObject({ code: 'plan-expired' })

    const fresh = operations.plan({ repositoryId: '123456', action: 'install' })
    const manifest = await readManifest(runtime.dir)
    manifest.dependencies['@example/dsh-weather-bundle'] = 'changed-outside-marketplace'
    await writeFile(join(runtime.dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
    await expect(operations.execute({ planId: fresh.planId! })).resolves.toMatchObject({ code: 'profile-state-changed' })
    expect(calls).toBe(0)
  })

  it('keeps operation snapshots sparse and blocks unavailable package managers before writing', async () => {
    const runtime = await stageProfile()
    const catalog = catalogFixture()
    let calls = 0
    const unavailable = { ...capabilities, packageManager: 'unavailable' as const, message: 'missing' }
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => catalog,
      capabilities: unavailable,
      runPnpm: async () => {
        calls += 1
        return { exitCode: 0, unavailable: false }
      },
    })
    expect(operations.snapshot()).toMatchObject({ capabilities: unavailable, plugins: [], external: [] })
    expect(operations.plan({ repositoryId: '123456', action: 'install' })).toMatchObject({
      status: 'blocked', blockCode: 'package-manager-unavailable',
    })
    expect(calls).toBe(0)
  })

  it('reports profile packages the catalog does not describe as read-only external entries', async () => {
    const runtime = await stageProfile()
    const manifest = await readManifest(runtime.dir)
    manifest.dependencies['@elsewhere/tool'] = '1.2.3'
    manifest.dsh.profile.bundles.push('@elsewhere/tool', '@deepseek-ai/dsh-web-app')
    await writeFile(join(runtime.dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
    const operations = new MarketplaceProfileOperations({
      runtime: { ...runtime, dependenciesAtLaunch: { '@elsewhere/tool': '1.2.3' }, bundlesAtLaunch: ['@elsewhere/tool'] },
      catalog: () => catalogFixture(),
      capabilities,
      runPnpm: async () => { throw new Error('must not run') },
    })
    const snapshot = operations.snapshot()
    expect(snapshot.plugins).toEqual([])
    expect(snapshot.external).toEqual([{
      packageName: '@elsewhere/tool',
      installedSpec: '1.2.3',
      activeAtLaunch: true,
      activeAfterRestart: true,
    }])
  })

  it('collapses same-name catalog duplicates to the entry matching the installed source', async () => {
    const base = catalogFixture().entries[0]!
    const runtime = await stageActiveProfile(
      catalogFixture(),
      `github:example/dsh-weather-bundle#${base.repository.commitSha!}`,
    )
    const duplicate = {
      ...base,
      repositoryId: '999999',
      repository: { ...base.repository, fullName: 'copy/dsh-weather-bundle' },
      source: { ...base.source, ref: 'git+https://github.com/copy/dsh-weather-bundle.git#ffffffffffffffffffffffffffffffffffffffff' },
    }
    const catalog = catalogFixture({ entries: [...catalogFixture().entries, duplicate], summary: { entryCount: 2, invalidEntryCount: 0 } })
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => catalog,
      capabilities,
      runPnpm: async () => { throw new Error('must not run') },
    })
    const snapshot = operations.snapshot()
    expect(snapshot.plugins).toHaveLength(1)
    expect(snapshot.plugins[0]?.repositoryId).toBe('123456')
  })

  it('keeps the installed plugin identity when the catalog commit lags behind the installed one', async () => {
    const runtime = await stageActiveProfile(
      catalogFixture(),
      'github:example/dsh-weather-bundle#eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    )
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => catalogFixture(),
      capabilities,
      runPnpm: async () => { throw new Error('must not run') },
    })
    const snapshot = operations.snapshot()
    expect(snapshot.plugins).toHaveLength(1)
    expect(snapshot.plugins[0]?.repositoryId).toBe('123456')
    expect(snapshot.plugins[0]?.updateAvailable).toBe(true)
  })

  it('blocks an unwritable profile before writing', async () => {
    const runtime = await stageProfile()
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => catalogFixture(),
      capabilities: { ...capabilities, profileWritable: false, message: 'read-only' },
      runPnpm: async () => { throw new Error('must not run') },
    })
    expect(operations.plan({ repositoryId: '123456', action: 'install' })).toMatchObject({
      status: 'blocked', blockCode: 'profile-not-writable',
    })
  })

  it('detects pnpm, falls back to Corepack, and reports an unwritable profile', async () => {
    const runtime = await stageProfile()
    const corepack = await detectMarketplaceOperationCapabilities(
      runtime,
      async command => command === 'corepack',
      async () => undefined,
    )
    expect(corepack).toMatchObject({ packageManager: 'corepack-pnpm', profileWritable: true, message: null })

    const blocked = await detectMarketplaceOperationCapabilities(
      runtime,
      async () => false,
      async () => { throw new Error('denied') },
    )
    expect(blocked).toMatchObject({ packageManager: 'unavailable', profileWritable: false })
  })
})
