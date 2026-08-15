/** Zero-dependency atomic file replacement used for cache and profile rollback. */
import { randomBytes } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface WriteFileAtomicOptions {
  readonly mode: number
  readonly dirMode?: number
}

export async function writeFileAtomic(
  filename: string,
  content: string,
  options: WriteFileAtomicOptions,
): Promise<void> {
  await mkdir(dirname(filename), {
    recursive: true,
    ...(options.dirMode === undefined ? {} : { mode: options.dirMode }),
  })
  const temp = `${filename}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, content, { mode: options.mode, flag: 'wx' })
    await rename(temp, filename)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}
