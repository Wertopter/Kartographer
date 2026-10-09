import { ASSET_CHUNK_BYTES, MAX_ASSET_BYTES, type DataMessage } from '@shared/remote'

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function waitForBuffer(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState !== 'open' || channel.bufferedAmount < 1_000_000) return Promise.resolve()
  channel.bufferedAmountLowThreshold = 256_000
  return new Promise((resolve) => {
    const done = (): void => {
      channel.removeEventListener('bufferedamountlow', done)
      resolve()
    }
    channel.addEventListener('bufferedamountlow', done)
  })
}

export async function sendAsset(channel: RTCDataChannel, hash: string): Promise<boolean> {
  const asset = await window.kartographer.readRemoteAsset(hash)
  if (!asset || channel.readyState !== 'open') return false
  const bytes = asset.data instanceof Uint8Array ? asset.data : new Uint8Array(asset.data)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ASSET_BYTES) return false
  const count = Math.max(1, Math.ceil(bytes.byteLength / ASSET_CHUNK_BYTES))
  for (let index = 0; index < count; index += 1) {
    if (channel.readyState !== 'open') return false
    const slice = bytes.subarray(index * ASSET_CHUNK_BYTES, Math.min(bytes.byteLength, (index + 1) * ASSET_CHUNK_BYTES))
    const message: DataMessage = {
      type: 'asset',
      hash,
      mime: asset.mime,
      index,
      count,
      data: bytesToBase64(slice)
    }
    channel.send(JSON.stringify(message))
    await waitForBuffer(channel)
  }
  return true
}
