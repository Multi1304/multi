# Parallel Rollout Plan

This is the practical first rollout for Camel's own egress layer.

## Parallel Exit Set

Stand up these four exits in parallel:

1. `wg-exit-1`
   - group: `stable_internal`
   - geo: first real-demand geo
   - purpose: first sticky lane outside proxyless

2. `wg-exit-2`
   - group: `geo_sensitive`
   - geo: second real-demand geo
   - purpose: geo-targeted work before any commercial spill

3. `wg-exit-3`
   - group: `overflow_backup`
   - geo: same as your strongest current demand
   - purpose: failover and spare capacity

4. `wg-exit-4`
   - group: `high_separation`
   - geo: the most sensitive workload geo
   - purpose: higher-separation lane before commercial overflow

## Execution Order

1. Create the suggested self-hosted pools in Camel.
2. Prepare four hosts or VPS nodes in parallel.
3. Apply the specific env file for each node:
   - `exits/wg-exit-1.env.example`
   - `exits/wg-exit-2.env.example`
   - `exits/wg-exit-3.env.example`
   - `exits/wg-exit-4.env.example`
4. Start the containers with `docker-compose.multi-exit.yml` or one-by-one if each exit lives on a different host.
5. Register all four exits in Camel using `Register Ready Exits`.
6. Run onboarding preflight.
7. Confirm healthy metadata, sticky safety and failover.
8. Only after all that, increase concurrency.

## Gate To Start Using Commercial Less

Do not expect strong reduction in commercial dependence until:

- at least `2` healthy exits are online
- cluster/group metadata is correct
- onboarding preflight passes
- sticky routing works
- failover works

## Growth Rule

- add healthy self-hosted exits before expanding commercial pool
- add geos because Camel needs them, not because they look nice on paper
- keep `proxyless` for everything that does not need real separation
