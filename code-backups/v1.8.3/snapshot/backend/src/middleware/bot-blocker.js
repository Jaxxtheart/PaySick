'use strict';

/**
 * Bot User-Agent Fingerprinting Middleware
 *
 * Detects and blocks known scrapers, crawlers, and headless browsers
 * based on their User-Agent string.
 *
 * CLAUDE.md requirement: Bot fingerprinting — detect and block known bot signatures
 * via User-Agent analysis. Maintain a blocklist of known scraper and crawler UA strings.
 */

/**
 * Patterns matching known bot, crawler, and scraper User-Agent strings.
 * Each regex is case-insensitive.
 */
const BOT_USER_AGENT_PATTERNS = [
  // Major search engine crawlers
  /Googlebot/i,
  /Bingbot/i,
  /Slurp/i,          // Yahoo
  /DuckDuckBot/i,
  /Baiduspider/i,
  /YandexBot/i,
  /Sogou/i,
  /Exabot/i,
  /facebot/i,
  /facebookexternalhit/i,

  // SEO / analytics crawlers
  /AhrefsBot/i,
  /SemrushBot/i,
  /MJ12bot/i,
  /DotBot/i,
  /rogerbot/i,
  /linkdexbot/i,

  // HTTP client libraries commonly used for scraping
  /python-requests/i,
  /python-urllib/i,
  /Go-http-client/i,
  /Java\//i,
  /curl\//i,
  /wget\//i,
  /libwww-perl/i,
  /HTTPie/i,
  /axios\/[0-9]/i,

  // Scraping frameworks
  /Scrapy/i,
  /PhantomJS/i,
  /Nightmare/i,

  // Headless browsers
  /HeadlessChrome/i,
  /Puppeteer/i,
  /Playwright/i,

  // Generic bot / spider / crawler patterns
  /bot\b/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /archiver/i,
  /fetch\b/i,
];

/**
 * Returns true if the given User-Agent string matches a known bot pattern.
 *
 * @param {string} ua - The User-Agent header value
 * @returns {boolean}
 */
function isBotUserAgent(ua) {
  if (!ua) return false;
  return BOT_USER_AGENT_PATTERNS.some(pattern => pattern.test(ua));
}

/**
 * Express middleware that blocks requests from known bot User-Agents.
 * Bot requests receive a 403 response; legitimate browsers pass through.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function botBlockerMiddleware(req, res, next) {
  const ua = req.headers['user-agent'];
  if (isBotUserAgent(ua)) {
    return res.status(403).json({
      error: 'Forbidden',
      code: 'BOT_BLOCKED',
    });
  }
  next();
}

module.exports = botBlockerMiddleware;
module.exports.isBotUserAgent = isBotUserAgent;
module.exports.BOT_USER_AGENT_PATTERNS = BOT_USER_AGENT_PATTERNS;
