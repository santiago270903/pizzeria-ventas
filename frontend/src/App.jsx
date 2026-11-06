import { useCallback, useEffect, useMemo, useState } from 'react';
import { createOrder, fetchCatalog, fetchRecent, isConfigured } from './api.js';
import { catLabel, money, todayISO } from './format.js';
import PizzaCard from './components/PizzaCard.jsx';
import Cart from './components/Cart.jsx';
import SuccessModal from './components/SuccessModal.jsx';
import RecentOrders, { makeNameOf } from './components/RecentOrders.jsx';
import PizzaArt from './components/PizzaArt.jsx';

const MAX_QTY = 50; // mismo límite que el Apps Script

export default function App() {
  const [catalog, setCatalog] = useState({ pizzas: [], cities: [], channels: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [category, setCategory] = useState('Todas');
  const [query, setQuery] = useState('');

  const [cart, setCart] = useState([]);
  const [cityId, setCityId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [result, setResult] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState('');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchCatalog();
      setCatalog({ pizzas: data.pizzas || [], cities: data.cities || [], channels: data.channels || [] });
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    setRecentError('');
    try {
      setRecent(await fetchRecent(6));
    } catch (e) {
      setRecentError(e.message);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadRecent();
  }, [loadCatalog, loadRecent]);

  const categories = useMemo(
    () => ['Todas', ...Array.from(new Set(catalog.pizzas.map((p) => p.category)))],
    [catalog.pizzas]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.pizzas.filter(
      (p) =>
        (category === 'Todas' || p.category === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.ingredients.toLowerCase().includes(q))
    );
  }, [catalog.pizzas, category, query]);

  const nameOf = useMemo(() => makeNameOf(catalog.pizzas), [catalog.pizzas]);

  const addToCart = (pizza, size) => {
    setSendError('');
    setCart((c) => {
      const found = c.find((it) => it.pizzaId === size.pizzaId);
      if (found) return c.map((it) => (it === found ? { ...it, quantity: Math.min(it.quantity + 1, MAX_QTY) } : it));
      return [...c, { pizzaId: size.pizzaId, name: pizza.name, size: size.size, price: size.price, quantity: 1 }];
    });
  };

  const setQty = (pizzaId, q) =>
    setCart((c) =>
      q <= 0
        ? c.filter((it) => it.pizzaId !== pizzaId)
        : c.map((it) => (it.pizzaId === pizzaId ? { ...it, quantity: Math.min(q, MAX_QTY) } : it))
    );

  const removeItem = (pizzaId) => setCart((c) => c.filter((it) => it.pizzaId !== pizzaId));

  const submit = async () => {
    setSending(true);
    setSendError('');
    try {
      const res = await createOrder({
        cityId: Number(cityId),
        channelId: Number(channelId),
        date,
        items: cart.map(({ pizzaId, quantity }) => ({ pizzaId, quantity })),
      });
      setResult(res);
      setCart([]);
      setCartOpen(false);
      loadRecent();
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  const count = cart.reduce((s, it) => s + it.quantity, 0);
  const total = cart.reduce((s, it) => s + it.price * it.quantity, 0);

  const cartProps = {
    items: cart,
    cities: catalog.cities,
    cityId,
    setCityId,
    channels: catalog.channels,
    channelId,
    setChannelId,
    date,
    setDate,
    onQty: setQty,
    onRemove: removeItem,
    onSubmit: submit,
    sending,
    error: sendError,
  };

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <PizzaArt id="logo" category="Classic" size={40} />
            <div>
              <strong>Forno Rosso</strong>
              <span>Registro de ventas</span>
            </div>
          </div>
          <span className={'status ' + (isConfigured && !loadError ? 'live' : 'off')}>
            <i /> {!isConfigured ? 'Sin configurar' : loadError ? 'Sin conexión' : 'Google Sheets'}
          </span>
        </div>
      </header>

      <section className="hero">
        <div className="wrap hero-inner">
          <div>
            <p className="eyebrow">Punto de venta</p>
            <h1>Cada pizza que vendes llega al tablero.</h1>
            <p className="lead">
              Arma el pedido, elige la sede y registra la venta. Los datos se guardan en Google Sheets y Power BI los
              toma al actualizar.
            </p>
          </div>
          <ol className="flow" aria-label="Flujo de datos">
            <li>React</li>
            <li>Apps Script</li>
            <li>Google Sheets</li>
            <li>Power BI</li>
          </ol>
        </div>
      </section>

      <main className="wrap layout">
        <section className="menu" aria-label="Menú">
          <div className="filters">
            <div className="tabs" role="tablist">
              {categories.map((c) => (
                <button
                  key={c}
                  role="tab"
                  aria-selected={c === category}
                  className={'tab' + (c === category ? ' on' : '')}
                  onClick={() => setCategory(c)}
                >
                  {c === 'Todas' ? 'Todas' : catLabel(c)}
                </button>
              ))}
            </div>
            <input
              className="search"
              type="search"
              placeholder="Buscar pizza o ingrediente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {loading && <div className="skeleton-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}</div>}
          {loadError && (
            <div className="error-box">
              <p>⚠ No se pudo cargar el menú: {loadError}</p>
              <button className="btn" onClick={loadCatalog}>Reintentar</button>
            </div>
          )}
          {!loading && !loadError && (
            <>
              <p className="muted small count">{visible.length} pizzas</p>
              <div className="grid">
                {visible.map((p) => (
                  <PizzaCard key={p.typeId} pizza={p} onAdd={addToCart} />
                ))}
              </div>
            </>
          )}
        </section>

        <div className="cart-desktop">
          <Cart {...cartProps} />
        </div>
      </main>

      <div className="wrap">
        <RecentOrders orders={recent} loading={recentLoading} error={recentError} onRefresh={loadRecent} nameOf={nameOf} />
      </div>

      <footer className="wrap footer muted small">
        Modelo: <code>Fac</code> → <code>Dim_Fecha</code>, <code>Dim_sales_channel</code>, <code>Dim_city</code> →{' '}
        <code>Dim_state</code>, <code>Dim_pizza</code> → <code>Dim_pizza_types</code>
      </footer>

      {/* Móvil: botón flotante + carrito como hoja inferior */}
      <button className="fab" onClick={() => setCartOpen(true)} aria-label="Ver pedido">
        🛒 {count} · {money(total)}
      </button>
      {cartOpen && (
        <div className="sheet-overlay" onClick={() => setCartOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <Cart {...cartProps} onClose={() => setCartOpen(false)} />
          </div>
        </div>
      )}

      {result && <SuccessModal result={result} onClose={() => setResult(null)} />}
    </>
  );
}
