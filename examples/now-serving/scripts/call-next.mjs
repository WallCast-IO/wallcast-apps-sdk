// Calls the next ticket on every screen running "Now serving":
//   WALLCAST_API_KEY=wc_live_… node scripts/call-next.mjs A043 3
// The key needs the apps:messages permission. A queue system would do the same from its server.
const [ticket = 'A001', counter = '1'] = process.argv.slice(2);
const api = (process.env.WALLCAST_API_URL || 'https://api.wallcast.io').replace(/\/+$/, '');
const headers = { authorization: `Bearer ${process.env.WALLCAST_API_KEY}`, 'content-type': 'application/json' };
const call = { ticket, counter: Number(counter), at: new Date().toISOString() };

const previous = await fetch(`${api}/api/v1/apps/now-serving/storage/queue`, { headers }).then((r) => r.json()).catch(() => null);
const history = [previous?.value?.current, ...(previous?.value?.history || [])].filter(Boolean).slice(0, 8);
// Saved for screens that start later, then pushed to the ones showing it now.
await fetch(`${api}/api/v1/apps/now-serving/storage/queue`, { method: 'PUT', headers, body: JSON.stringify({ value: { current: call, history } }) });
const response = await fetch(`${api}/api/v1/apps/now-serving/messages`, { method: 'POST', headers, body: JSON.stringify({ data: call }) });
console.log(response.status, await response.text());
