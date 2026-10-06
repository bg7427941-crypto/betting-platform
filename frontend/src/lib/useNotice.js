import { useEffect, useState } from 'react';

/**
 * Mensaje de confirmación que se borra solo (para "Apuesta colocada",
 * "Depósito realizado", etc.). Devuelve [mensaje, setMensaje].
 */
export function useNotice(ms = 5000) {
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), ms);
    return () => clearTimeout(t);
  }, [notice, ms]);

  return [notice, setNotice];
}
