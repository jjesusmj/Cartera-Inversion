import { useState, useMemo } from 'react';

// Uso: const { sortKey, sortDir, toggleSort, sortedRows } = useSort(filas, 'symbol');
// En cada <th>: <th onClick={() => toggleSort('campo')}>Título{flecha('campo')}</th>
export function useSort(rows, initialKey, initialDir = 'asc') {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState(initialDir);

  function toggleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp;
      if (typeof va === 'string') cmp = va.localeCompare(vb);
      else cmp = va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function arrow(key) {
    if (key !== sortKey) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return { sortKey, sortDir, toggleSort, sortedRows, arrow };
}
