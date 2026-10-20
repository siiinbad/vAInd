import { calendar, validateSettings, validatePrices, validatePlan } from './planner.js';
import { validLocation } from './locations.js';
import { validatePriceBook } from './regional-prices.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function validateState(candidate) {
 if (candidate?.version !== 1 || !object(candidate.months) || !object(candidate.overrides) || !object(candidate.pantry) || Object.keys(candidate.months).length > 240) throw new Error('invalidBackup');
 if (candidate.lastMonth) calendar(candidate.lastMonth);
 if (candidate.settings) validateSettings(candidate.settings, {allowLegacyBudget:true});
 if (candidate.priceFile) validatePrices(candidate.priceFile);
 if (candidate.priceData) validatePriceBook(candidate.priceData);
 for (const [month,r] of Object.entries(candidate.months)) {
  if (month !== r?.settings?.month || !object(r.spend)) throw new Error('invalidBackup');
  validatePlan(r.plan,r.settings,r.prices,r.spend,{allowOverBudget:true,legacyMenu:true,allowLegacyBudget:true});
 }
 if (candidate.locationOverrides !== undefined && !object(candidate.locationOverrides)) throw new Error('invalidBackup');
 for (const group of [candidate.overrides,...Object.values(candidate.locationOverrides || {})]) {
  if (!object(group)) throw new Error('invalidBackup');
  for (const [id,p] of Object.entries(group)) {
   if (!/^[a-z-]+$/.test(id) || !p || !Number.isFinite(p.price) || p.price <= 0 || p.price > 100000 || p.status !== 'override' || typeof p.source !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date)) || new Date(p.date).toISOString().slice(0,10) !== p.date || p.sourceUrl !== null || (p.location && !validLocation(p.location))) throw new Error('invalidBackup');
  }
 }
 for (const [id,q] of Object.entries(candidate.pantry)) if (!/^[a-z-]+$/.test(id) || !Number.isFinite(q) || q < 0 || q > 100000) throw new Error('invalidBackup');
 return candidate;
}
