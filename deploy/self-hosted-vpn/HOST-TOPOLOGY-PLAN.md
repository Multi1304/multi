# Host Topology Plan

This is Camel's recommended first topology for your own egress layer.

## Parallel Host Set

### 1. `wg-exit-1`
- group: `stable_internal`
- geo: primary real-demand geo
- minimum host: `1 vCPU / 2 GB RAM / 20 GB disk`
- target: `4-8` profiles

### 2. `wg-exit-2`
- group: `geo_sensitive`
- geo: second real-demand geo
- minimum host: `1 vCPU / 1 GB RAM / 20 GB disk`
- target: `3-6` profiles

### 3. `wg-exit-3`
- group: `overflow_backup`
- geo: same as strongest current demand
- minimum host: `1 vCPU / 1 GB RAM / 20 GB disk`
- target: `2-5` profiles

### 4. `wg-exit-4`
- group: `high_separation`
- geo: most sensitive demand geo
- minimum host: `2 vCPU / 1 GB RAM / 20 GB disk`
- target: `2-4` profiles

## Parallel Build Order

1. `wg-exit-1` and `wg-exit-2` first
2. `wg-exit-3` next for failover headroom
3. `wg-exit-4` last before allowing stronger separation traffic to avoid paid spill

## Practical Rule

One host or VPS per exit is better than stacking all exits onto one failure domain.
