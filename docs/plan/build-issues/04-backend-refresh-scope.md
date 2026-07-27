# Backend: grant the refresh scope to paid Financy orgs

Status: ready-for-human (HITL — security-sensitive grant change)

## Parent

PRD: `../PRD.md` (financy CLI v1) — the single backend prerequisite.

## What to build

service-chat's initiated-refresh route (`POST /chat/connections/refresh`) is already M2M-ready in its handler, but its API Gateway authorizer requires the `create:ai-chat-message` scope — which Financy org M2M client-grants don't carry (they hold only the six base read scopes plus payment scopes on paid plans). Extend the dashboard's plan-entitlement grant-sync so paid (starter/pro) Financy orgs' client-grants include the scope the refresh route requires — either `create:ai-chat-message` or a new dedicated scope agreed with service-chat (decide during review; a dedicated scope avoids opening the whole chat surface to M2M keys). Free orgs must not receive it. Existing paid orgs need the grant applied on their next plan sync or via the established idempotent sync path — no one-off backfill scripts.

## Acceptance criteria

- [ ] A starter/pro org's M2M token can call `POST /chat/connections/refresh` (verified in staging)
- [ ] A free org's M2M token is rejected at the authorizer (403)
- [ ] Scope choice reviewed: confirm `create:ai-chat-message` vs a dedicated refresh scope, and that the chosen scope doesn't unintentionally open other chat routes to M2M tokens
- [ ] Grant application is idempotent and covers existing paid orgs through the normal entitlement-sync path

## Blocked by

None — can start immediately (independent of the CLI repo).
