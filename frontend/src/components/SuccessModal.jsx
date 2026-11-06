import { useEffect } from 'react';
import { money } from '../format.js';

export default function SuccessModal({ result, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ok-title" onClick={(e) => e.stopPropagation()}>
        <div className="ok-badge">✓</div>
        <h2 id="ok-title">¡Venta registrada!</h2>
        <p className="muted">
          Se agregaron las filas a la hoja Fac del Google Sheets. Actualiza Power BI para verla en el tablero.
        </p>

        <div className="receipt">
          <div><span>Pedido</span><strong>#{result.orderId}</strong></div>
          <div><span>Ciudad</span><strong>{result.city}</strong></div>
          <div><span>Canal</span><strong>{result.channel}</strong></div>
          <div><span>Fecha</span><strong>{result.date} · {result.time}</strong></div>
          <div><span>Total</span><strong>{money(result.total)}</strong></div>
        </div>

        <h3 className="keys-title">Llaves que se guardaron en la tabla de hechos</h3>
        <table className="keys">
          <tbody>
            <tr>
              <td><code>order_id</code></td>
              <td>{result.orderId}</td>
              <td className="muted small">siguiente consecutivo</td>
            </tr>
            <tr>
              <td><code>sk_city_id</code></td>
              <td>{result.skCity}</td>
              <td className="muted small">SK de Dim_city ({result.city})</td>
            </tr>
            <tr>
              <td><code>sk_sales_channel_id</code></td>
              <td>{result.skChannel}</td>
              <td className="muted small">SK de Dim_sales_channel ({result.channel})</td>
            </tr>
            <tr>
              <td><code>sk_date</code></td>
              <td>{result.skDate}</td>
              <td className="muted small">
                {result.skDateIsNew ? 'SK NUEVA creada en Dim_Fecha' : 'SK existente en Dim_Fecha'}
              </td>
            </tr>
            <tr>
              <td><code>time</code></td>
              <td>{result.time}</td>
              <td className="muted small">hora del registro (Bogotá)</td>
            </tr>
            <tr>
              <td><code>filas en Fac</code></td>
              <td>{result.rows}</td>
              <td className="muted small">una por cada pizza distinta</td>
            </tr>
          </tbody>
        </table>

        <button className="btn primary block" onClick={onClose} autoFocus>
          Registrar otra venta
        </button>
      </div>
    </div>
  );
}
