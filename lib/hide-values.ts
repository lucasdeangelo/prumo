// "Esconder valores": the choice lives on this device only (localStorage) and shows up as
// data-hide-values on <html>, which CSS uses to mask every <Money> (components/app/money.tsx).
export const HIDE_VALUES_KEY = "prumo:hide-values";
export const HIDE_VALUES_ATTR = "data-hide-values";

/** Runs inline in <head>, before React, so a hidden screen never flashes its values. */
export const HIDE_VALUES_BOOT = `try{if(localStorage.getItem(${JSON.stringify(HIDE_VALUES_KEY)})==="1")document.documentElement.setAttribute(${JSON.stringify(HIDE_VALUES_ATTR)},"")}catch(e){}`;
