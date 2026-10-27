# Kehr by PaySick — Brand Identity

Kehr is the identity of PaySick's healthcare payment harness: the
conversational front door where a patient describes the care they need and
arranges, pays, changes or recovers a payment plan. It replaces the name
"Care Agent" (v1.20.0).

Kehr is a **sub-brand endorsed by PaySick**. It uses the PaySick corporate
identity in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md): the same palette, type,
spacing and components. It adds a mark, a wordmark and a voice of its own.
Where this guide is silent, the PaySick design system applies.

---

## Name

- **Kehr** (one syllable, said like "care").
- From the German *kehren*, "to turn" (*Umkehr*, a turnaround). Kehr turns a
  medical bill into a plan you can pay.
- Always written **Kehr**: capital K, no article ("Ask Kehr", never "the
  Kehr"), and never all caps in running text.
- First mention on any surface is **Kehr by PaySick**. After that, **Kehr**
  is enough.
- Kehr is never called an agent, an assistant, a bot or an AI in
  patient-facing copy. The privacy policy still discloses the AI processing,
  because the law requires it.
- Internal code names stay as they were (`care-agent.*`, `/api/care-agent`).
  Patients never see them.

## Mark

The PaySick mark is a rounded medical cross in a soft red halo, with a white
and red centre dot. The Kehr mark keeps that halo, the same rounded 12-unit
bars and the same centre dot, but **turns the cross's arms 45°** so the bars
form a K. It is the PaySick cross, turned: *kehren*.

```html
<svg class="kehr-mark" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
        <radialGradient id="kehrArm" cx="40%" cy="40%">
            <stop offset="0%" stop-color="#FF4757"/>
            <stop offset="100%" stop-color="#E01E37"/>
        </radialGradient>
        <radialGradient id="kehrHalo" cx="50%" cy="50%">
            <stop offset="0%" stop-color="#FF4757" stop-opacity="0.12"/>
            <stop offset="100%" stop-color="#FF4757" stop-opacity="0.04"/>
        </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#kehrHalo)"/>
    <rect x="31" y="20" width="12" height="60" rx="6" fill="url(#kehrArm)"/>
    <rect x="37" y="44" width="36" height="12" rx="6" fill="url(#kehrArm)" transform="rotate(-45 37 50)"/>
    <rect x="37" y="44" width="36" height="12" rx="6" fill="url(#kehrArm)" transform="rotate(45 37 50)"/>
    <circle cx="37" cy="50" r="8" fill="#ffffff"/>
    <circle cx="37" cy="50" r="6" fill="#E01E37"/>
</svg>
```

As with the PaySick mark, give the gradient IDs a unique prefix on each page
(for example `kehrHeaderArm`), so two marks on one page don't clash.

| Use | Size |
|-----|------|
| Page header | 36px |
| Sign-in / onboarding | 64px |
| App icon, favicon | Mark only, 32px and up |
| Minimum | 24px |

**Clear space**: at least the centre dot's diameter (16 units) on every
side.

## Wordmark and lockups

The wordmark follows the PaySick wordmark's style: weight **400**, colour
Near Black, letter-spacing **-0.5px**. The endorsement uses weight **300**
in Dark Gray, just as "Sick" does in the PaySick wordmark.

```html
<a class="kehr-lockup" href="kehr.html" aria-label="Kehr by PaySick">
    <!-- kehr-mark svg -->
    <span class="kehr-type">
        <span class="kehr-wordmark">Kehr</span>
        <span class="kehr-endorse">by PaySick</span>
    </span>
</a>
```

| Lockup | When |
|--------|------|
| **Primary**: mark, then wordmark with "by PaySick" stacked underneath | Page headers, the first appearance on a surface |
| **Inline**: "Kehr by PaySick" as text | Homepage hint, emails, legal text |
| **Mark only** | Icons, avatars, small spaces after Kehr is already named |

## Colour

Kehr uses the PaySick CI palette as it is. Its one addition is **Kehr
Wine**, a deep tone for text on Kehr Blush and for emphasis that must not
read as an error.

| Token | Hex | Source | Use |
|-------|-----|--------|-----|
| `--kehr-red` | `#E01E37` | PaySick Dark Red | Mark core, links, emphasis |
| `--kehr-red-bright` | `#FF4757` | PaySick Primary Red | Gradient start, mark highlight |
| `--kehr-gradient` | `135deg, #FF4757 to #E01E37` | PaySick Primary Gradient | Primary buttons, the patient's chat bubbles |
| `--kehr-ink` | `#1A1A1A` | PaySick Near Black | Text, wordmark |
| `--kehr-slate` | `#4A4A4A` | PaySick Dark Gray | Secondary text, "by PaySick" |
| `--kehr-mist` | `#8A8A8A` | PaySick Medium Gray | Placeholders, captions |
| `--kehr-line` | `#E5E5E5` | PaySick Light Gray | Borders, dividers |
| `--kehr-paper` | `#FAFAFA` | PaySick Background Gray | Page background |
| `--kehr-blush` | `#FFF5F6` | PaySick tint already in use | Notices, held-question card |
| `--kehr-wine` | `#7A1426` | **Kehr only** | Text on blush, quiet emphasis |

Status colours (success, warning, overdue) are PaySick's, unchanged.

## Typography

PaySick's system font stack, with no web fonts:

```css
--kehr-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

The type scale and weights are PaySick's. Kehr's own rule: amounts are
always written `R1,200.00` (comma thousands, two decimals), whatever the
browser's locale.

## Voice

Kehr is quiet. It states facts and outcomes, asks one thing at a time, and
never describes its own work.

| Do | Don't |
|----|-------|
| "Your next payment of R1,200.00 is due on 14 November." | "Let me check your account..." |
| "Please check the details below." | "I've prepared this for you." |
| "Payment received: R1,200.00." | "Done! The system has processed your payment." |
| "Request received. We'll let you know once it's done." | "Our team will review your request within 24 hours." |
| "That payment is not due." | "My rules say I can't do that." |

- Plain and warm, usually one to three sentences.
- Payment-plan language, never credit language (no loan, interest, debt).
- No emojis, no markdown, no em dashes.
- The patient sees outcomes. Decisions, rules and reviews stay in the
  backend (v1.19.0).

## Usage rules

- Don't recolour, rotate, stretch or outline the mark, or change the angle
  of its arms.
- Don't put the mark on red or on photography; use Paper or White.
- Don't drop "by PaySick" the first time Kehr appears on a surface.
- Don't show "Kehr" and "PaySick" as two equal logos side by side. Kehr is
  endorsed by PaySick, not partnered with it.
- Don't use the old name "Care Agent" anywhere a patient can see. The one
  exception is the privacy policy's "formerly called" note.
- Don't call Kehr an agent, an assistant or a bot in copy.
