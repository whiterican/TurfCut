# Exact existing token sheet + proposed design-only adjustments
Source: `src/app/globals.css` master SHA fec571252d, `src/app/layout.tsx`. **These are implementation tokens observed in existing code.** No CSS has changed in production.

| Purpose | Light | Dark | Sunlight |
|---|---|---|---|
| Page `--bg` | `#efeae1` | `#120d18` | `#ffffff` |
| Card `--surface` | `#fbf7f0` | `#23182f` | `#ffffff` |
| Raised `--surface-2` | `#e9e3d8` | `#30223f` | `#eeeeee` |
| Foreground `--fg` | `#1b1422` | `#f6f1e6` | `#000000` |
| Muted `--muted` | `#4a4254` | `#cbbdd8` | `#1b1422` |
| Border `--border` | `#e3dcd0` | `#3c2d4c` | `#4a4254` |
| Primary action `--primary` | `#164b38` | `#164b38` | `#000000` |
| Main hero `--hero` | `#281539` | `#4a3365` | `#000000` |
| Cut `--cut` | `#82bc9b` | `#82bc9b` | `#164b38` |
| Selected dock tile `--tab-active-bg` | `#281539` | `#4a3365` | `#000000` |

**Actual roles:** `--radius-card:0.875rem` (14px); `--radius-inner:0.75rem` (12px); `--radius-control:0.625rem` (10px). Existing card shadow is subtle, no shadow in Sunlight. Use 4/8/12/16/24/32px basic spacing scale with explicit exceptions. Body type current Barlow, condensed labels Barlow Condensed, selective mono DM Mono.

**Proposed layout-only delta:** float dock max-width 348px instead of existing 370px, 48px hit height minimum, 16–18px icon, readable 9–11px label as validated; remains a rounded slab, not a full-width phone chrome. Preserve reduced motion, in-chat keyboard hiding, safe area and ≥44px accessible targets. If readability fails at 320px, do NOT silently delete Feed or Shifts.

**A/B font decision pending:** Do NOT declare fonts changed. Proposal A: Public Sans operational UI + Newsreader selective editorial hero + DM Mono utility. Proposal B: keep Barlow, reduce condensed overuse. Test with actual webfonts and all screen fixtures. Synthetic screenshots use Cabin and EB Garamond as disclosed surrogates, not pixel-matched final typography.
