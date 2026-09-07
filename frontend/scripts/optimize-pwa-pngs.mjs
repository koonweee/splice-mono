// Recompress PNG IDAT data losslessly without changing decoded scanlines,
// dimensions, colors, branding, or ancillary chunks.
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { deflateSync, inflateSync } from 'node:zlib'
const files = [
  'public/favicon192.png',
  'public/favicon512.png',
  'public/apple-touch-icon.png',
  ...(await readdir('public/splash'))
    .filter((name) => name.endsWith('.png'))
    .map((name) => `public/splash/${name}`),
]
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
let saved = 0
for (const file of files) {
  const input = await readFile(file)
  assert.equal(input.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const chunks = []
  for (let offset = 8; offset < input.length; ) {
    const length = input.readUInt32BE(offset)
    chunks.push({
      type: input.toString('ascii', offset + 4, offset + 8),
      bytes: input.subarray(offset, offset + length + 12),
      data: input.subarray(offset + 8, offset + length + 8),
    })
    offset += length + 12
  }
  const original = inflateSync(
    Buffer.concat(
      chunks
        .filter((chunk) => chunk.type === 'IDAT')
        .map((chunk) => chunk.data),
    ),
  )
  const data = deflateSync(original, { level: 9 })
  assert.deepEqual(inflateSync(data), original)
  const idat = Buffer.alloc(data.length + 12)
  idat.writeUInt32BE(data.length)
  idat.write('IDAT', 4, 'ascii')
  data.copy(idat, 8)
  idat.writeUInt32BE(crc32(idat.subarray(4, -4)), idat.length - 4)
  let inserted = false
  const output = Buffer.concat([
    input.subarray(0, 8),
    ...chunks.flatMap((chunk) => {
      if (chunk.type !== 'IDAT') return [chunk.bytes]
      if (inserted) return []
      inserted = true
      return [idat]
    }),
  ])
  if (output.length < input.length) {
    await writeFile(file, output)
    saved += input.length - output.length
  }
}
console.log(
  `Lossless PNG recompression: ${files.length} images checked, ${saved} bytes saved.`,
)
