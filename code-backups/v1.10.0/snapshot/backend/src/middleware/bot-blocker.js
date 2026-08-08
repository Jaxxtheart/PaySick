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
  /okhttp/i,
  /Apache-HttpClient/i,

  // Scraping frameworks
  /Scrapy/i,
  /PhantomJS/i,
  /Nightmare/i,

  // Headless browsers
  /HeadlessChrome/i,
  /Puppeteer/i,
  /Playwright/i,

  // AI training and retrieval crawlers (reviewed at v1.9.0).
  // Several of these also match /bot\b/ below, but they are named explicitly so
  // the list stays auditable rather than depending on that accident. The ones
  // with no "bot" token — anthropic-ai, Google-Extended, Meta-ExternalAgent,
  // cohere-ai, omgili — are only caught here.
  /GPTBot/i,
  /ChatGPT-User/i,
  /OAI-SearchBot/i,
  /ClaudeBot/i,
  /Claude-Web/i,
  /anthropic-ai/i,
  /CCBot/i,
  /PerplexityBot/i,
  /Google-Extended/i,
  /Applebot-Extended/i,
  /Bytespider/i,
  /Amazonbot/i,
  /Meta-ExternalAgent/i,
  /FacebookBot/i,
  /cohere-ai/i,
  /Diffbot/i,
  /ImagesiftBot/i,
  /omgili/i,
  /YouBot/i,
  /TimpiBot/i,

  // Reviewed at v1.10.0: user-triggered fetchers and scraping services. None of
  // these carry a "bot"/"crawler"/"spider" token, so the generic patterns below
  // miss them. "meta-externalfetcher" is missed by /fetch\b/ too, because the
  // token runs on into "fetcher".
  /Perplexity-User/i,
  /Claude-User/i,
  /meta-externalfetcher/i,
  /Firecrawl/i,
  /Webzio-Extended/i,
  // Named for auditability; these would also trip the generic /bot\b/ pattern.
  /AI2Bot/i,
  /PanguBot/i,
  /DuckAssistBot/i,

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
