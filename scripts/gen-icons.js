/**
 * tabBar / 功能图标生成脚本
 *
 * 微信小程序原生 tabBar 只接受本地 PNG，不支持 SVG / 网络 URL / base64，
 * 因此图标必须离线生成。此脚本用纯 Node（仅 zlib）手写栅格化 + PNG 编码，
 * 不引入任何第三方依赖。
 *
 * 渲染方式：4 倍超采样 + 距离场抗锯齿，每个像素采样 16 次取覆盖率作为 alpha。
 *
 * 用法：node scripts/gen-icons.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SS = 4;
const OUT_DIR = path.join(__dirname, "..", "assets", "icons");

const COLOR_TAB_NORMAL = [0x6b, 0x8f, 0x71];
const COLOR_TAB_ACTIVE = [0x4c, 0xaf, 0x50];
const COLOR_SEARCH = [0x6b, 0x8f, 0x71];
const COLOR_CART = [0x4c, 0xaf, 0x50];
const COLOR_AVATAR = [0x9e, 0x9e, 0x9e];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return Math.sqrt(dx * dx + dy * dy);
}

function strokePolyline(points, closed) {
  return (x, y) => {
    let best = Infinity;
    for (let i = 0; i < points.length - 1; i += 1) {
      best = Math.min(
        best,
        distToSegment(
          x,
          y,
          points[i][0],
          points[i][1],
          points[i + 1][0],
          points[i + 1][1],
        ),
      );
    }
    if (closed) {
      const last = points[points.length - 1];
      best = Math.min(
        best,
        distToSegment(x, y, last[0], last[1], points[0][0], points[0][1]),
      );
    }
    return best;
  };
}

function fillPolygon(points) {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const xi = points[i][0];
      const yi = points[i][1];
      const xj = points[j][0];
      const yj = points[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside ? -1 : 1;
  };
}

function circleSdf(cx, cy, r) {
  return (x, y) => Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) - r;
}

function circleStrokeSdf(cx, cy, r) {
  return (x, y) =>
    Math.abs(Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) - r);
}

function makeLayers(descriptors) {
  return descriptors.map((d) => {
    let sdf;
    if (d.points) {
      sdf =
        d.kind === "fill"
          ? fillPolygon(d.points)
          : strokePolyline(d.points, d.closed);
    } else if (d.kind === "fill") {
      sdf = circleSdf(d.circle[0], d.circle[1], d.circle[2]);
    } else {
      sdf = circleStrokeSdf(d.circle[0], d.circle[1], d.circle[2]);
    }
    return {
      sdf,
      half: d.kind === "fill" ? undefined : (d.width || 4) / 2,
      op: d.op || "add",
    };
  });
}

function render(size, baseSize, layers, color) {
  const buf = Buffer.alloc(size * size * 4);
  const ratio = baseSize / size;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) * ratio;
          const y = (py + (sy + 0.5) / SS) * ratio;
          let inside = false;
          for (let i = 0; i < layers.length; i += 1) {
            const layer = layers[i];
            const d = layer.sdf(x, y);
            const hit =
              layer.half === undefined ? d <= 0 : Math.abs(d) <= layer.half;
            if (layer.op === "sub") {
              if (hit) {
                inside = false;
              }
            } else if (hit) {
              inside = true;
            }
          }
          if (inside) {
            hits += 1;
          }
        }
      }
      if (hits > 0) {
        const idx = (py * size + px) * 4;
        buf[idx] = color[0];
        buf[idx + 1] = color[1];
        buf[idx + 2] = color[2];
        buf[idx + 3] = Math.round((hits / (SS * SS)) * 255);
      }
    }
  }
  return buf;
}

const HOUSE = [
  [40.5, 12],
  [68, 37],
  [68, 68],
  [13, 68],
  [13, 37],
];
const CART_BASKET = [
  [31, 34],
  [69, 34],
  [62, 60],
  [38, 60],
];
const CART_HANDLE = [
  [14, 25],
  [26, 25],
  [33, 34],
];
const RECEIPT = [
  [27, 13],
  [55, 13],
  [55, 68],
  [27, 68],
];
function buildPersonDome(steps) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const deg = 180 - (180 * i) / steps;
    const rad = (deg * Math.PI) / 180;
    points.push([40.5 + 20.5 * Math.cos(rad), 72 - 24.5 * Math.sin(rad)]);
  }
  return points;
}

const PERSON_DOME = buildPersonDome(14);

const TAB_ICONS = {
  home: {
    normal: [{ kind: "stroke", points: HOUSE, closed: true, width: 4 }],
    active: [{ kind: "fill", points: HOUSE }],
  },
  cart: {
    normal: [
      { kind: "stroke", points: CART_HANDLE, width: 4 },
      { kind: "stroke", points: CART_BASKET, closed: true, width: 4 },
      { kind: "stroke", circle: [42, 68, 4.5], width: 4 },
      { kind: "stroke", circle: [60, 68, 4.5], width: 4 },
    ],
    active: [
      { kind: "stroke", points: CART_HANDLE, width: 5 },
      { kind: "fill", points: CART_BASKET },
      { kind: "fill", circle: [42, 68, 5] },
      { kind: "fill", circle: [60, 68, 5] },
    ],
  },
  order: {
    normal: [
      { kind: "stroke", points: RECEIPT, closed: true, width: 4 },
      {
        kind: "stroke",
        points: [
          [34, 30],
          [48, 30],
        ],
        width: 3,
      },
      {
        kind: "stroke",
        points: [
          [34, 42],
          [48, 42],
        ],
        width: 3,
      },
      {
        kind: "stroke",
        points: [
          [34, 54],
          [48, 54],
        ],
        width: 3,
      },
    ],
    active: [
      { kind: "fill", points: RECEIPT },
      {
        kind: "stroke",
        points: [
          [34, 30],
          [48, 30],
        ],
        width: 3.5,
        op: "sub",
      },
      {
        kind: "stroke",
        points: [
          [34, 42],
          [48, 42],
        ],
        width: 3.5,
        op: "sub",
      },
      {
        kind: "stroke",
        points: [
          [34, 54],
          [48, 54],
        ],
        width: 3.5,
        op: "sub",
      },
    ],
  },
  mine: {
    normal: [
      { kind: "stroke", circle: [40.5, 29, 11], width: 4 },
      { kind: "stroke", points: PERSON_DOME, width: 4 },
    ],
    active: [
      { kind: "fill", circle: [40.5, 29, 11] },
      { kind: "fill", points: PERSON_DOME },
    ],
  },
};

const SEARCH_LAYERS = [
  { kind: "stroke", circle: [10.5, 10.5, 7], width: 2 },
  {
    kind: "stroke",
    points: [
      [15.5, 15.5],
      [21, 21],
    ],
    width: 2,
  },
];

const CART_LAYERS = [
  {
    kind: "stroke",
    points: [
      [3, 6],
      [6.5, 6],
      [8.5, 9],
    ],
    width: 1.7,
  },
  {
    kind: "stroke",
    points: [
      [7.5, 9],
      [21, 9],
      [18.5, 17.5],
      [10, 17.5],
    ],
    closed: true,
    width: 1.7,
  },
  { kind: "stroke", circle: [11.5, 20.5, 1.5], width: 1.7 },
  { kind: "stroke", circle: [18, 20.5, 1.5], width: 1.7 },
];

const AVATAR_LAYERS = [
  { kind: "fill", circle: [12, 9, 4] },
  {
    kind: "fill",
    points: [
      [3.5, 22],
      [4.8, 16.5],
      [8, 13],
      [12, 12],
      [16, 13],
      [19.2, 16.5],
      [20.5, 22],
    ],
  },
];

function writeIcon(name, size, baseSize, descriptors, color) {
  const buf = render(size, baseSize, makeLayers(descriptors), color);
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, encodePNG(size, size, buf));
  return `${name}.png (${size}x${size})`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const created = [];

  Object.keys(TAB_ICONS).forEach((key) => {
    created.push(
      writeIcon(`tab-${key}`, 81, 81, TAB_ICONS[key].normal, COLOR_TAB_NORMAL),
    );
    created.push(
      writeIcon(
        `tab-${key}-active`,
        81,
        81,
        TAB_ICONS[key].active,
        COLOR_TAB_ACTIVE,
      ),
    );
  });

  created.push(writeIcon("search", 48, 24, SEARCH_LAYERS, COLOR_SEARCH));
  created.push(writeIcon("cart", 66, 24, CART_LAYERS, COLOR_CART));
  created.push(writeIcon("avatar", 96, 24, AVATAR_LAYERS, COLOR_AVATAR));

  created.forEach((item) => console.log(item));
  console.log(`done: ${created.length} icons -> ${OUT_DIR}`);
}

main();
