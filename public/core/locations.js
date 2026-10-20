export const DEFAULT_LOCATION = Object.freeze({province:'Cebu',city:'Cebu City'});
const textValid = (value,empty=false) => typeof value==='string'&&value.trim().length<=80&&!/[\u0000-\u001f\u007f]/.test(value)&&((empty&&!value.trim())||/\p{L}/u.test(value));
export function validLocation(value,{provinceOnly=false}={}) {
 return !!value&&typeof value==='object'&&textValid(value.province)&&textValid(value.city,provinceOnly);
}
export function normalizeLocation(value=DEFAULT_LOCATION) {
 if(!validLocation(value,{provinceOnly:true}))throw new Error('invalidLocation');
 return {province:value.province.trim(),city:value.city.trim()};
}
function token(value){return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bcity of\b|\bcity\b|\bprovince of\b|\bprovince\b/g,'').replace(/[^a-z0-9]/g,'');}
export function provinceKey(location){const key=token(normalizeLocation(location).province);return ['ncr','nationalcapitalregion','metromanila'].includes(key)?'metromanila':key;}
export function locationKey(location){const normalized=normalizeLocation(location);return `${provinceKey(normalized)}:${token(normalized.city)}`;}
export const sameLocation=(a,b)=>locationKey(a)===locationKey(b);
export const locationLabel=location=>{const value=normalizeLocation(location);return [value.city,value.province].filter(Boolean).join(', ');};
// Legacy Cebu imports remain supported. Other markets must supply explicit city/province metadata.
export function inferReportLocation(row){
 if(row.location&&validLocation(row.location,{provinceOnly:true}))return normalizeLocation(row.location);
 if(row.province&&typeof row.province==='string'){
  const result=normalizeLocation({province:row.province,city:row.city||''}),key=provinceKey(result),market=row.market||'';
  if((/\bNCR\b|metro manila|national capital region/i.test(market)&&key!=='metromanila')||(/cebu|mandaue|lapu[ -]lapu/i.test(market)&&key!=='cebu'))throw new Error('Market and province metadata disagree');
  const knownCity=/mandaue/i.test(market)?'Mandaue City':/lapu[ -]lapu/i.test(market)?'Lapu-Lapu City':/cebu city|carbon market/i.test(market)?'Cebu City':null;
  if(knownCity&&result.city&&!sameLocation(result,{province:'Cebu',city:knownCity}))throw new Error('Market and city metadata disagree');
  return result;
 }
 const market=row.market||'';
 if(/mandaue/i.test(market))return {province:'Cebu',city:'Mandaue City'};
 if(/lapu[ -]lapu/i.test(market))return {province:'Cebu',city:'Lapu-Lapu City'};
 if(/cebu/i.test(market))return {province:'Cebu',city:/cebu city|carbon/i.test(market)?'Cebu City':''};
 if(/\bNCR\b|metro manila|national capital region/i.test(market))return {province:'Metro Manila',city:row.city||''};
 throw new Error('A price observation needs an explicit province / metro area and city');
}
