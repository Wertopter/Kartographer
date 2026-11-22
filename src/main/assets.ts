import { mkdir, readFile, writeFile } from 'fs/promises'
import { extname, join, resolve, sep } from 'path'

export function mimeType(fileName: string): string {
  switch (extname(fileName).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

const HASH_FILE = /^[a-f0-9]{64}$/

export async function readAsset(assetsDir: string, requestUrl: string, remoteDir = ''): Promise<Response> {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (url.hostname === 'remote') return readRemote(remoteDir, url.pathname)
  if (!assetsDir) return new Response(null, { status: 404 })
  if (url.hostname !== 'assets') return new Response(null, { status: 404 })
  const fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return new Response(null, { status: 400 })
  }
  const root = resolve(assetsDir) + sep
  const full = resolve(assetsDir, fileName)
  if (!full.startsWith(root)) return new Response(null, { status: 400 })
  try {
    const data = await readFile(full)
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': mimeType(fileName),
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

async function readRemote(remoteDir: string, pathname: string): Promise<Response> {
  if (!remoteDir) return new Response(null, { status: 404 })
  const hash = decodeURIComponent(pathname.replace(/^\/+/, ''))
  if (!HASH_FILE.test(hash)) return new Response(null, { status: 400 })
  try {
    const [data, mime] = await Promise.all([
      readFile(join(remoteDir, hash)),
      readFile(join(remoteDir, `${hash}.mime`), 'utf8')
    ])
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': mime.trim() || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

export async function writeRemoteAsset(
  remoteDir: string,
  hash: string,
  data: Uint8Array,
  mime: string
): Promise<boolean> {
  if (!HASH_FILE.test(hash)) return false
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) return false
  if (data.byteLength === 0 || data.byteLength > 80_000_000) return false
  await mkdir(remoteDir, { recursive: true })
  await writeFile(join(remoteDir, hash), data)
  await writeFile(join(remoteDir, `${hash}.mime`), mime)
  return true
}
