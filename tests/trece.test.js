import test from 'node:test';
import assert from 'node:assert/strict';
import { leerInfoTabla, agrupar, unidades, cartera, comparar, trimestres, resumen } from '../src/lib/trece.js';

const linea = (o) => `<infoTable><nameOfIssuer>${o.n}</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>${o.c}</cusip><value>${o.v}</value>
  <shrsOrPrnAmt><sshPrnamt>${o.s}</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>${o.p ? `<putCall>${o.p}</putCall>` : ''}</infoTable>`;

test('leer la tabla XML, con y sin prefijo de espacio de nombres', () => {
  const xml = `<informationTable>${linea({ n: 'APPLE INC', c: '037833100', v: 1000, s: 10 })}${linea({ n: 'AT&amp;T INC', c: '00206r102', v: 50, s: 5, p: 'Put' })}</informationTable>`;
  const l = leerInfoTabla(xml);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { emisor: 'APPLE INC', clase: 'COM', cusip: '037833100', valor: 1000, acciones: 10, tipo: 'SH', opcion: null });
  assert.equal(l[1].emisor, 'AT&T INC');
  assert.equal(l[1].cusip, '00206R102');
  assert.equal(l[1].opcion, 'put');
  // Harris Associates envuelve los nombres en CDATA
  assert.equal(leerInfoTabla('<infoTable><nameOfIssuer><![CDATA[SALESFORCE INC]]></nameOfIssuer><cusip>1</cusip><value>1</value><sshPrnamt>1</sshPrnamt></infoTable>')[0].emisor, 'SALESFORCE INC');
  const conPrefijo = '<ns1:informationTable><ns1:infoTable><ns1:nameOfIssuer>X</ns1:nameOfIssuer><ns1:cusip>1</ns1:cusip><ns1:value>7</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>2</ns1:sshPrnamt></ns1:shrsOrPrnAmt></ns1:infoTable></ns1:informationTable>';
  assert.deepEqual(leerInfoTabla(conPrefijo).map((x) => [x.emisor, x.valor, x.acciones]), [['X', 7, 2]]);
});

test('agrupar: suma el mismo CUSIP y quita PUT y CALL', () => {
  const l = leerInfoTabla([
    linea({ n: 'ALLY', c: 'A', v: 100, s: 10 }),
    linea({ n: 'ALLY', c: 'A', v: 50, s: 5 }),
    linea({ n: 'ALLY', c: 'A', v: 999, s: 99, p: 'Call' }),
    linea({ n: 'BBB', c: 'B', v: 20, s: 1 }),
  ].join(''));
  assert.deepEqual(agrupar(l).map((p) => [p.cusip, p.valor, p.acciones]), [['A', 150, 15], ['B', 20, 1]]);
});

test('unidades: miles antes de 2023, dólares después y corrección si el gestor sigue en miles', () => {
  const pos = [{ valor: 1000, acciones: 10 }];
  assert.deepEqual(unidades('2022-11-14', pos), { factor: 1000, corregido: false });
  assert.deepEqual(unidades('2023-02-14', pos), { factor: 1, corregido: false });
  assert.deepEqual(unidades('2026-11-13', [{ valor: 3, acciones: 100 }]), { factor: 1000, corregido: true });
  // Una posición cara (BRK.A en miles) no esconde que el resto está en miles
  assert.deepEqual(unidades('2026-11-10', [{ valor: 22410, acciones: 30 }, { valor: 48560, acciones: 97600 }, { valor: 22059, acciones: 40000 }]), { factor: 1000, corregido: true });
});

test('cartera: valor en dólares, peso y precio declarado, de mayor a menor', () => {
  const c = cartera([{ cusip: 'A', valor: 1, acciones: 4 }, { cusip: 'B', valor: 3, acciones: 2 }], 1000);
  assert.deepEqual(c.map((p) => [p.cusip, p.valor, p.peso, p.precio]), [['B', 3000, 0.75, 1500], ['A', 1000, 0.25, 250]]);
  assert.deepEqual(resumen(c), { valor: 4000, posiciones: 2, top: [{ emisor: undefined, peso: 0.75 }, { emisor: undefined, peso: 0.25 }] });
});

test('comparar trimestres: nueva, aumento, reducción y venta total; sin cambios no aparece', () => {
  const antes = [{ cusip: 'A', acciones: 10, valor: 1 }, { cusip: 'B', acciones: 10, valor: 1 }, { cusip: 'C', acciones: 10, valor: 1 }, { cusip: 'D', acciones: 10, valor: 1 }];
  const ahora = [{ cusip: 'A', acciones: 15, valor: 2 }, { cusip: 'B', acciones: 5, valor: 1 }, { cusip: 'C', acciones: 10, valor: 1 }, { cusip: 'E', acciones: 3, valor: 9 }];
  const r = comparar(ahora, antes);
  assert.deepEqual(r.map((x) => [x.cusip, x.tipo, x.accionesAntes, x.acciones, x.cambio]), [
    ['E', 'nueva', 0, 3, null],
    ['A', 'aumento', 10, 15, 0.5],
    ['B', 'reduccion', 10, 5, -0.5],
    ['D', 'venta', 10, 0, -1],
  ]);
});

test('trimestres: solo 13F-HR, uno por trimestre, cuenta las enmiendas', () => {
  const recent = {
    form: ['13F-HR', '13F-HR/A', '4', '13F-HR', '13F-HR'],
    accessionNumber: ['a', 'b', 'c', 'd', 'e'],
    filingDate: ['2026-11-14', '2026-11-20', '2026-10-01', '2026-08-14', '2026-08-01'],
    reportDate: ['2026-09-30', '2026-09-30', '', '2026-06-30', '2026-06-30'],
  };
  const t = trimestres(recent);
  assert.equal(t.enmiendas, 1);
  assert.deepEqual(t.trimestres.map((x) => x.acceso), ['a', 'd']);
});
