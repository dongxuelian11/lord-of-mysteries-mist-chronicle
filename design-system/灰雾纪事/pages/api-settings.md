# Api Settings Page Overrides

> **PROJECT:** 灰雾纪事
> **Generated:** 2026-08-02 12:22:03
> **Page Type:** Settings / Profile

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1400px or full-width
- **Grid:** 12-column grid for data flexibility
- **Sections:** 1. Hero, 2. Step 1 (problem), 3. Step 2 (solution), 4. Step 3 (action), 5. CTA progression

### Spacing Overrides

- **Content Density:** High — optimize for information display

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Step colors: 1 (Red/Problem), 2 (Orange/Process), 3 (Green/Solution). CTA: Brand color

### Component Overrides

- Avoid: No feedback after submit
- Avoid: No feedback during loading

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Real-time chart animations, alert pulse/glow, status indicator blink animation, smooth data stream updates, loading effect
- Forms: Show loading then success/error state
- Feedback: Show spinner/skeleton for operations > 300ms
- CTA Placement: Each step: mini-CTA. Final: main CTA
