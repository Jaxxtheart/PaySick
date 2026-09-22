/**
 * Unit Test — homepage search-bar hint text must actually render small
 *
 * Written per CLAUDE.md's Bug Fixing Workflow (test reproduces the bug,
 * then proves the fix).
 *
 * Reported bug: "Make this writing smaller, it's currently bigger than
 * the hero text" for the search-bar caption "Powered by the PaySick Care
 * Agent. Describe your situation and get help figuring out how to afford
 * it." (index.html's `.agent-search-hint`).
 *
 * Root cause: `.agent-search-hint` (specificity 0,1,0) sets
 * font-size: 13px / color: #999999, but `.hero p` (specificity 0,1,1 --
 * one class plus one element, strictly higher) ALSO matches this element,
 * since it is itself a <p> tag inside .hero. `.hero p` was silently
 * winning, so the "hint" text rendered at the hero paragraph's 24px dark
 * gray instead of the intended small, muted caption size -- confirmed
 * visually via a headless-Chromium screenshot before and after the fix.
 *
 * Fix: rename the selector to `p.agent-search-hint` (specificity 0,1,1,
 * tying `.hero p`) placed AFTER `.hero p` in the stylesheet, so the CSS
 * source-order tiebreak makes the intended small styling win instead.
 * This test pins both halves of that fix so neither can silently regress:
 * the selector must include the `p` type qualifier, and its rule must be
 * declared after `.hero p`'s rule.
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

describe('index.html — .agent-search-hint must not be silently overridden by .hero p', () => {
  test('.hero p sets a hero-sized font (the rule this caption must beat)', () => {
    assert.match(html, /\.hero p\s*\{[^}]*font-size:\s*24px/, 'expected .hero p\'s font-size to still be 24px (sanity check the competing rule exists)');
  });

  test('the hint caption\'s selector includes the "p" type qualifier, not just the bare class', () => {
    // A bare ".agent-search-hint" (specificity 0,1,0) loses to ".hero p"
    // (specificity 0,1,1) regardless of source order -- this is exactly
    // the bug. "p.agent-search-hint" ties on specificity, so source order
    // (checked below) decides instead.
    assert.match(
      html,
      /p\.agent-search-hint\s*\{/,
      'the hint caption\'s CSS selector must be "p.agent-search-hint", not the bare ".agent-search-hint" class alone, or ".hero p" silently overrides its font-size/color again'
    );
  });

  test('the hint caption\'s rule is declared after .hero p\'s rule (wins the specificity tie by source order)', () => {
    const heroParagraphRuleIndex = html.indexOf('.hero p');
    const hintRuleIndex = html.indexOf('p.agent-search-hint');
    assert.ok(heroParagraphRuleIndex !== -1 && hintRuleIndex !== -1);
    assert.ok(
      hintRuleIndex > heroParagraphRuleIndex,
      'p.agent-search-hint must be declared after .hero p in the stylesheet to win the specificity tie'
    );
  });

  test('the hint caption is styled meaningfully smaller than the hero paragraph', () => {
    const ruleMatch = html.match(/p\.agent-search-hint\s*\{([^}]*)\}/);
    assert.ok(ruleMatch, 'expected to find the p.agent-search-hint rule');
    const rule = ruleMatch[1];
    const fontSizeMatch = rule.match(/font-size:\s*(\d+)px/);
    assert.ok(fontSizeMatch, 'expected an explicit px font-size on p.agent-search-hint');
    const fontSize = Number(fontSizeMatch[1]);
    assert.ok(fontSize < 18, `expected a small caption size well under the hero paragraph's 24px, got ${fontSize}px`);
  });
});
