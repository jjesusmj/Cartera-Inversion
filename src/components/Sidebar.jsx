import React, { useState } from 'react';
import { OWNERS } from '../lib/owners';

const ITEMS = [
  { id: 'cartera', label: 'Cartera' },
  { id: 'tamano', label: 'Tamaño Posición & Gestión Cartera', corto: 'Posición' },
  { id: 'watchlist', label: 'Seguimiento' },
  { id: 'resumen', label: 'Resumen' },
  { id: 'valoracion', label: 'Valoración' },
  { id: 'renta', label: 'Declaración' },
];

// Grupo «Mercado»: el mercado en general, no tu cartera
const MERCADO = [{ id: 'mercado', label: 'Mapa' }, { id: 'miedo', label: 'Miedo y codicia' }];

// Grupo «Búsqueda de ideas»
const IDEAS = [{ id: 'radar', label: 'Radar técnico' }, { id: 'ideas', label: 'Ideas' }];

// Grupo «Dinero inteligente»
const DINERO = [{ id: 'insiders', label: 'Insiders' }];

// Grupo «Empresa»: lo que se consulta de un valor concreto
const EMPRESA = [{ id: 'ficha', label: 'Ficha de valor', corto: 'Ficha' }];

// En el móvil la barra de abajo solo tiene sitio para 4 pantallas y «Más»
const MOVIL_FIJOS = ['cartera', 'resumen', 'watchlist', 'ficha'];
const TODOS = [...ITEMS, ...MERCADO, ...IDEAS, ...DINERO, ...EMPRESA];
const MOVIL_BARRA = MOVIL_FIJOS.map((id) => TODOS.find((x) => x.id === id));
const MOVIL_MAS = TODOS.filter((x) => !MOVIL_FIJOS.includes(x.id));

function BotonNav({ item, view, setView }) {
  return (
    <button className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
      {item.corto ? (
        <>
          <span className="nav-largo">{item.label}</span>
          <span className="nav-corto">{item.corto}</span>
        </>
      ) : (
        item.label
      )}
    </button>
  );
}

function BarraMovil({ view, setView }) {
  const [abierto, setAbierto] = useState(false);
  const enMas = MOVIL_MAS.some((x) => x.id === view);
  const ir = (id) => {
    setAbierto(false);
    setView(id);
  };
  return (
    <>
      {abierto && <div className="nav-mas-fondo" onClick={() => setAbierto(false)} />}
      {abierto && (
        <div className="nav-mas-panel" role="menu">
          {MOVIL_MAS.map((item) => (
            <button key={item.id} role="menuitem" className={view === item.id ? 'active' : ''} onClick={() => ir(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
      <nav className="nav-movil">
        {MOVIL_BARRA.map((item) => (
          <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => ir(item.id)}>
            {item.corto || item.label}
          </button>
        ))}
        <button className={enMas || abierto ? 'active' : ''} aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
          Más
        </button>
      </nav>
    </>
  );
}

export default function Sidebar({ view, setView, owner, setOwner }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        Cartera
        <small>seguimiento personal</small>
      </div>

      <div className="field" style={{ marginBottom: 4 }}>
        <label>Cartera de</label>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          {OWNERS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      <nav className="nav">
        <div className="nav-grupo nav-grupo-primero">Mi cartera</div>
        {ITEMS.map((item) => (
          <BotonNav key={item.id} item={item} view={view} setView={setView} />
        ))}
        <div className="nav-grupo">Mercado</div>
        {MERCADO.map((item) => (
          <BotonNav key={item.id} item={item} view={view} setView={setView} />
        ))}
        <div className="nav-grupo">Búsqueda de ideas</div>
        {IDEAS.map((item) => (
          <BotonNav key={item.id} item={item} view={view} setView={setView} />
        ))}
        <div className="nav-grupo">Dinero inteligente</div>
        {DINERO.map((item) => (
          <BotonNav key={item.id} item={item} view={view} setView={setView} />
        ))}
        <div className="nav-grupo">Empresa</div>
        {EMPRESA.map((item) => (
          <BotonNav key={item.id} item={item} view={view} setView={setView} />
        ))}
      </nav>
      <BarraMovil view={view} setView={setView} />
    </aside>
  );
}
