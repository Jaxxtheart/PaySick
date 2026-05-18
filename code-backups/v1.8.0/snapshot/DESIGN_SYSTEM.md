# PaySick Design System

This document outlines the design system used across the PaySick platform to ensure UI/UX consistency.

## Brand Identity

### Logo

The PaySick logo consists of a medical cross SVG icon with the "PaySick" wordmark.

#### Logo SVG Code

```html
<svg class="logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <radialGradient id="crossGradient" cx="40%" cy="40%">
            <stop offset="0%" style="stop-color:#FF4757;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#E01E37;stop-opacity:1" />
        </radialGradient>
        <radialGradient id="bgCircle" cx="50%" cy="50%">
            <stop offset="0%" style="stop-color:#FF4757;stop-opacity:0.12" />
            <stop offset="100%" style="stop-color:#FF4757;stop-opacity:0.04" />
        </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#bgCircle)"/>
    <rect x="44" y="20" width="12" height="60" rx="6" fill="url(#crossGradient)"/>
    <rect x="20" y="44" width="60" height="12" rx="6" fill="url(#crossGradient)"/>
    <circle cx="50" cy="50" r="8" fill="#ffffff"/>
    <circle cx="50" cy="50" r="6" fill="#E01E37"/>
</svg>
```

**Note:** Change the gradient IDs to be unique per page to avoid conflicts (e.g., `loginCrossGradient`, `dashCrossGradient`, etc.)

#### Logo Wordmark

```html
<div class="logo-text">Pay<span>Sick</span></div>
```

CSS:
```css
.logo-text {
    font-size: 28px; /* Adjust based on context */
    font-weight: 400;
    color: #1A1A1A;
    letter-spacing: -0.5px;
}

.logo-text span {
    font-weight: 300;
    color: #4A4A4A;
}
```

### Logo Sizes

- **Landing Page Navigation**: 45px × 45px
- **Dashboard Header**: 32px × 32px
- **Login/Onboarding**: 64px × 64px
- **Mobile**: Scale down proportionally

## Color Palette

### Primary Colors

| Color Name | Hex Code | Usage |
|------------|----------|-------|
| Primary Red | `#FF4757` | Primary CTAs, gradients, accents |
| Dark Red | `#E01E37` | Gradient ends, hover states, emphasis |
| Near Black | `#1A1A1A` | Primary text, headings |
| Dark Gray | `#4A4A4A` | Secondary text, subheadings |
| Medium Gray | `#8A8A8A` | Tertiary text, placeholders |
| Light Gray | `#E5E5E5` | Borders, dividers |
| Background Gray | `#FAFAFA` | Page backgrounds, cards |
| White | `#FFFFFF` | Cards, modals, backgrounds |

### Gradient

**Primary Gradient**: `linear-gradient(135deg, #FF4757 0%, #E01E37 100%)`

Use for:
- Primary buttons
- Hero sections
- Important CTAs
- Loading states

### Status Colors

| Status | Color | Hex Code |
|--------|-------|----------|
| Success/Active | Green | `#2ED573` |
| Warning/Upcoming | Orange | `#FF9F40` |
| Info | Blue | `#3498DB` |
| Error/Overdue | Red | `#FF4757` |

#### Status Badge Colors

```css
.status-active {
    background: #E8F8F0;
    color: #2ED573;
}

.status-upcoming {
    background: #FFF4E6;
    color: #FF9F40;
}

.status-completed {
    background: #E8F0F8;
    color: #3498DB;
}

.status-overdue {
    background: #FFE5E8;
    color: #E01E37;
}
```

## Typography

### Font Family

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

This system font stack ensures:
- Native look and feel on all platforms
- Fast loading (no web fonts needed)
- Excellent readability
- Consistent rendering

### Font Sizes

| Element | Size | Weight | Usage |
|---------|------|--------|-------|
| Hero Heading | 72px | 600 | Landing page main heading |
| H1 | 32-48px | 600-700 | Page titles |
| H2 | 24-28px | 700 | Section headings |
| H3 | 20px | 600-700 | Card titles |
| Body Large | 18-24px | 400 | Hero descriptions, important text |
| Body | 15-16px | 400 | Standard body text |
| Body Small | 14px | 400-500 | Secondary text |
| Caption | 12-13px | 500-600 | Labels, meta info |

### Font Weights

- **300**: Light (used for "Sick" in logo)
- **400**: Regular (body text, headings)
- **500**: Medium (buttons, labels)
- **600**: Semi-bold (important headings)
- **700**: Bold (emphasis, navigation)

### Line Height

- **Headings**: 1.1 - 1.2
- **Body text**: 1.5 - 1.6
- **Small text**: 1.4

### Letter Spacing

- **Large headings**: -2px to -1px (tighter)
- **Logo text**: -0.5px
- **Taglines**: 2px (uppercase, spaced out)
- **Body text**: 0 (default)

## Spacing System

Use a consistent 8px grid system:

```css
/* Base unit: 8px */
--spacing-1: 8px;    /* 1 unit */
--spacing-2: 16px;   /* 2 units */
--spacing-3: 24px;   /* 3 units */
--spacing-4: 32px;   /* 4 units */
--spacing-5: 40px;   /* 5 units */
--spacing-6: 48px;   /* 6 units */
--spacing-8: 64px;   /* 8 units */
```

### Common Spacing Values

- **Card padding**: 24px
- **Section margins**: 32px
- **Button padding**: 12px-28px vertical, 16px-45px horizontal
- **Form field padding**: 14-16px
- **Gap between elements**: 12-16px
- **Gap in grids**: 24px

## Components

### Buttons

#### Primary Button

```css
.primary-btn, .btn, .cta-button {
    background: linear-gradient(135deg, #FF4757, #E01E37);
    color: white;
    padding: 18px 45px; /* Adjust based on context */
    border-radius: 30px; /* or 8px for squared buttons */
    text-decoration: none;
    font-size: 18px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.primary-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(224, 30, 55, 0.3);
}

.primary-btn:active {
    transform: translateY(0);
}
```

#### Secondary Button

```css
.secondary-btn {
    background: transparent;
    color: #E01E37;
    padding: 18px 45px;
    border: 2px solid #E01E37;
    border-radius: 30px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.secondary-btn:hover {
    background: #E01E37;
    color: white;
}
```

#### Small Button (Dashboard)

```css
.logout-btn, .back-btn {
    padding: 8px 20px;
    background: transparent;
    border: 2px solid #FF4757;
    color: #FF4757;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.logout-btn:hover {
    background: #FF4757;
    color: white;
}
```

### Forms

#### Input Fields

```css
input, select, textarea {
    width: 100%;
    padding: 14px 16px;
    border: 2px solid #E5E5E5;
    border-radius: 8px;
    font-size: 15px;
    transition: all 0.3s ease;
    font-family: inherit;
}

input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #FF4757;
    box-shadow: 0 0 0 4px rgba(255, 71, 87, 0.1);
}
```

#### Labels

```css
label {
    display: block;
    color: #1A1A1A;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 8px;
}

label .required {
    color: #FF4757;
}
```

### Cards

```css
.card, .stat-card {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}
```

### Modals/Containers

```css
.login-container, .onboarding-container {
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    width: 100%;
    max-width: 440px; /* or 700px for onboarding */
    padding: 48px;
    animation: slideUp 0.5s ease-out;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

### Navigation

```css
nav {
    position: fixed;
    top: 0;
    width: 100%;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    padding: 20px 60px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 1000;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
```

### Headers (Dashboard)

```css
.header {
    background: white;
    border-bottom: 1px solid #E5E5E5;
    padding: 16px 24px;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}
```

## Effects & Animations

### Border Radius

- **Buttons (rounded)**: 25-30px
- **Buttons (squared)**: 8px
- **Cards**: 12-16px
- **Input fields**: 8px
- **Badges**: 20px (pill-shaped)

### Shadows

```css
/* Light shadow (cards, hover states) */
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

/* Medium shadow (elevated cards) */
box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);

/* Heavy shadow (modals, overlays) */
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);

/* Button hover shadow */
box-shadow: 0 10px 30px rgba(224, 30, 55, 0.3);

/* Focus shadow */
box-shadow: 0 0 0 4px rgba(255, 71, 87, 0.1);
```

### Transitions

Standard transition:
```css
transition: all 0.3s ease;
```

Specific transitions:
```css
/* Transform */
transition: transform 0.3s ease;

/* Multiple properties */
transition: transform 0.3s ease, box-shadow 0.3s ease;

/* Color change */
transition: color 0.3s ease, background 0.3s ease;
```

### Hover Effects

```css
/* Lift effect */
.card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

/* Button lift */
.btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(255, 71, 87, 0.4);
}

/* Color change */
.link:hover {
    color: #E01E37;
}
```

## Responsive Design

### Breakpoints

```css
/* Mobile */
@media (max-width: 768px) {
    /* Mobile styles */
}

/* Tablet */
@media (max-width: 1024px) {
    /* Tablet styles */
}
```

### Mobile Adjustments

1. **Reduce font sizes**: 72px → 48px for hero, 32px → 24px for h1
2. **Adjust padding**: 48px → 32px for containers
3. **Stack layouts**: grid → single column
4. **Hide elements**: Consider hiding less important elements
5. **Hamburger menu**: Use for navigation

## Page Backgrounds

### Landing Page
```css
background: linear-gradient(135deg, #ffffff 0%, #fff5f6 100%);
```

### Login/Onboarding
```css
background: linear-gradient(135deg, #FF4757 0%, #E01E37 100%);
```

### Dashboard/Admin
```css
background: #FAFAFA;
```

## Icons

Using custom SVG icons following the "Steve Jobs & Jony Ive meets Airbnb" design philosophy:

### Icon Design Principles
- **Minimalist line art** with 2px stroke weight
- **Clean, geometric shapes** with rounded corners
- **PaySick brand colors** (#FF4757 to #E01E37) for active/hover states
- **Neutral color** (#4A4A4A) for default state
- **Smooth transitions** on hover (0.3s ease)

### Icon CSS Classes

```css
/* Stroke-based icons */
.icon-stroke {
    stroke: #4A4A4A;
    stroke-width: 2;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: stroke 0.3s ease;
}

/* Fill-based icons */
.icon-fill {
    fill: #4A4A4A;
    transition: fill 0.3s ease;
}

/* Hover states */
.menu-item:hover .icon-stroke { stroke: #FF4757; }
.menu-item:hover .icon-fill { fill: #FF4757; }
```

### Icon Library

| Icon | Name | SVG Code |
|------|------|----------|
| Home | `icon-home` | `<path d="M3 12l9-9 9 9"/><path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/>` |
| Credit Card | `icon-card` | `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>` |
| Calendar | `icon-calendar` | `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>` |
| Document | `icon-document` | `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>` |
| Bar Chart | `icon-chart` | `<rect x="4" y="4" width="4" height="16"/><rect x="10" y="8" width="4" height="12"/><rect x="16" y="12" width="4" height="8"/>` |
| Line Chart | `icon-analytics` | `<path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-6 6"/>` |
| Globe | `icon-globe` | `<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>` |
| Question | `icon-help` | `<circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 115 2.83c-.6.34-1 .97-1 1.67v1"/><circle cx="12" cy="18" r="1" fill="currentColor"/>` |
| Star | `icon-features` | `<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>` |
| Settings | `icon-settings` | `<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>` |
| Bell | `icon-notifications` | `<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>` |
| Chat | `icon-support` | `<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>` |
| Logout | `icon-logout` | `<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>` |
| Currency | `icon-currency` | `<circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h8a2 2 0 010 4H8"/>` |
| Checkmark | `icon-success` | `<circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>` |
| Users | `icon-users` | `<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="17" cy="7" r="3"/><path d="M21 21v-2a3 3 0 00-2-2.83"/>` |
| Bank | `icon-bank` | `<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 9h1M14 9h1M9 13h1M14 13h1"/>` |
| Hospital | `icon-hospital` | `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 7v10M7 12h10"/>` |
| Tools | `icon-tools` | `<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>` |
| Clock | `icon-clock` | `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>` |
| Lightning | `icon-lightning` | `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>` |
| Lock | `icon-lock` | `<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>` |
| Mobile | `icon-mobile` | `<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/>` |
| Arrow Left | `icon-back` | `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>` |
| Clipboard | `icon-clipboard` | `<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/>` |
| Hamburger Menu | `icon-menu` | `<path d="M3 12h18M3 6h18M3 18h18"/>` |
| Close | `icon-close` | `<path d="M6 6l12 12M6 18L18 6"/>` |
| Warning | `icon-warning` | `<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>` |
| Empty/Inbox | `icon-empty` | `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M8 12v4M12 12v4M16 12v4"/>` |

### Icon Sizing

| Context | Container Size | SVG Size |
|---------|---------------|----------|
| Menu items | 24px × 24px | 20px × 20px |
| Stat cards | 48px × 48px | 28px × 28px |
| Title icons | 32px × 32px | 32px × 32px |
| Empty states | 64px × 64px | 64px × 64px |

### Color Variants (Stat Cards)

```css
.stat-icon.red svg .icon-stroke { stroke: #FF4757; }
.stat-icon.green svg .icon-stroke { stroke: #2ED573; }
.stat-icon.blue svg .icon-stroke { stroke: #3498DB; }
.stat-icon.orange svg .icon-stroke { stroke: #FF9F40; }
.stat-icon.purple svg .icon-stroke { stroke: #9B59B6; }
```

### Implementation Example

```html
<span class="icon">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path class="icon-stroke" d="M3 12l9-9 9 9"/>
        <path class="icon-stroke" d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/>
    </svg>
</span>
```

## Accessibility

### Contrast Ratios

Ensure WCAG AA compliance:
- **Normal text**: 4.5:1 minimum
- **Large text**: 3:1 minimum

Current palette meets these requirements:
- `#1A1A1A` on `#FFFFFF` ✓
- `#4A4A4A` on `#FFFFFF` ✓
- `#FFFFFF` on `#FF4757` ✓

### Focus States

Always provide visible focus states:
```css
:focus {
    outline: none;
    border-color: #FF4757;
    box-shadow: 0 0 0 4px rgba(255, 71, 87, 0.1);
}
```

### Interactive Elements

- Minimum touch target: 44×44px
- Clear hover states
- Adequate spacing between clickable elements

## Implementation Checklist

When creating a new page:

- [ ] Use the system font stack
- [ ] Include the SVG logo (with unique gradient IDs)
- [ ] Use the primary gradient for CTAs
- [ ] Apply consistent spacing (8px grid)
- [ ] Use standard border-radius values
- [ ] Add hover effects to interactive elements
- [ ] Include focus states for accessibility
- [ ] Test on mobile (max-width: 768px)
- [ ] Use consistent button styles
- [ ] Apply standard shadow values
- [ ] Ensure color contrast meets WCAG AA
- [ ] Add smooth transitions (0.3s ease)

## Code Examples

### Complete Logo Implementation

```html
<div class="logo-container">
    <svg class="logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="pageCrossGradient" cx="40%" cy="40%">
                <stop offset="0%" style="stop-color:#FF4757;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#E01E37;stop-opacity:1" />
            </radialGradient>
            <radialGradient id="pageBgCircle" cx="50%" cy="50%">
                <stop offset="0%" style="stop-color:#FF4757;stop-opacity:0.12" />
                <stop offset="100%" style="stop-color:#FF4757;stop-opacity:0.04" />
            </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="40" fill="url(#pageBgCircle)"/>
        <rect x="44" y="20" width="12" height="60" rx="6" fill="url(#pageCrossGradient)"/>
        <rect x="20" y="44" width="60" height="12" rx="6" fill="url(#pageCrossGradient)"/>
        <circle cx="50" cy="50" r="8" fill="#ffffff"/>
        <circle cx="50" cy="50" r="6" fill="#E01E37"/>
    </svg>
    <div class="logo-text">Pay<span>Sick</span></div>
</div>
```

Replace `page` in the gradient IDs with your page name (e.g., `login`, `dashboard`, `nav`).

---

**Last Updated**: 2026-01-16
**Version**: 1.0
**Maintained by**: PaySick Design Team
