export const money = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

export const CATEGORY_LABEL = {
  Chicken: 'Pollo',
  Classic: 'Clásicas',
  Supreme: 'Supremas',
  Veggie: 'Vegetarianas',
  Carnes: 'Carnes',
  Otras: 'Otras',
};

export const catLabel = (c) => CATEGORY_LABEL[c] || c;

export const shortName = (name) => String(name).replace(/^The\s+/i, '').replace(/\s+Pizza$/i, '');

export const SIZE_LABEL = { S: 'Personal', M: 'Mediana', L: 'Grande', XL: 'Extra grande', XXL: 'Familiar' };

export const todayISO = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local
