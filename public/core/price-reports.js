import { inferReportLocation } from './locations.js';
export const trustedReportHost = hostname => hostname === 'cebudailynews.inquirer.net' || hostname === 'da.gov.ph' || hostname.endsWith('.da.gov.ph') || hostname === 'www.gmanetwork.com';
const cebuDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const plain = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();

export function parseCSV(text) {
 const rows = []; let row = [], cell = '', quoted = false;
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (c === '"') {
   if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
   else if (!cell || quoted) quoted = !quoted;
   else throw new Error('Invalid CSV quote');
  } else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
  else if ((c === '\n' || c === '\r') && !quoted) {
   if (c === '\r' && text[i + 1] === '\n') i++;
   row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
  } else cell += c;
 }
 if (quoted) throw new Error('Unclosed CSV field');
 if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
 const headers = rows.shift(); if (!headers) return [];
 return rows.map(r => Object.fromEntries(headers.map((h, i) => [h.replace(/^\uFEFF/, ''), r[i] || ''])));
}
function validDate(date) {
 return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date && date <= cebuDate();
}
export function normalizeRows(rows, existing) {
 return rows.map(r => {
  const old = existing.find(p => p.id === r.id); if (!old) throw new Error(`Unknown ingredient ID: ${r.id}`);
  const url = new URL(r.sourceUrl);
  const location=inferReportLocation(r);
  if (!Number.isFinite(Number(r.price)) || Number(r.price) <= 0 || Number(r.price) > 100000 || url.protocol !== 'https:' || url.username || url.password || !trustedReportHost(url.hostname) || !r.market || !validDate(r.date) || r.unit !== old.unit || !r.source) throw new Error(`Missing trusted market provenance or matching unit for ${r.id}`);
  return { ...old, price: Number(r.price), date: r.date, source: r.source, sourceUrl: url.href, status: 'reported', location, market:r.market };
 });
}
export function parseCdn(text, url, existing) {
 const clean = plain(text);
 const marker = clean.match(/today,\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
 if (!marker || !clean.includes('Mandaue City Public Market')) return [];
 const timestamp = new Date(`${marker[1]} 12:00:00 GMT+0800`); if (!Number.isFinite(+timestamp)) return [];
 const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp);
 const patterns = [
  ['pork', /Pork lean meat\s+(?:is|costs?)\s*(?:P|₱|PHP)\s*(\d+(?:\.\d+)?)/i],
  ['bangus', /Milkfish\s+(?:is|costs?)\s*(?:P|₱|PHP)\s*(\d+(?:\.\d+)?)/i],
  ['scad', /local round scad\s+(?:is|costs?)\s*(?:P|₱|PHP)\s*(\d+(?:\.\d+)?)/i],
 ];
 return normalizeRows(patterns.flatMap(([id, re]) => {
  const m = clean.match(re);
  return m ? [{ id, price: m[1], unit: 'kg', date, source: 'CDN · Presyo Merkado, Mandaue', sourceUrl: url, market: 'Mandaue City, Cebu' }] : [];
 }), existing);
}
export function discoverReports(html, base, type) {
 const links = [];
 for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
  try {
   const url = new URL(match[1].replaceAll('&amp;', '&'), base);
   if (url.protocol !== 'https:' || url.username || url.password || !trustedReportHost(url.hostname)) continue;
   if (type === 'cdn' && url.hostname === 'cebudailynews.inquirer.net' && /\/\d+\/presyo-merkado[^/]*\/?$/.test(url.pathname)) links.push(url.href);
   if (type === 'da' && /\.(pdf|csv)$/i.test(url.pathname)) links.push(url.href);
  } catch { /* Ignore malformed links, not the whole source. */ }
 }
 return [...new Set(links)];
}
// Structured feeds must explicitly identify the market, unit and observation date on each row.
// A national or NCR price can never become a Cebu observation just because it was found on DA.
export function parseFeed(text, source, existing) {
 const aliases = { commodity: 'id', product: 'id', item: 'id', market: 'market', location: 'market', date: 'date', asof: 'date', observationdate: 'date', price: 'price', retailprice: 'price', prevailingprice: 'price', unit: 'unit', source: 'source', sourceurl: 'sourceUrl', id: 'id', province:'province', metroarea:'province', city:'city', municipality:'city' };
 const rows = parseCSV(text).map(row => {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) { const field = aliases[key.toLowerCase().replace(/[^a-z]/g, '')]; if (field) mapped[field] = value; }
  const item = existing.find(p => p.id === mapped.id?.toLowerCase() || p.name.toLowerCase() === mapped.id?.toLowerCase());
  return { ...mapped, id: item?.id || mapped.id, source: mapped.source || source.name, sourceUrl: mapped.sourceUrl || source.url };
 }).filter(row=>row.market&&(row.province||/cebu|mandaue|lapu[ -]lapu|\bNCR\b|metro manila|national capital region/i.test(row.market)));
 return normalizeRows(rows, existing);
}
