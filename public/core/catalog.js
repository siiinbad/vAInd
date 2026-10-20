export const CATEGORIES = ['chicken', 'pork', 'beef', 'fish', 'shellfish', 'vegetables', 'others'];
export const LEVELS = ['often', 'sometimes', 'never'];
// Quantities are per person, per lunch/dinner; breakfasts use 60% portions.
const d = (id, name, category, protein, ingredients, breakfast = false) => ({ id, name, category, protein, ingredients: ingredients.map(([id, quantity]) => ({ id, quantity })), breakfast });
export const DISHES = [
 d('chicken-adobo','Chicken adobo','chicken','chicken',[['chicken',.16]]),
 d('tinola','Chicken tinola','chicken','chicken',[['chicken',.15],['sayote',.1]]),
 d('chicken-guisado','Chicken guisado','chicken','chicken',[['chicken',.15],['cabbage',.08]]),
 d('chicken-afritada','Chicken afritada','chicken','chicken',[['chicken',.15],['potato',.06],['tomato',.04]]),
 d('pork-adobo','Pork adobo','pork','pork',[['pork',.15]]),
 d('pork-sinigang','Pork sinigang','pork','pork',[['pork',.15],['kangkong',.07],['tomato',.04]]),
 d('pork-giniling','Pork giniling','pork','pork',[['pork',.14],['potato',.08]]),
 d('beef-nilaga','Beef nilaga','beef','beef',[['beef',.16],['cabbage',.08]]),
 d('bistek','Bistek Tagalog','beef','beef',[['beef',.16]]),
 d('beef-guisado','Beef guisado','beef','beef',[['beef',.15],['sayote',.1]]),
 d('paksiw','Paksiw na bangus','fish','fish',[['bangus',.18]]),
 d('pritong-isda','Pritong tilapia','fish','fish',[['tilapia',.18]],true),
 d('isda-tinola','Tinolang isda','fish','fish',[['scad',.18],['tomato',.04]]),
 d('escabeche','Fish escabeche','fish','fish',[['tilapia',.18],['tomato',.05]]),
 d('shrimp','Ginisang hipon','shellfish','shrimp',[['shrimp',.18]]),
 d('shrimp-sinigang','Sinigang na hipon','shellfish','shrimp',[['shrimp',.18],['kangkong',.08]]),
 d('tahong','Tinolang tahong','shellfish','mussels',[['mussels',.28]]),
 d('tahong-guisado','Ginisang tahong','shellfish','mussels',[['mussels',.28],['tomato',.05]]),
 d('pinakbet','Pinakbet na gulay','vegetables','vegetables',[['squash',.13],['eggplant',.12],['sitaw',.07]]),
 d('utan','Utan Bisaya','vegetables','vegetables',[['squash',.17],['kangkong',.1],['eggplant',.08]]),
 d('repolyo','Ginisang repolyo','vegetables','vegetables',[['cabbage',.3],['tomato',.06]],true),
 d('ginisang-sayote','Ginisang sayote','vegetables','vegetables',[['sayote',.3],['tomato',.05]],true),
 d('tortang-talong','Tortang talong','others','egg',[['egg',2],['eggplant',.12]],true),
 d('scrambled-eggs','Scrambled eggs','others','egg',[['egg',2]],true),
 d('egg-tomato','Itlog at kamatis','others','egg',[['egg',2],['tomato',.08]],true),
 d('tofu-adobo','Adobong tokwa','others','tofu',[['tofu',.22]]),
 d('tofu-guisado','Ginisang tokwa','others','tofu',[['tofu',.2],['cabbage',.1]],true),
 d('monggo','Ginisang monggo','others','monggo',[['monggo',.09],['kangkong',.08]]),
 d('monggo-gulay','Monggo at kalabasa','others','monggo',[['monggo',.09],['squash',.1]]),
 d('sardines','Ginisang sardinas','others','sardines',[['sardines',.6],['tomato',.06]],true),
 d('sardines-pechay','Sardinas at repolyo','others','sardines',[['sardines',.6],['cabbage',.1]])
];

// Per-household choices; new users may include vegetable mains and monggo.
export const MENU_POLICY_VERSION = 2;
export const isMenuExcluded = (dish,settings={}) => (settings.excludeVegetableMains===true&&dish.category==='vegetables')||(settings.excludeMonggo===true&&dish.protein==='monggo');

// Ready-cooked purchases use a complete ulam serving price, never the raw recipe cost.
// Retain the base recipe's ingredient IDs for Never/Avoid checks and protein identity.
for (const baseId of ['chicken-adobo','pork-adobo','bistek','paksiw','pritong-isda','scrambled-eggs','tortang-talong','tofu-adobo']) {
 const base = DISHES.find(dish => dish.id === baseId);
 DISHES.push({
  ...base, id: `ready-${base.id}`, preparation: 'ready',
  contains: base.ingredients.map(ingredient => ingredient.id),
  ingredients: [{id: `ready-${base.id}`, quantity: 1}],
 });
}
export const PREPARATION_MODES = ['mixed', 'home', 'ready'];
