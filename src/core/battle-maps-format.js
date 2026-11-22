(() => {
  /* =======================
       Battle Maps format - maps exported by Open20 Battle Maps
    ======================= */

  /**
   * Pure helpers for `.n21map` files (exported by Open20 Battle Maps with its
   * "Exportar a Nivel20" extension): checking a file, placing its cells on
   * the board and writing its walls the way Nivel20's fog of war keeps them.
   * No DOM and no Nivel20 objects here, so it can be checked on its own.
   *
   * Coordinates in the file are cells from the image's top-left corner.
   */

  const FORMAT = "open20.n21map";
  const SUPPORTED_VERSION = 1;

  /** Problems with a parsed file (empty when it can be imported). */
  function validate(data) {
    const problems = [];
    if (!data || typeof data !== "object") return ["El archivo no es un mapa de Battle Maps"];
    if (data.format !== FORMAT) problems.push("El archivo no es un mapa de Battle Maps (.n21map)");
    if (typeof data.version !== "number" || data.version > SUPPORTED_VERSION)
      problems.push("El mapa es de una versión más nueva: actualizá Nivel21");
    const g = data.grid || {};
    if (!(g.width > 0 && g.height > 0 && g.width <= 1000 && g.height <= 1000))
      problems.push("El tamaño de la cuadrícula no es válido");
    if (!data.background?.data) problems.push("Falta la imagen de fondo");
    if (!Array.isArray(data.tokens)) problems.push("Faltan los tokens");
    if (!Array.isArray(data.walls)) problems.push("Faltan los muros");
    return problems;
  }

  /**
   * A cell point (x, y from the image's top-left) on the board plane, from
   * the map's corners as MapManager gives them: [top-left, top-right,
   * bottom-right, bottom-left] of the image (local -0.5…0.5 on x and z).
   */
  function cellToWorld(corners, grid, x, y) {
    const u = x / grid.width;
    const v = y / grid.height;
    const [c0, c1, , c3] = corners;
    return {
      x: c0.x + (c1.x - c0.x) * u + (c3.x - c0.x) * v,
      z: c0.z + (c1.z - c0.z) * u + (c3.z - c0.z) * v,
    };
  }

  /** Token size in cells: the larger side of its image's footprint (at least a quarter cell). */
  function tokenScale(token) {
    return Math.max(0.25, Math.round(Math.max(token.width || 1, token.height || 1) * 100) / 100);
  }

  const PAIR_KEYS = [
    ["start", "end"],
    ["a", "b"],
    ["p1", "p2"],
    ["from", "to"],
  ];

  /**
   * How Nivel20 keeps a wall, learned from one it already has (`sample`).
   * Nivel20 doesn't document it, so the shape of an existing wall is copied:
   * a pair of points under some names, a points list, flat coordinates or an
   * array. Without a sample, a start/end pair on the board plane.
   */
  function wallShape(sample) {
    if (Array.isArray(sample) && sample.length >= 4 && sample.every((n) => typeof n === "number"))
      return { kind: "array" };
    if (!sample || typeof sample !== "object") return { kind: "pair", keys: ["start", "end"], axis: "z" };
    const axisOf = (p) => (p && typeof p === "object" && "z" in p ? "z" : "y");
    for (const keys of PAIR_KEYS)
      if (sample[keys[0]] && sample[keys[1]]) return { kind: "pair", keys, axis: axisOf(sample[keys[0]]) };
    if (Array.isArray(sample.points)) return { kind: "points", axis: axisOf(sample.points[0]) };
    if ("x1" in sample && "x2" in sample) return { kind: "flat", axis: "z1" in sample ? "z" : "y" };
    return { kind: "pair", keys: ["start", "end"], axis: "z" };
  }

  /** Extra fields of the sample to keep on new walls (flags, styles), not its geometry or id. */
  function sampleExtras(sample) {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) return {};
    const geometry = new Set(["start", "end", "a", "b", "p1", "p2", "from", "to", "points", "x1", "y1", "z1", "x2", "y2", "z2", "id", "networkId"]);
    const out = {};
    for (const [k, v] of Object.entries(sample)) if (!geometry.has(k) && typeof v !== "object") out[k] = v;
    return out;
  }

  /** One wall from a → b (board plane) in Nivel20's shape. */
  function nativeWall(a, b, shape, extras, kind, index) {
    const pt = (p) => (shape.axis === "z" ? { x: p.x, z: p.z } : { x: p.x, y: p.z });
    let wall;
    switch (shape.kind) {
      case "array":
        return [a.x, a.z, b.x, b.z];
      case "points":
        wall = { points: [pt(a), pt(b)] };
        break;
      case "flat":
        wall = shape.axis === "z" ? { x1: a.x, z1: a.z, x2: b.x, z2: b.z } : { x1: a.x, y1: a.z, x2: b.x, y2: b.z };
        break;
      default:
        wall = { [shape.keys[0]]: pt(a), [shape.keys[1]]: pt(b) };
    }
    return { ...extras, ...wall, id: `n21-bm-${index}`, n21Kind: kind };
  }

  /** The file's walls on the board, in the shape of `sample` (an existing Nivel20 wall, if any). */
  function toNativeWalls(data, corners, sample) {
    const shape = wallShape(sample);
    const extras = sampleExtras(sample);
    return data.walls.map((w, i) =>
      nativeWall(
        cellToWorld(corners, data.grid, w.x1, w.y1),
        cellToWorld(corners, data.grid, w.x2, w.y2),
        shape,
        extras,
        w.kind || "wall",
        i,
      ),
    );
  }

  /** Bytes of a base64 string (for the images in the file). */
  function base64ToBlob(data, mime) {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || "image/png" });
  }

  window._n21_ = window._n21_ || {};
  window._n21_.battleMaps = {
    FORMAT,
    SUPPORTED_VERSION,
    validate,
    cellToWorld,
    tokenScale,
    wallShape,
    toNativeWalls,
    base64ToBlob,
  };
})();
