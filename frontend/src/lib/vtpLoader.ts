/**
 * VTP (VTK XML PolyData) loader for Three.js.
 *
 * Handles the three encoding formats that VTK/PyVista can produce:
 *   - format="ascii"     — numbers as whitespace-separated text
 *   - format="binary"    — base64-encoded inline in the DataArray tag
 *   - format="appended"  — data in an <AppendedData> section (base64),
 *                           optionally compressed with vtkZLibDataCompressor
 */
import * as THREE from "three";

// ── Base64 helpers ───────────────────────────────────────────────────────

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Binary header reader (UInt32 or UInt64 little-endian) ────────────────

function readUint(bytes: Uint8Array, offset: number, size: 4 | 8): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
  if (size === 8) {
    const lo = view.getUint32(0, true);
    const hi = view.getUint32(4, true);
    return lo + hi * 0x100000000;
  }
  return view.getUint32(0, true);
}

// ── Zlib decompression via browser Compression Streams API ───────────────

async function inflate(compressed: Uint8Array): Promise<Uint8Array> {
  // VTK's vtkZLibDataCompressor produces zlib-wrapped deflate (RFC 1950).
  // Try 'deflate' first (zlib header), fall back to 'deflate-raw' (headerless).
  for (const fmt of ["deflate", "deflate-raw"] as CompressionFormat[]) {
    try {
      const ds = new DecompressionStream(fmt);
      const writer = ds.writable.getWriter();
      writer.write(new Uint8Array(compressed) as unknown as BufferSource);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      return out;
    } catch {
      // try next format
    }
  }
  throw new Error("VTP: zlib decompression failed");
}

// ── Typed array construction ─────────────────────────────────────────────

function toNumbers(
  bytes: Uint8Array,
  dtype: string,
): Float64Array | Float32Array | Int32Array | number[] {
  // Copy into a new aligned buffer
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);

  switch (dtype) {
    case "Float32":
      return new Float32Array(buf);
    case "Float64":
      return new Float64Array(buf);
    case "Int32":
      return new Int32Array(buf);
    case "UInt32":
      return new Uint32Array(buf) as unknown as number[];
    case "Int64": {
      const big = new BigInt64Array(buf);
      return Array.from(big, (v) => Number(v));
    }
    case "UInt64": {
      const big = new BigUint64Array(buf);
      return Array.from(big, (v) => Number(v));
    }
    default:
      throw new Error(`VTP: unsupported dtype "${dtype}"`);
  }
}

// ── DataArray reader ─────────────────────────────────────────────────────

async function readDataArray(
  el: Element,
  appendedBytes: Uint8Array | null,
  hdrSize: 4 | 8,
  compressed: boolean,
): Promise<Float64Array | Float32Array | Int32Array | number[]> {
  const format = el.getAttribute("format") || "ascii";
  const dtype = el.getAttribute("type") || "Float64";

  // ─ ASCII ─
  if (format === "ascii") {
    return Float64Array.from(
      (el.textContent || "").trim().split(/\s+/).map(Number),
    );
  }

  // ─ Inline base64 ─
  if (format === "binary") {
    const raw = base64Decode((el.textContent || "").trim());
    const dataSize = readUint(raw, 0, hdrSize);
    return toNumbers(raw.slice(hdrSize, hdrSize + dataSize), dtype);
  }

  // ─ Appended ─
  if (format === "appended") {
    if (!appendedBytes)
      throw new Error("VTP: appended format but no AppendedData");
    const offset = +(el.getAttribute("offset") || "0");

    if (!compressed) {
      const dataSize = readUint(appendedBytes, offset, hdrSize);
      return toNumbers(
        appendedBytes.slice(offset + hdrSize, offset + hdrSize + dataSize),
        dtype,
      );
    }

    // Compressed blocks
    let pos = offset;
    const numBlocks = readUint(appendedBytes, pos, hdrSize);
    pos += hdrSize;
    const blockSize = readUint(appendedBytes, pos, hdrSize);
    pos += hdrSize;
    const lastBlockSize = readUint(appendedBytes, pos, hdrSize);
    pos += hdrSize;

    const compSizes: number[] = [];
    for (let i = 0; i < numBlocks; i++) {
      compSizes.push(readUint(appendedBytes, pos, hdrSize));
      pos += hdrSize;
    }

    const chunks: Uint8Array[] = [];
    for (let i = 0; i < numBlocks; i++) {
      const slice = appendedBytes.slice(pos, pos + compSizes[i]);
      pos += compSizes[i];
      const expectedSize = i < numBlocks - 1 ? blockSize : lastBlockSize;
      if (compSizes[i] === expectedSize) {
        chunks.push(slice); // not actually compressed
      } else {
        chunks.push(await inflate(slice));
      }
    }

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const full = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      full.set(c, off);
      off += c.length;
    }
    return toNumbers(full, dtype);
  }

  throw new Error(`VTP: unknown format "${format}"`);
}

// ── Public API ───────────────────────────────────────────────────────────

export async function loadVTP(url: string): Promise<THREE.BufferGeometry> {
  const text = await (await fetch(url)).text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  const vtkFile = xml.querySelector("VTKFile");
  if (!vtkFile) throw new Error("VTP: not a valid VTK XML file");

  const hdrSize: 4 | 8 =
    (vtkFile.getAttribute("header_type") || "UInt32") === "UInt64" ? 8 : 4;
  const compressed = (vtkFile.getAttribute("compressor") || "").includes(
    "ZLib",
  );

  // ── Decode AppendedData (if present) ──
  let appendedBytes: Uint8Array | null = null;
  const appendedEl = xml.querySelector("AppendedData");
  if (appendedEl) {
    const raw = appendedEl.textContent || "";
    const underscoreIdx = raw.indexOf("_");
    if (underscoreIdx >= 0) {
      const b64 = raw.substring(underscoreIdx + 1).trim();
      if (b64.length > 0) appendedBytes = base64Decode(b64);
    }
  }

  const piece = xml.querySelector("Piece");
  if (!piece) throw new Error("VTP: no <Piece> element");
  const nPoints = +(piece.getAttribute("NumberOfPoints") || "0");
  const nPolys = +(piece.getAttribute("NumberOfPolys") || "0");

  // ── Points ──
  const pointsDA = xml.querySelector("Points > DataArray");
  if (!pointsDA) throw new Error("VTP: no Points DataArray");
  const pointsRaw = await readDataArray(
    pointsDA,
    appendedBytes,
    hdrSize,
    compressed,
  );

  // ── Polys (connectivity + offsets) ──
  let connDA: Element | null = null;
  let offDA: Element | null = null;
  xml.querySelectorAll("Polys > DataArray").forEach((da) => {
    const name = da.getAttribute("Name");
    if (name === "connectivity") connDA = da;
    if (name === "offsets") offDA = da;
  });
  if (!connDA || !offDA) throw new Error("VTP: missing Polys arrays");

  const connectivity = await readDataArray(
    connDA,
    appendedBytes,
    hdrSize,
    compressed,
  );
  const offsets = await readDataArray(
    offDA,
    appendedBytes,
    hdrSize,
    compressed,
  );

  // ── Build geometry ──
  const positions = new Float32Array(nPoints * 3);
  for (let i = 0; i < nPoints * 3; i++) positions[i] = Number(pointsRaw[i]);

  // Fan-triangulate each polygon
  const indices: number[] = [];
  let prev = 0;
  for (let i = 0; i < nPolys; i++) {
    const end = Number(offsets[i]);
    const nVerts = end - prev;
    for (let j = 1; j < nVerts - 1; j++) {
      indices.push(
        Number(connectivity[prev]),
        Number(connectivity[prev + j]),
        Number(connectivity[prev + j + 1]),
      );
    }
    prev = end;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  console.log("[VTP Loader] Loaded:", {
    nPoints,
    nPolys,
    triangles: indices.length / 3,
    bounds: geometry.boundingBox,
  });

  return geometry;
}
