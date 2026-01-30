/**
 * PaySick API Client
 * Handles all API communication between frontend and backend
 */

const PaySickAPI = {
  // Configuration
  baseURL: 'http://localhost:3000/api',

  /**
   * Helper function to make API requests
   */
  async request(endpoint, options = {}) {
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
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
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

      // Store token and user data
      if (response.token) {
        localStorage.setItem('paysick_auth_token', response.token);
        localStorage.setItem('paysick_user', JSON.stringify(response.user));
      }

      return response;
    },

    /**
     * Logout user
     */
    logout() {
      localStorage.removeItem('paysick_auth_token');
      localStorage.removeItem('paysick_user');
      localStorage.removeItem('paysick_onboarding_complete');
      localStorage.removeItem('paysick_onboarding_data');
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
    async makePayment(paymentId, paymentData) {
      return PaySickAPI.request(`/payments/${paymentId}/pay`, {
        method: 'POST',
        body: JSON.stringify(paymentData)
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
  }
};

// Export for use in HTML files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaySickAPI;
}
