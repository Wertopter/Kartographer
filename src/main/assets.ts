import { readFile } from 'fs/promises'
import { extname, resolve, sep } from 'path'

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

export async function readAsset(assetsDir: string, requestUrl: string): Promise<Response> {
  if (!assetsDir) return new Response(null, { status: 404 })
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return new Response(null, { status: 400 })
  }
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
        'Cache-Control': 'no-cache'
      }
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
