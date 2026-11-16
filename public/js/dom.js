// Tiny DOM builder. All user-provided text goes through text nodes, never HTML.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && key !== 'list' && key !== 'form') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...clean(children));
  return el;
}

const clean = (children) => children.flat(Infinity).filter((child) => child != null && child !== false && child !== 0);

/** Replaces an element's content; like `h`, accepts nested arrays and skips falsy children. */
export function fill(el, ...children) {
  el.replaceChildren(...clean(children));
}

export const $ = (id) => document.getElementById(id);

export const SEAT_COLORS = ['#e9b44c', '#5fb4e8', '#e8705f', '#7bd389', '#c58be8', '#f29bc0', '#6fd6c9', '#d4d46a'];
