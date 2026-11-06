import { useMemo } from 'react';

// Ilustración SVG generada: cada pizza tiene ingredientes en posiciones "aleatorias"
// pero estables (semilla = id de la pizza), con colores según la categoría.
const TOPPINGS = {
  Classic: [
    { color: '#9b2217', r: 7, n: 7 },
    { color: '#3d6b35', r: 3, n: 5, leaf: true },
  ],
  Chicken: [
    { color: '#f1d8a8', r: 6, n: 7, chunk: true },
    { color: '#5d8f3a', r: 3, n: 6, leaf: true },
    { color: '#d8452f', r: 3.5, n: 4 },
  ],
  Supreme: [
    { color: '#7c1d16', r: 6.5, n: 6 },
    { color: '#2b2b2b', r: 3, n: 6, ring: true },
    { color: '#4f8a3a', r: 3.5, n: 4, leaf: true },
  ],
  Veggie: [
    { color: '#4f9a3c', r: 5, n: 6, ring: true },
    { color: '#c9b49a', r: 5, n: 5, chunk: true },
    { color: '#e04b35', r: 4, n: 5 },
  ],
  Carnes: [
    { color: '#6e2a14', r: 6, n: 9, chunk: true },
    { color: '#9b2217', r: 5, n: 4 },
  ],
};
const DEFAULT = [
  { color: '#9b2217', r: 6, n: 5 },
  { color: '#4f9a3c', r: 3.5, n: 5, leaf: true },
  { color: '#f2c14e', r: 3.5, n: 4 },
];

function rng(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export default function PizzaArt({ id, category, size = 120 }) {
  const shapes = useMemo(() => {
    const rand = rng(id);
    const out = [];
    for (const t of TOPPINGS[category] || DEFAULT) {
      for (let i = 0; i < t.n; i++) {
        const ang = rand() * Math.PI * 2;
        const dist = Math.sqrt(rand()) * 34;
        out.push({ ...t, x: 60 + Math.cos(ang) * dist, y: 60 + Math.sin(ang) * dist, rot: rand() * 180 });
      }
    }
    return out;
  }, [id, category]);

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" className="pizza-art">
      <circle cx="60" cy="62" r="54" fill="rgba(0,0,0,.12)" />
      <circle cx="60" cy="60" r="54" fill="#dc9a4f" />
      <circle cx="60" cy="60" r="47" fill="#c8402b" />
      <circle cx="60" cy="60" r="44" fill="#f4cf6a" />
      <path d="M30 48c8-6 14 4 22-2s16 6 26 0 12 8 16 4" stroke="#e8b84b" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M26 70c10 4 16-4 26 2s14-2 22 4 14-4 20 0" stroke="#e8b84b" strokeWidth="5" fill="none" strokeLinecap="round" />
      {shapes.map((s, i) =>
        s.leaf ? (
          <ellipse key={i} cx={s.x} cy={s.y} rx={s.r * 1.6} ry={s.r * 0.8} fill={s.color} transform={`rotate(${s.rot} ${s.x} ${s.y})`} />
        ) : s.ring ? (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="none" stroke={s.color} strokeWidth="2.4" />
        ) : s.chunk ? (
          <rect key={i} x={s.x - s.r / 2} y={s.y - s.r / 2} width={s.r} height={s.r * 0.8} rx="2" fill={s.color} transform={`rotate(${s.rot} ${s.x} ${s.y})`} />
        ) : (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.color} />
        )
      )}
    </svg>
  );
}
