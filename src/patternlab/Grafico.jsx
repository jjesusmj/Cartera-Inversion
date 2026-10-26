import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, PriceScaleMode, LineStyle } from 'lightweight-charts';
import { desfaseZona, precio as fmtPrecio } from './formato';

const COLORES = {
  sube: '#22884d',
  baja: '#c22b2b',
  texto: '#666666',
  rejilla: '#efefef',
  borde: '#e2e2e2',
  ema20: '#a8703d',
  ema50: '#3b6ea5',
  ema200: '#7a5aa6',
  figura: '#1a1a1a',
  soporte: '#22884d',
  resistencia: '#c22b2b',
  stop: '#c22b2b',
  objetivo: '#22884d',
  entrada: '#1a1a1a',
};

function colorDir(dir) {
  return dir === 'alcista' ? COLORES.sube : dir === 'bajista' ? COLORES.baja : '#8a8a8a';
}

// Gráfico de velas con medias, niveles, plan y el trazado de la detección elegida
export default function Grafico({
  velas,
  ind,
  offset = 0,
  zona = null,
  interval,
  numVelas = 160,
  escalaLog = false,
  mostrarMedias = true,
  mostrarNiveles = true,
  zonas = [],
  plan = null,
  detecciones = [],
  seleccion = null,
  onElegir,
  alto = null,
}) {
  const cajaRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const extrasRef = useRef({ lineas: [], precios: [] });
  const onElegirRef = useRef(onElegir);
  onElegirRef.current = onElegir;
  const detsRef = useRef(detecciones);
  detsRef.current = detecciones;
  const desplazaRef = useRef((t) => t);

  // Hora local de la bolsa; +6 h en velas de día o más por el cambio de hora (ver formato.js)
  const desplaza = offset + (interval === '1h' ? 0 : 6 * 3600);
  const local = (t) => (interval === '1h' ? t + desfaseZona(t, zona, offset) : t + desplaza);
  const tiempo = (i) => local(velas[i].t);
  desplazaRef.current = local;

  // Crear el gráfico una vez
  useEffect(() => {
    const chart = createChart(cajaRef.current, {
      autoSize: true,
      layout: { background: { color: '#ffffff' }, textColor: COLORES.texto, fontFamily: 'IBM Plex Sans, system-ui, sans-serif', fontSize: 11 },
      grid: { vertLines: { color: COLORES.rejilla }, horzLines: { color: COLORES.rejilla } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: COLORES.borde },
      timeScale: { borderColor: COLORES.borde, rightOffset: 4 },
      handleScale: { axisPressedMouseMove: true },
      localization: { locale: 'es-ES', priceFormatter: fmtPrecio },
    });
    const velasS = chart.addCandlestickSeries({
      upColor: COLORES.sube, downColor: COLORES.baja, borderUpColor: COLORES.sube, borderDownColor: COLORES.baja,
      wickUpColor: COLORES.sube, wickDownColor: COLORES.baja,
    });
    const linea = (color) => chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    seriesRef.current = { velas: velasS, ema20: linea(COLORES.ema20), ema50: linea(COLORES.ema50), ema200: linea(COLORES.ema200) };
    chartRef.current = chart;

    // Tocar un marcador elige esa detección
    chart.subscribeClick((param) => {
      if (!param.time || !onElegirRef.current) return;
      const t = param.time;
      const d = [...detsRef.current].reverse().find((x) => desplazaRef.current(x.t) === t);
      if (d) onElegirRef.current(d.id);
    });
    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Datos de velas y medias
  useEffect(() => {
    const s = seriesRef.current;
    if (!s.velas || !velas?.length) return;
    s.velas.setData(velas.map((v) => ({ time: local(v.t), open: v.o, high: v.h, low: v.l, close: v.c })));
    const serie = (arr) => (mostrarMedias ? arr.map((x, i) => (x == null ? null : { time: local(velas[i].t), value: x })).filter(Boolean) : []);
    s.ema20.setData(serie(ind.ema20));
    s.ema50.setData(serie(ind.ema50));
    s.ema200.setData(serie(ind.ema200));
    chartRef.current.applyOptions({ timeScale: { timeVisible: interval === '1h', secondsVisible: false } });
  }, [velas, ind, offset, zona, interval, mostrarMedias]);

  // Ventana visible
  useEffect(() => {
    if (!chartRef.current || !velas?.length) return;
    const n = velas.length;
    chartRef.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - numVelas), to: n + 3 });
  }, [velas, numVelas]);

  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({ mode: escalaLog ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
  }, [escalaLog]);

  // Marcadores, trazado de la figura, niveles y plan
  useEffect(() => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!chart || !s.velas || !velas?.length) return;
    extrasRef.current.lineas.forEach((l) => chart.removeSeries(l));
    extrasRef.current.precios.forEach((p) => s.velas.removePriceLine(p));
    extrasRef.current = { lineas: [], precios: [] };

    const marcadores = [];
    for (const d of detecciones) {
      if (seleccion && d.id === seleccion.id) continue;
      marcadores.push({
        time: tiempo(d.i),
        position: d.direccion === 'bajista' ? 'aboveBar' : 'belowBar',
        color: colorDir(d.direccion),
        shape: 'circle',
        size: 0.6,
      });
    }
    if (seleccion) {
      for (const p of seleccion.puntos) {
        if (p.i < 0 || p.i >= velas.length) continue;
        const v = velas[p.i];
        const arriba = Math.abs(p.p - v.h) <= Math.abs(p.p - v.l);
        marcadores.push({
          time: tiempo(p.i),
          position: arriba ? 'aboveBar' : 'belowBar',
          color: colorDir(seleccion.direccion),
          shape: p.i === seleccion.i ? (seleccion.direccion === 'bajista' ? 'arrowDown' : 'arrowUp') : 'circle',
          text: p.etiqueta || '',
        });
      }
      for (const seg of seleccion.lineas) {
        const [a, b] = seg;
        if (a.i === b.i || a.i < 0 || b.i >= velas.length) continue;
        const [p1, p2] = a.i < b.i ? [a, b] : [b, a];
        const l = chart.addLineSeries({ color: COLORES.figura, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        l.setData([{ time: tiempo(p1.i), value: p1.p }, { time: tiempo(p2.i), value: p2.p }]);
        extrasRef.current.lineas.push(l);
      }
      if (seleccion.objetivo != null) {
        extrasRef.current.precios.push(s.velas.createPriceLine({ price: seleccion.objetivo, color: colorDir(seleccion.direccion), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Objetivo figura' }));
      }
    }
    marcadores.sort((x, y) => x.time - y.time);
    s.velas.setMarkers(marcadores);

    if (mostrarNiveles) {
      for (const z of zonas) {
        extrasRef.current.precios.push(s.velas.createPriceLine({
          price: z.precio,
          color: z.tipo === 'soporte' ? COLORES.soporte : COLORES.resistencia,
          lineWidth: z.fuerza >= 4 ? 2 : 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: '',
        }));
      }
      if (plan) {
        extrasRef.current.precios.push(s.velas.createPriceLine({ price: plan.stop, color: COLORES.stop, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'Stop' }));
        plan.objetivos.forEach((o, k) => {
          extrasRef.current.precios.push(s.velas.createPriceLine({ price: o.precio, color: COLORES.objetivo, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `O${k + 1}` }));
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [velas, detecciones, seleccion, zonas, plan, mostrarNiveles, offset, zona, interval]);

  return <div ref={cajaRef} className="pl-grafico-lienzo" style={alto ? { height: alto } : undefined} />;
}
