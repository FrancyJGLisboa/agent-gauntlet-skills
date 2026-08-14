import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestPrice, loadPrices } from './market.js';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rows=loadPrices(path.join(root,'data','coffee-prices.csv'));
const server=http.createServer((req,res)=>{
  if(req.url==='/api/latest') { res.setHeader('content-type','application/json'); return res.end(JSON.stringify({data:latestPrice(rows),provenance:{source:'example fixture',retrieved_at:'2026-08-14'}})); }
  res.setHeader('content-type','text/html'); res.end(`<!doctype html><title>Coffee Market Terminal</title><h1>Coffee Market Terminal</h1><p id="price">Latest: ${latestPrice(rows).price_brl_per_bag} BRL/bag</p>`);
});
if(process.argv[1]===fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT??3000));
export { server };
