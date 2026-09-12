// XIRR: la rentabilidad anualizada teniendo en cuenta CUÁNDO entró y salió
// cada euro, no solo cuánto. Un euro metido hace dos años y otro metido la
// semana pasada no han tenido el mismo tiempo para generar rentabilidad; el
// % simple (ganancia/coste) los trata como si sí, XIRR no.
//
// cashflows: [{ date: Date, amount: number }]
//   - negativo = dinero que sale de tu bolsillo (una compra)
//   - positivo = dinero que entra (una venta, o el valor actual si se
//     liquidara hoy toda la cartera)
//
// Devuelve la tasa anualizada como decimal (0.08 = 8%), o null si no
// converge a un resultado razonable (muy pocos datos, todos los flujos del
// mismo signo, etc.).
export function calcularXIRR(cashflows) {
  if (cashflows.length < 2) return null;

  const signos = new Set(cashflows.map((cf) => Math.sign(cf.amount)));
  if (signos.size < 2) return null; // hacen falta flujos de ambos signos

  const t0 = cashflows[0].date.getTime();
  const dias = (d) => (d.getTime() - t0) / (1000 * 60 * 60 * 24);

  function npv(rate) {
    return cashflows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + rate, dias(cf.date) / 365), 0);
  }
  function dnpv(rate) {
    return cashflows.reduce((sum, cf) => {
      const t = dias(cf.date) / 365;
      if (t === 0) return sum;
      return sum - (t * cf.amount) / Math.pow(1 + rate, t + 1);
    }, 0);
  }

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-10) break;
    const nuevaRate = rate - f / df;
    if (!isFinite(nuevaRate) || nuevaRate <= -0.999) return null;
    if (Math.abs(nuevaRate - rate) < 1e-7) {
      rate = nuevaRate;
      break;
    }
    rate = nuevaRate;
  }

  if (!isFinite(rate) || Math.abs(rate) > 10) return null; // resultado sin sentido
  return rate;
}
