/**
 * Debug-gated console helpers.
 *
 * All output is suppressed unless the page is loaded with `?debug=true`.
 * Import `dlog`, `dwarn`, `dinfo`, `dtable` as drop-in replacements for
 * `console.log`, `.warn`, `.info`, `.table`.
 */

export const IS_DEBUG: boolean = (() => {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug") === "true";
  } catch {
    return false;
  }
})();

const noop = () => {};

export const dlog: typeof console.log = IS_DEBUG
  ? console.log.bind(console)
  : noop;

export const dwarn: typeof console.warn = IS_DEBUG
  ? console.warn.bind(console)
  : noop;

export const dinfo: typeof console.info = IS_DEBUG
  ? console.info.bind(console)
  : noop;

export const dtable: typeof console.table = IS_DEBUG
  ? console.table.bind(console)
  : noop;
