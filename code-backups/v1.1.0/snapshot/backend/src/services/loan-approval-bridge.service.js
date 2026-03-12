/**
 * LOAN APPROVAL BRIDGE SERVICE
 *
 * This connects your EXISTING loan approval logic to the NEW marketplace.
 *
 * USAGE: After your existing code approves a loan, call this service to
 * send it to the marketplace for competitive bidding.
 *
 * EXAMPLE INTEGRATION:
 *
 *   // Your existing code
 *   const approved = await existingApprovalService.approve(application);
 *
 *   if (approved) {
 *     // NEW: Send to marketplace
 *     const bridge = new LoanApprovalBridge();
 *     const applicationId = await bridge.sendToMarketplace({
 *       userId: approved.userId,
 *       providerId: approved.providerId,
 *       procedureType: approved.procedureType,
 *       loanAmount: approved.amount,
 *       requestedTerm: approved.term,
 *       existingRiskScore: approved.riskScore
 *     });
 *   }
 */

const { MarketplaceAuctionService } = require('./marketplace-auction.service');

class LoanApprovalBridge {
  constructor() {
    this.auctionService = new MarketplaceAuctionService();
  }

  /**
   * Call this AFTER your existing approval logic completes
   *
   * @param {Object} params - Application data from existing approval
   * @returns {string} - Marketplace application ID
   */
  async sendToMarketplace(params) {
    const {
      // Basic info
      userId,
      providerId,
      procedureType,
      procedureCode,
      procedureDescription,
      loanAmount,
      requestedTerm,

      // Your existing risk/underwriting results (optional - will use defaults if not provided)
      existingRiskScore,
      existingAffordabilityScore,
      existingDebtToIncomeRatio,
      existingMonthlyIncome,
      existingEmploymentStatus,
      existingEmploymentDurationMonths,
      existingRecommendedRate,
      existingRecommendedTerm,
      existingMonthlyPayment,

      // Bureau data (if available)
      bureauCheckId,
      bureauScore,

      // Request metadata
      ipAddress,
      userAgent
    } = params;

    // Use provided data or sensible defaults
    const riskScore = existingRiskScore || this.calculateDefaultRiskScore();
    const affordabilityScore = existingAffordabilityScore || 60;
    const monthlyIncome = existingMonthlyIncome || 0;
    const employmentStatus = existingEmploymentStatus || 'UNKNOWN';
    const recommendedRate = existingRecommendedRate || this.calculateDefaultRate(riskScore);
    const recommendedTerm = existingRecommendedTerm || requestedTerm;
    const monthlyPayment = existingMonthlyPayment ||
      this.calculatePayment(loanAmount, recommendedRate, recommendedTerm);

    // Submit to marketplace
    return await this.auctionService.submitToMarketplace({
      userId,
      providerId,
      procedureType,
      procedureCode,
      procedureDescription,
      loanAmount,
      requestedTerm,

      riskScore,
      affordabilityScore,
      debtToIncomeRatio: existingDebtToIncomeRatio,
      monthlyIncome,
      employmentStatus,
      employmentDurationMonths: existingEmploymentDurationMonths,

      recommendedRate,
      recommendedTerm,
      recommendedMonthlyPayment: monthlyPayment,

      bureauCheckId,
      bureauScore,

      ipAddress,
      userAgent
    });
  }

  /**
   * Simplified method for quick integration
   * Use when you just want to send basic loan info to marketplace
   */
  async quickSubmit(userId, providerId, procedureType, loanAmount, term) {
    return await this.sendToMarketplace({
      userId,
      providerId,
      procedureType,
      loanAmount,
      requestedTerm: term
    });
  }

  /**
   * Helper: Calculate default risk score
   * Uses existing logic from the platform (random 50-80 for demo)
   */
  calculateDefaultRiskScore() {
    // Match existing demo logic: random score between 50-80
    return Math.floor(Math.random() * 31) + 50;
  }

  /**
   * Helper: Calculate default interest rate based on risk
   */
  calculateDefaultRate(riskScore) {
    // Base rate 18%, with risk premium
    const baseRate = 0.18;

    if (riskScore >= 70) {
      return baseRate + 0.02; // Low risk: 20%
    } else if (riskScore >= 40) {
      return baseRate + 0.05; // Medium risk: 23%
    } else {
      return baseRate + 0.10; // High risk: 28%
    }
  }

  /**
   * Helper: Calculate monthly payment using amortization formula
   */
  calculatePayment(principal, annualRate, term) {
    const monthlyRate = annualRate / 12;
    if (monthlyRate === 0) {
      return principal / term;
    }
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, term)) /
           (Math.pow(1 + monthlyRate, term) - 1);
  }

  /**
   * Get marketplace offers for an existing application
   * Use to check what offers are available
   */
  async getOffers(applicationId) {
    return await this.auctionService.getApplicationOffers(applicationId);
  }

  /**
   * Accept a marketplace offer
   * Creates the actual loan from the accepted offer
   */
  async acceptOffer(offerId, userId) {
    return await this.auctionService.acceptOffer(offerId, userId);
  }
}

// Export for use in existing routes
module.exports = {
  LoanApprovalBridge
};
