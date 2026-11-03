/**
 * Lecture minimale d'une archive ZIP (export Letterboxd) : répertoire central,
 * entrées « stockées » (0) ou « deflate » (8), décompressées avec DecompressionStream.
 */
export interface ZipEntry {
  name: string;
  read(): Promise<Uint8Array>;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function listZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Archive ZIP illisible');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== CENTRAL_SIGNATURE) throw new Error('Répertoire ZIP corrompu');
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;

    entries.push({
      name,
      async read() {
        if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) throw new Error(`Entrée ZIP corrompue : ${name}`);
        const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
        const data = bytes.subarray(start, start + compressedSize);
        if (method === 0) return data.slice();
        if (method !== 8) throw new Error(`Compression ZIP non prise en charge (${method}) : ${name}`);
        const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      },
    });
  }
  return entries;
}

export async function readZipText(bytes: Uint8Array, match: (name: string) => boolean): Promise<string | undefined> {
  const entry = listZip(bytes).find((e) => match(e.name));
  return entry ? new TextDecoder().decode(await entry.read()) : undefined;
}
