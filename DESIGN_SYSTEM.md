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

Using emoji icons for simplicity:
- 🏠 Dashboard/Home
- 💳 Payment Plans
- 📅 Upcoming Payments
- 📄 Statements
- 📊 Payment History/Analytics
- 🌐 Main Site
- ❓ How It Works
- ✨ Features
- ⚙️ Account Settings
- 🔔 Notifications
- 💬 Support
- 🚪 Logout
- 💰 Total Balance
- ✓ Paid/Success

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
