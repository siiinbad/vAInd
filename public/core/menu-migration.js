import { isMenuExcluded, DISHES, MENU_POLICY_VERSION } from './catalog.js';
import { generatePlan } from './planner.js';

// Keep paid-for meals intact. Replace only the unlogged schedule, without another AI call.
export function migrateMenu(state) {
 let changed = false;
 const conflicts = [];
 // Older saved profiles came from the personal-only release; keep those exclusions.
 const setOptions=(settings,legacy)=>{
  for(const key of ['excludeVegetableMains','excludeMonggo'])if(settings[key]===undefined){settings[key]=legacy;changed=true;}
 };
 if(state.settings)setOptions(state.settings,state.profileVersion!==2);
 if(state.profileVersion!==2){state.profileVersion=2;changed=true;}
 for (const [month, record] of Object.entries(state.months)) {
  setOptions(record.settings,(record.plan.menuVersion??1)<2);
  const incompatible = record.plan.meals.some(meal =>
   !Object.hasOwn(record.spend, meal.key) && isMenuExcluded(DISHES.find(d => d.id === meal.dishId),record.settings)
  );
  if (!incompatible) {
   if (record.plan.menuVersion !== MENU_POLICY_VERSION) { record.plan.menuVersion = MENU_POLICY_VERSION; changed = true; }
   delete record.menuConflict;
   continue;
  }
  try {
   record.plan = { ...generatePlan(record.settings, record.prices, { spend: record.spend, locked: record.plan.meals }), migrationNote: 'menuUpdated' };
   delete record.menuConflict;
   changed = true;
  } catch (error) {
   // Retain the original snapshot for backups and spend history, but hide its menu until corrected.
   record.menuConflict = { code: error.code || 'unknownError', details: error.details || {} };
   conflicts.push(month);
  }
 }
 return { changed, conflicts };
}
