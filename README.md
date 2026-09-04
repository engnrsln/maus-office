# Maus Office

OpenMausBot agents as a small company floor: desks, roles, live status, per-agent send/stop, and approval cards.

This is a companion UI. It is not the official OpenMausBot app.

## What you get

| File | Role |
| --- | --- |
| `index.html` | Animated office (TR/EN). Demo works without OpenMaus. |
| `bridge.mjs` | Loopback proxy to the OpenMaus harness |
| `TEAM.md` | Importable team (Ada, Kenan, Mira, Rıza, Leyla, Deniz) |

Roles: Chief of Staff, Research, Engineering, Risk, Operations, Communications. Extra bots sit at the flex desk.

## Run

Needs Node.js. OpenMausBot is optional for demo.

```bash
git clone https://github.com/engnrsln/maus-office.git
cd maus-office
node bridge.mjs
```

Open http://127.0.0.1:8765

- File-open `index.html` → demo only
- Bridge on `:8765` → **Live OpenMaus** if the harness is on `8799` / `18799` / `28799`

## Live controls

Each desk (and the roster) has **Send** and **Stop** for that agent only.

| Action | Harness |
| --- | --- |
| Send | `POST /api/bots/:id/messages` |
| Stop | `POST /api/bots/:id/interrupt` |
| Allow / Deny / Always | `POST /api/bots/:id/respond` |
| Status | `GET /api/bots?messages=30` and `/api/instances` |

Pending option cards appear in the approval strip.

## Import the team

1. Start OpenMausBot
2. Teams → Import → `TEAM.md`
3. Channel: **Office Floor**
4. Keep this UI in another window

Fallback if the harness is down: `~/.openmausbot/bots.json` (no `config.json` keys).

## Safety

- Binds `127.0.0.1` only
- Does not hold wallets or API keys
- Does not auto-approve
- **Always** writes a standing grant in OpenMaus when you click it

## License

MIT
