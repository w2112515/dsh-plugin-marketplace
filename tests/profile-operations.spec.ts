import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MarketplaceProfileOperations,
  type MarketplaceProfileRuntime,
} from '../src/profile-operations.ts'
import type { MarketplaceCatalogSnapshot } from '../src/types.ts'
import { catalogFixture } from './fixture.ts'

const roots: string[] = []
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

describe('MarketplaceProfileOperations', () => {
  it('installs only the reviewed immutable source and stages activation for restart', async () => {
    const runtime = await stageProfile()
    const catalog = catalogFixture()
    const calls: string[][] = []
    const operations = new MarketplaceProfileOperations({
      runtime,
      catalog: () => catalog,
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
    expect(calls).toBe(0)
  })
})
