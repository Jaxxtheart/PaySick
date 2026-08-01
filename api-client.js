/**
 * PaySick API Client
 * Handles all API communication between frontend and backend
 */

const PaySickAPI = {
  // Configuration - dynamically set baseURL based on environment
  baseURL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : '/api',

  /**
   * Helper function to make API requests.
   * Automatically attempts a token refresh on TOKEN_EXPIRED 401s.
   */
  async request(endpoint, options = {}, _isRetry = false) {
    const url = `${this.baseURL}${endpoint}`;
    const token = localStorage.getItem('paysick_auth_token');

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);

      let data;
      try {
        data = await response.json();
      } catch {
        // Server returned a non-JSON body (e.g. HTML error page from hosting layer).
        throw new Error(`Server error (${response.status}). Please try again shortly.`);
      }

      if (!response.ok) {
        // Auto-refresh: attempt once when the access token has expired
        if (
          response.status === 401 &&
          data.code === 'TOKEN_EXPIRED' &&
          !_isRetry
        ) {
          const refreshToken = localStorage.getItem('paysick_refresh_token');
          if (refreshToken) {
            try {
              const refreshData = await this._refreshAccessToken(refreshToken);
              localStorage.setItem('paysick_auth_token', refreshData.accessToken);
              if (refreshData.refreshToken) {
                localStorage.setItem('paysick_refresh_token', refreshData.refreshToken);
              }
              return this.request(endpoint, options, true);
            } catch (_refreshError) {
              // Refresh failed — clear session and surface the error
              this.users.logout();
              throw new Error('Session expired. Please log in again.');
            }
          }
        }
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  /**
   * Exchange a refresh token for a new access token.
   * Internal — callers should use request() which handles this automatically.
   */
  async _refreshAccessToken(refreshToken) {
    const url = `${this.baseURL}/users/refresh-token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('Refresh failed'); }
    if (!response.ok) throw new Error(data.error || 'Refresh failed');
    return data;
  },

  /**
   * User Management APIs
   */
  users: {
    /**
     * Register a new user
     */
    async register(userData) {
      return PaySickAPI.request('/users/register', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
    },

    /**
     * Login user
     */
    async login(credentials) {
      const response = await PaySickAPI.request('/users/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
      });

      // Store token and user data (backend returns accessToken + refreshToken)
      if (response.accessToken) {
        localStorage.setItem('paysick_auth_token', response.accessToken);
        localStorage.setItem('paysick_refresh_token', response.refreshToken || '');
        localStorage.setItem('paysick_user', JSON.stringify(response.user));
      }

      return response;
    },

    /**
     * Logout user — revokes the session server-side then clears local storage.
     * Always clears storage even if the network call fails.
     */
    async logout() {
      try {
        await PaySickAPI.request('/users/logout', { method: 'POST' });
      } catch (_) {
        // Ignore server-side errors — local cleanup always runs
      } finally {
        localStorage.removeItem('paysick_auth_token');
        localStorage.removeItem('paysick_refresh_token');
        localStorage.removeItem('paysick_user');
        localStorage.removeItem('paysick_onboarding_complete');
        localStorage.removeItem('paysick_onboarding_data');
      }
    },

    /**
     * Get current user
     */
    getCurrentUser() {
      const userStr = localStorage.getItem('paysick_user');
      return userStr ? JSON.parse(userStr) : null;
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
      return !!localStorage.getItem('paysick_auth_token');
    },

    /**
     * Get user profile
     */
    async getProfile() {
      return PaySickAPI.request('/users/profile');
    },

    /**
     * Update user profile
     */
    async updateProfile(profileData) {
      return PaySickAPI.request('/users/profile', {
        method: 'PUT',
        body: JSON.stringify(profileData)
      });
    },

    /**
     * Add banking details
     */
    async addBanking(bankingData) {
      return PaySickAPI.request('/users/banking', {
        method: 'POST',
        body: JSON.stringify(bankingData)
      });
    },

    /**
     * Get banking details
     */
    async getBanking() {
      return PaySickAPI.request('/users/banking');
    },

    /**
     * Get dashboard summary
     */
    async getDashboard() {
      return PaySickAPI.request('/users/dashboard');
    },

    /**
     * Manually exchange the stored refresh token for a new access token.
     * Updates localStorage with the new tokens on success.
     * Throws if the refresh request fails.
     */
    async refreshToken() {
      const storedRefreshToken = localStorage.getItem('paysick_refresh_token');
      const data = await PaySickAPI._refreshAccessToken(storedRefreshToken);
      if (data.accessToken) {
        localStorage.setItem('paysick_auth_token', data.accessToken);
      }
      if (data.refreshToken) {
        localStorage.setItem('paysick_refresh_token', data.refreshToken);
      }
      return data;
    }
  },

  /**
   * Application Management APIs
   */
  applications: {
    /**
     * Submit new application
     */
    async create(applicationData) {
      return PaySickAPI.request('/applications', {
        method: 'POST',
        body: JSON.stringify(applicationData)
      });
    },

    /**
     * Get all user applications
     */
    async getAll() {
      return PaySickAPI.request('/applications');
    },

    /**
     * Get specific application
     */
    async getById(applicationId) {
      return PaySickAPI.request(`/applications/${applicationId}`);
    }
  },

  /**
   * Payment Management APIs
   */
  payments: {
    /**
     * Get all payment plans
     */
    async getPlans() {
      return PaySickAPI.request('/payments/plans');
    },

    /**
     * Get specific payment plan
     */
    async getPlan(planId) {
      return PaySickAPI.request(`/payments/plans/${planId}`);
    },

    /**
     * Get upcoming payments
     */
    async getUpcoming() {
      return PaySickAPI.request('/payments/upcoming');
    },

    /**
     * Get payment history
     */
    async getHistory() {
      return PaySickAPI.request('/payments/history');
    },

    /**
     * Make a payment
     */
    async makePayment(paymentId, amount, paymentMethod = 'debit_order') {
      return PaySickAPI.request(`/payments/${paymentId}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amount,
          payment_method: paymentMethod
        })
      });
    },

    /**
     * Get transactions for a payment
     */
    async getTransactions(paymentId) {
      return PaySickAPI.request(`/payments/${paymentId}/transactions`);
    }
  },

  /**
   * Provider Management APIs
   */
  providers: {
    /**
     * Get all providers
     */
    async getAll(filters = {}) {
      const params = new URLSearchParams(filters);
      return PaySickAPI.request(`/providers?${params}`);
    },

    /**
     * Get specific provider
     */
    async getById(providerId) {
      return PaySickAPI.request(`/providers/${providerId}`);
    },

    /**
     * Search providers
     */
    async search(searchTerm) {
      return PaySickAPI.request(`/providers/search/${encodeURIComponent(searchTerm)}`);
    },

    // ─── Provider Dashboard (authenticated, provider role) ────────────

    /**
     * Get dashboard overview stats
     */
    async getDashboardOverview() {
      return PaySickAPI.request('/providers/dashboard/overview');
    },

    /**
     * Get patient list for this provider
     */
    async getDashboardPatients() {
      return PaySickAPI.request('/providers/dashboard/patients');
    },

    /**
     * Get settlements for this provider
     */
    async getDashboardSettlements() {
      return PaySickAPI.request('/providers/dashboard/settlements');
    },

    /**
     * Get trust tier and score
     */
    async getDashboardTrustTier() {
      return PaySickAPI.request('/providers/dashboard/trust-tier');
    },

    /**
     * Get payment performance metrics
     */
    async getDashboardPaymentPerformance() {
      return PaySickAPI.request('/providers/dashboard/payment-performance');
    },

    /**
     * Get monthly revenue breakdown
     */
    async getDashboardRevenueMonthly() {
      return PaySickAPI.request('/providers/dashboard/revenue-monthly');
    }
  },

  /**
   * Marketplace APIs - Lending marketplace for medical procedures
   */
  marketplace: {
    /**
     * Submit loan application to marketplace
     */
    async submitApplication(applicationData) {
      return PaySickAPI.request('/marketplace/applications', {
        method: 'POST',
        body: JSON.stringify(applicationData)
      });
    },

    /**
     * Get all user's marketplace applications
     */
    async getApplications() {
      return PaySickAPI.request('/marketplace/applications');
    },

    /**
     * Get specific application with offers
     */
    async getApplication(applicationId) {
      return PaySickAPI.request(`/marketplace/applications/${applicationId}`);
    },

    /**
     * Get offers for an application
     */
    async getOffers(applicationId) {
      return PaySickAPI.request(`/marketplace/applications/${applicationId}/offers`);
    },

    /**
     * Accept an offer
     */
    async acceptOffer(offerId) {
      return PaySickAPI.request(`/marketplace/offers/${offerId}/accept`, {
        method: 'POST'
      });
    },

    /**
     * Get user's marketplace loans
     */
    async getLoans() {
      return PaySickAPI.request('/marketplace/loans');
    },

    /**
     * Get loan repayment schedule
     */
    async getLoanRepayments(loanId) {
      return PaySickAPI.request(`/marketplace/loans/${loanId}/repayments`);
    }
  },

  // ─── Notifications ──────────────────────────────────────────────────────
  notifications: {
    /**
     * Get in-app notifications (most recent first)
     */
    async getAll(opts = {}) {
      const params = new URLSearchParams();
      if (opts.unread) params.set('unread', 'true');
      if (opts.limit)  params.set('limit', String(opts.limit));
      const qs = params.toString();
      const data = await PaySickAPI.request(`/notifications${qs ? '?' + qs : ''}`);
      return data.notifications || [];
    },

    /**
     * Get unread notification count (for badge)
     */
    async getUnreadCount() {
      const data = await PaySickAPI.request('/notifications/unread-count');
      return data.count || 0;
    },

    /**
     * Mark a single notification as read
     */
    async markRead(notificationId) {
      return PaySickAPI.request(`/notifications/${notificationId}/read`, { method: 'PUT' });
    },

    /**
     * Mark all notifications as read
     */
    async markAllRead() {
      return PaySickAPI.request('/notifications/read-all', { method: 'PUT' });
    }
  },

  // ── Provider Outreach Agent (admin) ──────────────────────────────────────
  outreach: {
    /** List draft / compliance_hold touches awaiting approval. */
    async queue() {
      const data = await PaySickAPI.request('/outreach/queue');
      return data.touches || [];
    },

    /** Daily brief data + rendered HTML (sends nothing). */
    async brief() {
      return PaySickAPI.request('/outreach/brief');
    },

    /** Recent daily-run summaries. */
    async runs() {
      const data = await PaySickAPI.request('/outreach/runs');
      return data.runs || [];
    },

    /** Trigger a pipeline run. Pass { dry: true } for a no-send dry-run. */
    async runDaily({ dry = false } = {}) {
      return PaySickAPI.request(`/outreach/daily${dry ? '?dry=1' : ''}`, { method: 'POST' });
    },

    /** Approve a draft (the only path that sends it). */
    async approve(touchId) {
      return PaySickAPI.request(`/outreach/touches/${touchId}/approve`, { method: 'POST' });
    },

    /** Edit a draft's subject/body (re-runs the compliance linter). */
    async edit(touchId, { subject, body }) {
      return PaySickAPI.request(`/outreach/touches/${touchId}/edit`, {
        method: 'POST',
        body: JSON.stringify({ subject, body }),
      });
    },

    /** Reject a draft. */
    async reject(touchId) {
      return PaySickAPI.request(`/outreach/touches/${touchId}/reject`, { method: 'POST' });
    },

    /** Manually mark a lead as replied (halts the sequence). */
    async markReplied(providerId) {
      return PaySickAPI.request(`/outreach/providers/${providerId}/mark-replied`, { method: 'POST' });
    }
  }
};

// Export for use in HTML files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaySickAPI;
}
