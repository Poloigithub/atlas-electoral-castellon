import { useEffect, useState } from "react";

// Estado sincronizado con los query params del hash (#tab=mapa&el=mun-202305),
// para que cualquier vista sea un enlace compartible.

function readParams() {
  return new URLSearchParams(window.location.hash.slice(1));
}

export function getParam(key) {
  return readParams().get(key);
}

function writeParam(key, value, def) {
  const p = readParams();
  if (value == null || value === "" || String(value) === String(def)) p.delete(key);
  else p.set(key, value);
  const h = p.toString();
  history.replaceState(null, "", h ? `#${h}` : window.location.pathname + window.location.search);
}

// Como useState, pero el valor inicial sale del hash y cada cambio lo escribe
// (replaceState: no ensucia el historial). El valor por defecto no se escribe.
export function useHashParam(key, def) {
  const [value, setValue] = useState(() => getParam(key) ?? def);
  useEffect(() => {
    const onHash = () => setValue(getParam(key) ?? def);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [key, def]);
  const update = (v) => {
    setValue(v);
    writeParam(key, v, def);
  };
  return [value, update];
}
