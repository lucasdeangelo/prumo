// "Esconder valores": every visit starts with the values hidden. Showing them lasts for this tab
// only (sessionStorage), so a new tab or a reopened browser comes back masked. It shows up as
// data-hide-values on <html>, which CSS uses to mask every <Money> (components/app/money.tsx).
export const SHOW_VALUES_KEY = "prumo:show-values";
export const HIDE_VALUES_ATTR = "data-hide-values";
/** Before every visit started hidden, the choice was kept for good here; it is cleared on boot. */
const LEGACY_KEY = "prumo:hide-values";

/** Runs inline in <head>, before React, so the screen never flashes its values. */
export const HIDE_VALUES_BOOT = `(function(){var d=document.documentElement;try{localStorage.removeItem(${JSON.stringify(LEGACY_KEY)});if(sessionStorage.getItem(${JSON.stringify(SHOW_VALUES_KEY)})==="1")return}catch(e){}d.setAttribute(${JSON.stringify(HIDE_VALUES_ATTR)},"")})()`;
