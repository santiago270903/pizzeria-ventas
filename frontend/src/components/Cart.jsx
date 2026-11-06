import { money, shortName } from '../format.js';
import PizzaArt from './PizzaArt.jsx';

export default function Cart({
  items,
  cities,
  cityId,
  setCityId,
  channels,
  channelId,
  setChannelId,
  date,
  setDate,
  onQty,
  onRemove,
  onSubmit,
  sending,
  error,
  onClose,
}) {
  const total = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const count = items.reduce((s, it) => s + it.quantity, 0);
  const canSend = items.length > 0 && cityId && channelId && date && !sending;
  const missing = [!cityId && 'la ciudad', !channelId && 'el canal de venta'].filter(Boolean).join(' y ');

  return (
    <aside className="cart" aria-label="Pedido actual">
      <div className="cart-head">
        <h2>Tu pedido</h2>
        <span className="muted">{count} {count === 1 ? 'pizza' : 'pizzas'}</span>
        {onClose && (
          <button className="icon-btn close-cart" onClick={onClose} aria-label="Cerrar pedido">
            ✕
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <PizzaArt id="vacio" category="Otras" size={72} />
          <p>Agrega pizzas del menú para armar la venta.</p>
        </div>
      ) : (
        <ul className="lines">
          {items.map((it) => (
            <li key={it.pizzaId}>
              <div className="line-info">
                <strong>{shortName(it.name)}</strong>
                <span className="muted small">
                  {it.size} · {money(it.price)} · <code>{it.pizzaId}</code>
                </span>
              </div>
              <div className="stepper">
                <button onClick={() => onQty(it.pizzaId, it.quantity - 1)} aria-label="Quitar una">−</button>
                <span>{it.quantity}</span>
                <button onClick={() => onQty(it.pizzaId, it.quantity + 1)} aria-label="Agregar una">+</button>
              </div>
              <span className="line-total">{money(it.price * it.quantity)}</span>
              <button className="icon-btn" onClick={() => onRemove(it.pizzaId)} aria-label="Eliminar">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="fields">
        <label>
          Ciudad / sede
          <select value={cityId} onChange={(e) => setCityId(e.target.value)}>
            <option value="">Selecciona…</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.state ? `${c.name} (${c.state})` : c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Canal de venta
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">Selecciona…</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          Fecha de la venta
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="total-row">
        <span>Total</span>
        <strong>{money(total)}</strong>
      </div>

      {error && <p className="error">⚠ {error}</p>}

      <button className="btn primary block" disabled={!canSend} onClick={onSubmit}>
        {sending ? 'Guardando en Google Sheets…' : 'Registrar venta'}
      </button>
      {missing && items.length > 0 && <p className="hint">Elige {missing} para poder registrar.</p>}
    </aside>
  );
}
