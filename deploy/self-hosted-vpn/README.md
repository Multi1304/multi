# Self-Hosted VPN Bootstrap

This pack is Camel's practical starting point for reducing dependence on commercial egress.

## Target Shape

- Start with `2-4` healthy exits before expecting useful separation.
- Group exits by use case, not just by count:
  - `stable_internal`
  - `geo_sensitive`
  - `overflow_backup`
  - `high_separation`
- Keep `proxyless` for builder, sandbox, QA, warmup and low-separation work.
- Use commercial pool only for geo gaps, overflow and high-separation work that your own exits cannot cover yet.

## Recommended Flow

1. Create the suggested self-hosted VPN pools from Camel.
2. Stand up the first WireGuard exits using `docker-compose.multi-exit.yml` and the concrete env files under `exits/`.
3. Register the ready exits back into Camel from `Network Settings -> Self-Hosted VPN Bootstrap Pack`.
4. Run health checks and verify metadata coverage.
5. Let Camel assign proxyless, self-hosted and commercial lanes automatically.

## Ready-To-Use Artifacts

- `docker-compose.multi-exit.yml`
- `exits/bootstrap.inventory.json`
- `exits/wg-exit-1.env.example`
- `exits/wg-exit-2.env.example`
- `exits/wg-exit-3.env.example`
- `exits/wg-exit-4.env.example`

Use those as the first concrete parallel rollout instead of inventing names and lanes by hand.

## Metadata Discipline

Each registered exit should include:

- `country`
- `city` when available
- `group`
- `cluster`
- `provider=SELF_HOSTED_WIREGUARD`
- `endpointType=VPN`

## Growth Rule

Grow healthy self-hosted exits first.
Only expand commercial pool after:

- sticky routing is stable
- health checks are clean
- failover is working
- the egress dependency report still shows real commercial pressure
