---
name: Luminous Violet Workspace
colors:
  surface: '#fbf8ff'
  surface-dim: '#d5d8f6'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2ff'
  surface-container: '#ececff'
  surface-container-high: '#e5e6ff'
  surface-container-highest: '#dee1ff'
  on-surface: '#161a30'
  on-surface-variant: '#464652'
  inverse-surface: '#2b2f46'
  inverse-on-surface: '#f0efff'
  outline: '#777684'
  outline-variant: '#c7c5d4'
  surface-tint: '#4e52ba'
  primary: '#4246ad'
  on-primary: '#ffffff'
  primary-container: '#5b5fc7'
  on-primary-container: '#eceaff'
  inverse-primary: '#c0c1ff'
  secondary: '#006591'
  on-secondary: '#ffffff'
  secondary-container: '#39b8fd'
  on-secondary-container: '#004666'
  tertiary: '#a10060'
  on-tertiary: '#ffffff'
  tertiary-container: '#c4257a'
  on-tertiary-container: '#ffe5ec'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#05006d'
  on-primary-fixed-variant: '#3639a1'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#ffd9e4'
  tertiary-fixed-dim: '#ffb0cd'
  on-tertiary-fixed: '#3e0022'
  on-tertiary-fixed-variant: '#8c0053'
  background: '#fbf8ff'
  on-background: '#161a30'
  surface-variant: '#dee1ff'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system channels an airy, modern, productivity-focused aesthetic that merges clean desktop-first utility with soft ambient luminosity. Crafted for event planners, project coordinators, and creative operators, the interface evokes calm focus, executive polish, and effortless clarity.

Drawing inspiration from contemporary soft-layering and luminous minimalism:
- **Atmospheric Glow:** A gentle ambient radial background gradient (warm pink-peach blending smoothly into cool lavender and rich violet) frames a crisp, high-contrast matte white inner workspace.
- **Card-Centric Modularity:** Clean, floating containers with generous interior breathing room cleanly partition complex workflows into digestible, actionable widgets.
- **Playful Precision:** Crisp neutral typography is paired with soft pastel indicators (cyan, mint, coral, periwinkle) to categorize statuses without visual fatigue or alarmist urgency.

## Colors

The color system utilizes a balanced mix of crisp neutrals, a saturated periwinkle brand anchor, and gentle tinted pastels for categorizing tasks, timelines, and cards:

- **Primary (`#5B5FC7` / Indigo Periwinkle):** Used for primary call-to-actions, active navigation highlights, progress bars, and high-priority action links.
- **Secondary (`#0EA5E9` / Soft Sky):** Applied to active tags, data charts, and auxiliary links.
- **Tertiary (`#EC4899` / Soft Rose):** Reserved for festive alerts, timeline milestones, and premium upgrade cues.
- **Neutral Core:** High-clarity slate tones (`#1E2238` for primary headlines, `#64748B` for secondary subtitles and labels, `#94A3B8` for input icons and inactive links).
- **Backgrounds & Ambient Glow:**
  - Screen Canvas: Radial blend from soft rose-tinted blush (`#FED7E2` / `#FBCFE8`) through lavender (`#DDD6FE`) to deep luminous violet (`#8B5CF6`).
  - App Canvas Surface: Pristine milky white (`#FFFFFF`) to soft porcelain (`#F8FAFC`).
  - Card & Pill Tints: Pastel accents including Ice Mint (`#E6FFFA`), Sky Blue (`#E0F2FE`), Soft Coral (`#FFE4E6`), and Lilac Mist (`#F3E8FF`).

## Typography

The typography leverages **Plus Jakarta Sans** across all levels to balance clean legibility with approachable, sculpted geometric shapes. 

- **Headlines:** Set in 600 or 700 weights with slight negative letter tracking for a tight, editorial headline presence.
- **Section Headers:** Feature paired interactive utility controls ("See All" text links rendered in `body-sm` weight 600 in `#5B5FC7`).
- **Body & Subtitles:** Muted slate colors (`#64748B`) are applied to descriptive copy to maintain contrast while preserving clear hierarchy beneath primary dark navy titles (`#1E2238`).
- **Numbers & Metrics:** Use tabular alignment where counts appear inside badges and cards.

## Layout & Spacing

The layout is built around a floating app shell nested inside a luminous full-viewport canvas:

- **Outer App Wrapper:** Floats centered on the ambient gradient background with an outer margin of `2rem` (reducing to `1rem` on tablet and `0.5rem` on mobile).
- **Sidebar & Main Content Grid:**
  - Sidebar: Fixed width (240px desktop), containing global navigation and a prominent sticky card promotion.
  - Main Body: Fluid grid composed of 12 flexible columns with a default gutter of `1.25rem` (20px).
- **Widget Flow:**
  - 3-column split for analytical and task cards (`span-4` desktop, reflowing to `span-6` tablet, `span-12` mobile).
  - Multi-card horizontal rows for upcoming event status overviews and template grids.
- **Internal Component Spacing:**
  - Cards apply an internal padding of `space-lg` (24px) for dashboard widgets and `space-md` (16px) for nested micro-cards.

## Elevation & Depth

Visual hierarchy is maintained through soft multi-layered diffusion rather than sharp structural lines:

- **Canvas Shell Elevation:** The main application container floats above the ambient gradient with a wide-radius ambient drop shadow:
  - `0 24px 60px -12px rgba(60, 20, 120, 0.18)`
- **Floating Dashboard Cards:** Clean white surfaces (`#FFFFFF`) with ultra-fine border overlays (`1px solid rgba(226, 232, 240, 0.6)`) paired with a lightweight ambient lift:
  - `0 8px 24px -4px rgba(91, 95, 199, 0.06), 0 2px 6px -1px rgba(15, 23, 42, 0.03)`
- **Interactive Hover State:** Cards elevate subtly on hover (`translate-y(-2px)`) with expanded shadow spread:
  - `0 14px 28px -6px rgba(91, 95, 199, 0.12)`
- **Pastel Sub-Cards & Badges:** Flat, tint-filled containers (`#F0FDF4`, `#EFF6FF`, `#FDF2F8`) set flush within parent white cards to maintain a soft, tactile depth.

## Shapes

The interface embraces organic, generous curvature that feels inviting and ergonomic:

- **Application Outer Shell:** High-radius continuous curvature (`28px` to `32px`) grounding the floating viewport.
- **Cards & Primary Panels:** Styled with `rounded-2xl` (`16px`), ensuring containers feel soft and friendly.
- **Pills, Badges & Mini-Cards:** Utilize `rounded-xl` (`12px`) for nested sub-cards, and full circular radii (`rounded-full` / `9999px`) for metric chips, status dots, and pill tags.
- **Buttons & Search Inputs:** Uniform `rounded-xl` (`10px` to `12px`) for inputs, creating consistent touch points throughout the navigation and headers.

## Components

### Buttons
- **Primary Action Button:** Solid `#5B5FC7` background with crisp `#FFFFFF` text, subtle drop shadow (`0 4px 12px rgba(91, 95, 199, 0.28)`), and `rounded-xl` border radius. Includes leading icon support (e.g., `+ New Event`).
- **Ghost & Text Buttons:** Transparent background with `#5B5FC7` typography and soft hover tint (`rgba(91, 95, 199, 0.08)`), used for "See All" and "+ Add Task".
- **Light Auxiliary Buttons:** White container with slate text (`#1E2238`) and smooth outline, seen in the "Upgrade Now" callout.

### Input Fields & Search
- **Header Search Bar:** Pill-style input (`rounded-full` or `rounded-xl`), `#F8FAFC` background, hairline border (`#E2E8F0`), with a leading magnifying glass in `#94A3B8`. Subtle ring highlight in `#5B5FC7` on focus.

### Cards & Event Panels
- **Event Highlights:** Features soft background pastels (e.g., cyan-tinted `#E0F2FE` or rose-tinted `#FCE7F3`), avatar facepiles overlapping on the top-left, countdown pill badge on the top-right, followed by title and an accent-colored horizontal progress tracker bar.
- **Template Tiles:** White cards featuring a top row with an industry tag chip (e.g., "Guest Management") alongside a corner arrow icon button in a soft lavender circular/square container.

### Chips, Pills & Indicators
- **Category Chips:** Light tinted pill containers with medium-weight text in matching saturated hues.
- **Task Circles:** Unchecked circular outlines in `#CBD5E1` transitioning to solid `#5B5FC7` with a white checkmark on completion.
- **Alert Items:** Leading circular status icons (green check, red alert) followed by dark title text and an inline blue context link.

### Navigation List Items
- **Sidebar Links:** Neutral `#64748B` text and outline icons with `space-sm` vertical spacing. Active state rendered with soft lavender background tint (`#EEF2FF`), solid `#5B5FC7` text, and bold icon fill.