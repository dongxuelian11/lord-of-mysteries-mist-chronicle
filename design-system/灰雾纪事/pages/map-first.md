# Map First Page Overrides

> **PROJECT:** 灰雾纪事
> **Generated:** 2026-08-01 23:15:26
> **Page Type:** General

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 800px (narrow, focused)
- **Layout:** Single column, centered
- **Sections:** 1. Hero, 2. Step 1 (problem), 3. Step 2 (solution), 4. Step 3 (action), 5. CTA progression

### Spacing Overrides

- **Content Density:** Low — focus on clarity

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Step colors: 1 (Red/Problem), 2 (Orange/Process), 3 (Green/Solution). CTA: Brand color

### Component Overrides

- Avoid: Large blocking CSS files
- Avoid: Desktop-first causing mobile issues
- Avoid: Red/green only for error/success

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Voice recognition UI, gesture detection, AI predictions (smooth reveal), progressive disclosure, smart suggestions
- Performance: Inline critical CSS defer non-critical
- Responsive: Start with mobile styles then add breakpoints
- Accessibility: Use icons/text in addition to color
- CTA Placement: Each step: mini-CTA. Final: main CTA
