type FlatPoint = number;
type Point2D = { x: number; y: number };

export function flatPoint({ x, y }: Point2D) {
  return x + y * 10_000;
}

function point2D(n: FlatPoint): Point2D {
  return { x: n % 10_000, y: Math.floor(n / 10_000) };
}

function toPaddedHex(n: number) {
  return n.toString(16).padStart(2, "0");
}

export default class Pixels {
  storage: Map<FlatPoint, number>;

  constructor(data?: Map<FlatPoint, number>) {
    this.storage = data || new Map();
  }

  set(x: number, y: number, color: number | null) {
    const map = new Map(this.storage);
    if (color === null) {
      map.delete(flatPoint({ x, y }));
    } else {
      map.set(flatPoint({ x, y }), color);
    }
    return new Pixels(map);
  }

  *[Symbol.iterator]() {
    for (const [flat, color] of this.storage) {
      const { x, y } = point2D(flat);
      yield { x, y, color };
    }
  }

  toString() {
    let result = "";
    for (const { x, y, color } of this) {
      result += toPaddedHex(x) + toPaddedHex(y) + toPaddedHex(color);
    }
    return result;
  }

  static fromString(data: string) {
    const map = new Map();
    for (const [pixel] of data.matchAll(/.{6}/g)) {
      const [x, y, color] = [...pixel.matchAll(/.{2}/g)].map(([n]) =>
        parseInt(n, 16)
      );
      map.set(flatPoint({ x, y }), color);
    }

    return new Pixels(map);
  }
}
