## Learned User Preferences

- Prefer upstreamable work as small changesets on separate `feat/` branches (not `pr/` naming).
- Before opening ping-pub PRs, check already-open upstream PRs to avoid duplicates; supplement an existing open PR when file overlap makes sense, and bundle tiny CSS-only or tightly related fixes into a sibling changeset rather than solo micro-PRs.
- Upstream include: CSS/theme/style normalization, UI polish, and added functionality on existing shared pages.
- Upstream exclude: xion→verona renames/translations and related code (unless API customize for Verona), connect modifications, and tx/delegate/redelegate (and similar) modal modifications.
- A path under `verona/` does not mean Verona-branded or exclude-from-upstream; judge by content. Brand-palette hexes may still need tokenization for upstream.
- Missing or unconfigured coin logos should fall back to `public/unknown.png`, not the Verona logo; keep the Verona logo only for actual Verona branding.
- Prefer shared components over duplicated UI (e.g. one uptime component across staking, uptime, and consensus views).
- After merging a feature branch into another, delete the merged remote/origin branch.

## Learned Workspace Facts

- This repo is a Verona/Xion fork of ping-pub explorer; upstream contributions target `ping-pub/explorer`.
- `src/**/verona/**` is the fork’s customization layer and can still hold backportable UX; do not skip solely because of the directory name.
- Hide-zero-delegations style fixes may already be open upstream—verify open PRs before recreating that changeset.
- Validators page should restore the upstream staking metrics bar (APR/inflation/bonding/unbonding/slashing).
- Nav should label staking as “Validators” via i18n and deactivate separate uptime/consensus menu entries in the menu builder (not by editing every chain config).
