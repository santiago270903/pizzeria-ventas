import { useState } from 'react';
import PizzaArt from './PizzaArt.jsx';
import { catLabel, money, shortName, SIZE_LABEL } from '../format.js';

export default function PizzaCard({ pizza, onAdd }) {
  const defaultSize = pizza.sizes.find((s) => s.size === 'M') || pizza.sizes[0];
  const [selected, setSelected] = useState(defaultSize.pizzaId);
  const [added, setAdded] = useState(false);
  const size = pizza.sizes.find((s) => s.pizzaId === selected) || defaultSize;

  const add = () => {
    onAdd(pizza, size);
    setAdded(true);
    setTimeout(() => setAdded(false), 900);
  };

  return (
    <article className="card">
      <div className="card-art">
        <PizzaArt id={pizza.typeId} category={pizza.category} size={132} />
        <span className="chip">{catLabel(pizza.category)}</span>
      </div>
      <div className="card-body">
        <h3>{shortName(pizza.name)}</h3>
        <p className="ingredients" title={pizza.ingredients}>
          {pizza.ingredients || 'Receta de la casa'}
        </p>
        <div className="sizes" role="radiogroup" aria-label="Tamaño">
          {pizza.sizes.map((s) => (
            <button
              key={s.pizzaId}
              role="radio"
              aria-checked={s.pizzaId === selected}
              className={'size' + (s.pizzaId === selected ? ' on' : '')}
              onClick={() => setSelected(s.pizzaId)}
              title={SIZE_LABEL[s.size] || s.size}
            >
              {s.size}
            </button>
          ))}
        </div>
        <div className="card-foot">
          <div>
            <span className="price">{money(size.price)}</span>
            <span className="muted small"> · {SIZE_LABEL[size.size] || size.size}</span>
          </div>
          <button className={'btn add' + (added ? ' done' : '')} onClick={add}>
            {added ? '✓ Agregada' : 'Agregar'}
          </button>
        </div>
      </div>
    </article>
  );
}
