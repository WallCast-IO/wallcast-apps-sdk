# Now serving (SDK demo)

A small demo of real-time messages: `POST /api/v1/apps/now-serving/messages` with
`{"data":{"ticket":"A042","counter":3}}` shows the ticket on every screen running the app
(`wallcast.on('message')`), and `scripts/call-next.mjs` does it from a terminal.

It is not a queue system: numbering, staff pages, kiosks and voice calls are in
**WallCast Queue** (Apps → Queue in the dashboard), which external systems drive with the
same API keys (`queues:read`, `queues:write`).
