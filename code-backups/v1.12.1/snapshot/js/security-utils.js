/**
 * PAYSICK FRONTEND SECURITY UTILITIES
 *
 * Client-side security helpers for XSS prevention and input sanitization.
 * Use these utilities when rendering user-provided content.
 */

const PaySickSecurity = {
  /**
   * Sanitize a string to prevent XSS attacks
   * Use this before inserting any user-provided content into the DOM
   * @param {string} input - Untrusted input string
   * @returns {string} - Sanitized string safe for DOM insertion
   */
  sanitize: function(input) {
    if (typeof input !== 'string') {
      return input === null || input === undefined ? '' : String(input);
    }

    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };

    return input.replace(/[&<>"'`=/]/g, char => map[char]);
  },

  /**
   * Safely set text content (preferred over innerHTML for text)
   * @param {HTMLElement} element - DOM element
   * @param {string} text - Text to set
   */
  setText: function(element, text) {
    if (element) {
      element.textContent = text;
    }
  },

  /**
   * Safely set HTML content with sanitization
   * Use only when you need HTML rendering
   * @param {HTMLElement} element - DOM element
   * @param {string} html - HTML content (will be sanitized)
   */
  setHTML: function(element, html) {
    if (element) {
      element.innerHTML = this.sanitize(html);
    }
  },

  /**
   * Create a safe HTML template with sanitized values
   * @param {string} template - HTML template with {key} placeholders
   * @param {Object} values - Object with values to insert
   * @returns {string} - HTML with sanitized values
   *
   * @example
   * PaySickSecurity.template(
   *   '<div class="user">{name}</div>',
   *   { name: userInput }
   * )
   */
  template: function(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (values.hasOwnProperty(key)) {
        return this.sanitize(values[key]);
      }
      return match;
    });
  },

  /**
   * Create an element with safe text content
   * @param {string} tag - HTML tag name
   * @param {string} text - Text content
   * @param {Object} attributes - Optional attributes
   * @returns {HTMLElement}
   */
  createElement: function(tag, text, attributes = {}) {
    const element = document.createElement(tag);
    element.textContent = text;

    for (const [key, value] of Object.entries(attributes)) {
      // Sanitize attribute values
      if (key.startsWith('on')) {
        // Don't allow event handlers from attributes
        console.warn('Event handlers in attributes are not allowed');
        continue;
      }
      element.setAttribute(key, this.sanitize(String(value)));
    }

    return element;
  },

  /**
   * Validate and sanitize a URL
   * Only allows http, https, and relative URLs
   * @param {string} url - URL to validate
   * @returns {string|null} - Sanitized URL or null if invalid
   */
  sanitizeURL: function(url) {
    if (!url) return null;

    try {
      // Allow relative URLs
      if (url.startsWith('/') && !url.startsWith('//')) {
        return url;
      }

      const parsed = new URL(url);

      // Only allow safe protocols
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        console.warn('Blocked unsafe URL protocol:', parsed.protocol);
        return null;
      }

      return parsed.href;
    } catch (e) {
      // Invalid URL
      return null;
    }
  },

  /**
   * Format currency safely (no user input in formatting)
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code (default: ZAR)
   * @returns {string}
   */
  formatCurrency: function(amount, currency = 'ZAR') {
    const num = parseFloat(amount);
    if (isNaN(num)) return 'R0.00';

    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: currency
    }).format(num);
  },

  /**
   * Format date safely
   * @param {string|Date} date - Date to format
   * @returns {string}
   */
  formatDate: function(date) {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';

      return new Intl.DateTimeFormat('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(d);
    } catch (e) {
      return '';
    }
  },

  /**
   * Build a table row from data object safely
   * @param {Object} data - Row data
   * @param {Array} columns - Column keys to include
   * @returns {HTMLTableRowElement}
   */
  createTableRow: function(data, columns) {
    const row = document.createElement('tr');

    columns.forEach(col => {
      const cell = document.createElement('td');
      const value = data[col];

      // Handle different types
      if (typeof value === 'number') {
        cell.textContent = value.toLocaleString();
      } else if (value instanceof Date) {
        cell.textContent = this.formatDate(value);
      } else {
        cell.textContent = value ?? '';
      }

      row.appendChild(cell);
    });

    return row;
  },

  /**
   * Validate South African ID number format
   * @param {string} idNumber
   * @returns {boolean}
   */
  validateSAID: function(idNumber) {
    if (!idNumber || typeof idNumber !== 'string') return false;
    return /^\d{13}$/.test(idNumber);
  },

  /**
   * Validate email format
   * @param {string} email
   * @returns {boolean}
   */
  validateEmail: function(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  /**
   * Validate South African phone number
   * @param {string} phone
   * @returns {boolean}
   */
  validatePhone: function(phone) {
    if (!phone || typeof phone !== 'string') return false;
    // Accepts formats: 0821234567, 082 123 4567, +27821234567
    return /^(\+27|0)[6-8][0-9]{8}$/.test(phone.replace(/\s/g, ''));
  },

  /**
   * Mask sensitive data for display
   * @param {string} value - Value to mask
   * @param {number} visibleChars - Number of chars to show at end
   * @returns {string}
   */
  mask: function(value, visibleChars = 4) {
    if (!value || typeof value !== 'string') return '';
    if (value.length <= visibleChars) return '*'.repeat(value.length);

    const masked = '*'.repeat(value.length - visibleChars);
    return masked + value.slice(-visibleChars);
  }
};

// Freeze the object to prevent modification
Object.freeze(PaySickSecurity);

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaySickSecurity;
}
