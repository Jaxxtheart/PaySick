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
  // v1.12.0 review: user-triggered AI fetchers with no "bot" token
  /Perplexity-User/i,
  /MistralAI-User/i,
  /Claude-User/i,
  /Webzio-Extended/i,
  // v1.18.0 review: AI fetchers and scraping services with no "bot" token
  /Meta-ExternalFetcher/i,
  /FirecrawlAgent/i,
  /Google-NotebookLM/i,
  // v1.21.0 review: scripted HTTP clients and AI page readers with no
  // "bot" token. Kehr's API is called from browsers only.
  /python-httpx/i,
  /aiohttp/i,
  /^undici/i,
  /Apache-HttpClient/i,
  /Jina-Reader/i,
  /Crawl4AI/i,
  /Firecrawl/i,
  /Manus-User/i,
  // v1.22.0 review: AI agents and research fetchers with no "bot" token
  /GoogleOther/i,
  /Amzn-User/i,
  /Gemini-Deep-Research/i,
  /ChatGPT-Agent/i,
  /meta-webindexer/i,
  /Cloudflare-AutoRAG/i,

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
