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

PaySick uses a custom SVG icon system that aligns with the brand design ethos. All icons feature the PaySick brand gradient (#FF4757 to #E01E37) for consistency.

### Icon System Overview

**Design Principles:**
- All icons use SVG format for scalability
- Linear gradients with brand colors for visual appeal
- Menu/navigation icons use `currentColor` for theme adaptation
- Standard size: 40px within 80px containers
- Stroke width: 1.5-2.5px for clarity
- Rounded line caps and joins for modern aesthetic

### Feature Icons (with Gradient)

These icons appear in feature grids, stat cards, and promotional content. They use the PaySick brand gradient.

#### Lightning Bolt (Speed/Instant)
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="lightningGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FF4757;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#E01E37;stop-opacity:1" />
        </linearGradient>
    </defs>
    <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" fill="url(#lightningGradient)" stroke="url(#lightningGradient)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
**Use for:** Instant approval, fast processing, quick actions

#### Calendar (Dates/Scheduling)
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="calendarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FF4757;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#E01E37;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="url(#calendarGradient)" stroke-width="2" fill="none"/>
    <line x1="16" y1="2" x2="16" y2="6" stroke="url(#calendarGradient)" stroke-width="2" stroke-linecap="round"/>
    <line x1="8" y1="2" x2="8" y2="6" stroke="url(#calendarGradient)" stroke-width="2" stroke-linecap="round"/>
    <line x1="3" y1="10" x2="21" y2="10" stroke="url(#calendarGradient)" stroke-width="2"/>
</svg>
```
**Use for:** Upcoming payments, payment schedules, dates

#### Shield (Security/Protection)
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FF4757;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#E01E37;stop-opacity:1" />
        </linearGradient>
    </defs>
    <path d="M12 2L4 5v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V5l-8-3z" stroke="url(#shieldGradient)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
**Use for:** Security, POPIA compliance, data protection

#### Network Nodes (Connectivity)
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="networkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FF4757;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#E01E37;stop-opacity:1" />
        </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="3" stroke="url(#networkGradient)" stroke-width="2" fill="none"/>
    <circle cx="6" cy="6" r="2" stroke="url(#networkGradient)" stroke-width="2" fill="none"/>
    <circle cx="18" cy="6" r="2" stroke="url(#networkGradient)" stroke-width="2" fill="none"/>
    <circle cx="6" cy="18" r="2" stroke="url(#networkGradient)" stroke-width="2" fill="none"/>
    <circle cx="18" cy="18" r="2" stroke="url(#networkGradient)" stroke-width="2" fill="none"/>
    <line x1="9" y1="12" x2="7.5" y2="7.5" stroke="url(#networkGradient)" stroke-width="1.5"/>
    <line x1="15" y1="12" x2="16.5" y2="7.5" stroke="url(#networkGradient)" stroke-width="1.5"/>
    <line x1="9" y1="12" x2="7.5" y2="16.5" stroke="url(#networkGradient)" stroke-width="1.5"/>
    <line x1="15" y1="12" x2="16.5" y2="16.5" stroke="url(#networkGradient)" stroke-width="1.5"/>
</svg>
```
**Use for:** Provider network, connectivity, partnerships

#### Mobile Phone (Mobile Access)
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="mobileGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FF4757;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#E01E37;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect x="6" y="2" width="12" height="20" rx="2" stroke="url(#mobileGradient)" stroke-width="2" fill="none"/>
    <line x1="12" y1="18" x2="12" y2="18.5" stroke="url(#mobileGradient)" stroke-width="2.5" stroke-linecap="round"/>
</svg>
```
**Use for:** Mobile app, mobile access, on-the-go features

#### Headset (Support/Communication)
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="headsetGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FF4757;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#E01E37;stop-opacity:1" />
        </linearGradient>
    </defs>
    <path d="M3 13a9 9 0 0 1 18 0" stroke="url(#headsetGradient)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M3 13v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" stroke="url(#headsetGradient)" stroke-width="2" fill="none"/>
    <path d="M21 13v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2z" stroke="url(#headsetGradient)" stroke-width="2" fill="none"/>
</svg>
```
**Use for:** Customer support, help, contact

#### Checkmark Circle (Success/Completed)
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
    <polyline points="8 12 11 15 16 9" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
**Use for:** Paid status, success states, completed actions

### Navigation Icons (with currentColor)

These icons use `currentColor` to adapt to the current text color, making them perfect for menus and navigation that may have different color schemes.

#### Home
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

#### Credit Card
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
    <line x1="2" y1="10" x2="22" y2="10" stroke="currentColor" stroke-width="2"/>
</svg>
```

#### Document/File
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

#### Chart/Analytics
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="12" y1="20" x2="12" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="18" y1="20" x2="18" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="6" y1="20" x2="6" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
```

#### Settings/Gear
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/>
    <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
```

#### Bell (Notifications)
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

#### Message/Chat
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

#### Logout/Door
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="16 17 21 12 16 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

#### Hamburger Menu
```html
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
```

### Icon Usage Guidelines

**DO:**
- Use gradient icons for features, marketing content, and highlights
- Use `currentColor` icons for navigation and UI elements
- Keep gradient IDs unique per page (e.g., `lightningGradient`, `dashLightningGradient`)
- Maintain consistent stroke widths (1.5-2.5px)
- Use rounded line caps and joins
- Size icons appropriately for context (24px-48px typical)

**DON'T:**
- Mix emoji icons with SVG icons
- Reuse gradient IDs across different SVG elements on the same page
- Use overly complex icons that don't scale well
- Use bitmap icons (PNG, JPG) for UI elements

### Icon CSS Styling

```css
/* Feature icons with gradient */
.feature-icon svg {
    width: 40px;
    height: 40px;
}

.feature-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(255, 71, 87, 0.1), rgba(224, 30, 55, 0.1));
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
}

/* Navigation icons */
.menu-item .icon svg {
    width: 24px;
    height: 24px;
    margin-right: 12px;
}

/* Stat card icons */
.stat-icon svg {
    width: 20px;
    height: 20px;
}
```

### Icon Color Reference

| Icon Type | Color Method | Use Case |
|-----------|--------------|----------|
| Feature Icons | Brand gradient (#FF4757 → #E01E37) | Landing page, features, highlights |
| Navigation Icons | `currentColor` | Menus, dashboards, toolbars |
| Status Icons | Theme color (green/orange/red) | Success, warning, error states |
| Stat Icons | `currentColor` | Dashboard statistics, metrics |

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
