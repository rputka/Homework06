/* Shared registries, kept in a module with no imports so it is always ready before any page module loads.
   A: click handlers for [data-act]; F: submit handlers for form[data-form]; onInput: live filter handlers keyed by a
   form's data-filters; onChange: handlers keyed by an input's id. ui: page state that outlives a render. */
export const A = {}, F = {}, onInput = {}, onChange = {};
export const ui = { showTodos: false, dashTab: 'all', workerTab: 'action' };

/* City names for the type-to-suggest city box, set by pages that show one. */
let cityList = [];
export const setCities = list => { cityList = list || []; };
export const getCities = () => cityList;
