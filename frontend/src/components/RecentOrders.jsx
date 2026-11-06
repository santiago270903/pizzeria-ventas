import { money, shortName } from '../format.js';

export default function RecentOrders({ orders, loading, error, onRefresh, nameOf }) {
  return (
    <section className="recent">
      <div className="section-head">
        <div>
          <h2>Últimos pedidos en la hoja</h2>
          <p className="muted">Leídos directamente de la tabla <code>Fac</code> del Google Sheets.</p>
        </div>
        <button className="btn ghost" onClick={onRefresh} disabled={loading}>
          {loading ? 'Cargando…' : '↻ Actualizar'}
        </button>
      </div>

      {error && <p className="error">⚠ {error}</p>}
      {!error && !loading && orders.length === 0 && <p className="muted">Aún no hay pedidos para mostrar.</p>}

      <div className="recent-list">
        {orders.map((o) => (
          <div className="recent-item" key={o.orderId}>
            <div className="recent-top">
              <strong>#{o.orderId}</strong>
              <span className="muted small">
                {o.date || `sk_date ${o.skDate || '—'}`}
                {o.time ? ` ${o.time.slice(0, 5)}` : ''} · {o.city}
                {o.channel && o.channel !== 'Sin dato' ? ` · ${o.channel}` : ''}
              </span>
            </div>
            <p className="small">
              {o.items.map((it) => `${it.quantity}× ${nameOf(it.pizzaId)}`).join(', ')}
            </p>
            <span className="recent-total">{money(o.total)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export const makeNameOf = (pizzas) => {
  const map = {};
  pizzas.forEach((p) => p.sizes.forEach((s) => (map[s.pizzaId] = `${shortName(p.name)} ${s.size}`)));
  return (id) => map[id] || id;
};
