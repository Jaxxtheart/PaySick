/**
 * MARKETPLACE AUCTION SERVICE
 *
 * This service runs the marketplace auction where lenders compete for loans.
 *
 * KEY PRINCIPLE: PaySick does ALL underwriting. Lenders just decide if they
 * want to fund pre-approved loans at the terms PaySick calculated.
 *
 * USAGE: This service EXTENDS existing underwriting, doesn't replace it.
 * Call it AFTER your current approval logic.
 */

const { query, transaction } = require('../config/database');
const EventEmitter = require('events');
const crypto = require('crypto');

class MarketplaceAuctionService extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * STEP 1: Submit application to marketplace
   *
   * This is called AFTER your existing underwriting/approval logic.
   * Don't change your existing flow - just call this at the end.
   *
   * @param {Object} params - Application parameters
   * @returns {string} - Application ID
   */
  async submitToMarketplace(params) {
    const {
      userId,
      providerId,
      procedureType,
      procedureCode,
      procedureDescription,
      loanAmount,
      requestedTerm,

      // Results from YOUR EXISTING underwriting (pass these in)
      riskScore,
      affordabilityScore,
      debtToIncomeRatio,
      monthlyIncome,
      employmentStatus,
      employmentDurationMonths,

      // Pre-calculated terms from YOUR EXISTING logic
      recommendedRate,
      recommendedTerm,
      recommendedMonthlyPayment,

      // Bureau data (if available)
      bureauCheckId,
      bureauScore,

      // Request metadata
      ipAddress,
      userAgent
    } = params;

    // Calculate risk tier
    const riskTier = this.getRiskTier(riskScore);

    // Calculate offers deadline (2 hours from now)
    const offersDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000);

    // Create the loan application with PRE-APPROVED terms
    const insertResult = await query(
      `INSERT INTO loan_applications (
        user_id,
        provider_id,
        procedure_type,
        procedure_code,
        procedure_description,
        loan_amount,
        requested_term,

        risk_score,
        risk_tier,
        affordability_score,
        debt_to_income_ratio,
        monthly_income,
        employment_status,
        employment_duration_months,

        recommended_rate,
        recommended_term,
        recommended_monthly_payment,

        bureau_check_id,
        bureau_check_date,
        bureau_score,

        status,
        submitted_at,
        offers_deadline,

        ip_address,
        user_agent
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17,
        $18, $19, $20,
        'SUBMITTED', NOW(), $21,
        $22, $23
      ) RETURNING application_id`,
      [
        userId,
        providerId || null,
        procedureType,
        procedureCode || null,
        procedureDescription || null,
        loanAmount,
        requestedTerm,

        riskScore || null,
        riskTier,
        affordabilityScore || null,
        debtToIncomeRatio || null,
        monthlyIncome || null,
        employmentStatus || null,
        employmentDurationMonths || null,

        recommendedRate || null,
        recommendedTerm || requestedTerm,
        recommendedMonthlyPayment || null,

        bureauCheckId || null,
        bureauCheckId ? new Date() : null,
        bureauScore || null,

        offersDeadline,

        ipAddress || null,
        userAgent || null
      ]
    );

    const applicationId = insertResult.rows[0].application_id;

    // Log to audit
    await this.logAuditEvent('loan_application', applicationId, 'create', null, {
      status: 'SUBMITTED',
      loanAmount,
      riskScore,
      riskTier
    });

    // Find lenders who want this risk profile
    const eligibleLenders = await this.getEligibleLenders(loanAmount, riskScore || 50);

    // Send loan package to each lender
    for (const lender of eligibleLenders) {
      await this.sendLoanPackageToLender(lender, {
        applicationId,
        preApprovedTerms: {
          amount: loanAmount,
          rate: recommendedRate || 0.20,
          term: recommendedTerm || requestedTerm,
          monthlyPayment: recommendedMonthlyPayment ||
            this.calculateMonthlyPayment(loanAmount, recommendedRate || 0.20, recommendedTerm || requestedTerm)
        },
        riskProfile: {
          score: riskScore || 50,
          tier: riskTier,
          affordability: affordabilityScore || 60
        },
        patientInfo: {
          income: monthlyIncome,
          employment: employmentStatus
        }
      });
    }

    // Update status to UNDERWRITING (processing offers)
    await query(
      `UPDATE loan_applications
       SET status = 'UNDERWRITING', underwriting_completed_at = NOW()
       WHERE application_id = $1`,
      [applicationId]
    );

    this.emit('application:submitted', { applicationId, eligibleLenders: eligibleLenders.length });

    return applicationId;
  }

  /**
   * STEP 2: Send loan package to lender
   *
   * Lenders receive COMPLETE package and just say yes/no
   */
  async sendLoanPackageToLender(lender, loanPackage) {
    const { applicationId, preApprovedTerms, riskProfile, patientInfo } = loanPackage;

    if (lender.type === 'PAYSICK_BALANCE_SHEET') {
      // Auto-approve from PaySick balance sheet
      await this.createLenderOffer({
        applicationId,
        lenderId: lender.lender_id,
        amount: preApprovedTerms.amount,
        rate: this.calculateLenderRate(lender, riskProfile.score),
        term: preApprovedTerms.term,
        monthlyPayment: null // Will be calculated in createLenderOffer
      });

      console.log(`✅ Auto-created offer from ${lender.name} for application ${applicationId}`);
      return;
    }

    // For external lenders with webhook integration
    if (lender.webhook_url) {
      try {
        const webhookPayload = {
          event: 'loan.available',
          application_id: applicationId,

          // PRE-APPROVED loan details
          loan: {
            amount: preApprovedTerms.amount,
            proposed_rate: preApprovedTerms.rate,
            proposed_term: preApprovedTerms.term,
            proposed_monthly_payment: preApprovedTerms.monthlyPayment
          },

          // Risk assessment (done by PaySick)
          risk: {
            paysick_score: riskProfile.score,
            paysick_tier: riskProfile.tier,
            affordability_ratio: riskProfile.affordability
          },

          // Patient info (anonymized for privacy)
          applicant: {
            monthly_income: patientInfo.income,
            employment_status: patientInfo.employment
          },

          // What lender needs to do
          action_required: 'RESPOND_WITH_OFFER',
          respond_by: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
          callback_url: `${process.env.API_BASE_URL || 'https://api.paysick.co.za'}/api/marketplace/webhooks/offer-response`
        };

        // Note: In production, use a proper HTTP client like axios
        console.log(`📤 Would send webhook to ${lender.name}:`, webhookPayload);

        // Uncomment for production:
        // const response = await fetch(lender.webhook_url, {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'X-PaySick-Signature': this.generateWebhookSignature(lender.api_key_encrypted, webhookPayload)
        //   },
        //   body: JSON.stringify(webhookPayload)
        // });

      } catch (error) {
        console.error(`❌ Failed to notify ${lender.name}:`, error);
      }
    }

    // Also log that we notified the lender
    await this.logAuditEvent('loan_application', applicationId, 'lender_notified', null, {
      lenderId: lender.lender_id,
      lenderName: lender.name,
      lenderType: lender.type
    });
  }

  /**
   * STEP 3: Receive offer from lender
   *
   * This is called when lender responds (via webhook callback or manual entry)
   */
  async receiveLenderOffer(params) {
    const {
      applicationId,
      lenderCode,
      accepted,
      adjustedRate,
      adjustedTerm,
      reason,
      lenderNotes,
      conditions
    } = params;

    // Get lender by code
    const lenderResult = await query(
      'SELECT * FROM lenders WHERE code = $1',
      [lenderCode]
    );

    if (lenderResult.rows.length === 0) {
      throw new Error(`Unknown lender: ${lenderCode}`);
    }

    const lender = lenderResult.rows[0];

    // Get application
    const appResult = await query(
      'SELECT * FROM loan_applications WHERE application_id = $1',
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      throw new Error('Application not found');
    }

    const application = appResult.rows[0];

    if (!accepted) {
      // Lender declined - just log it
      console.log(`❌ ${lender.name} declined application ${applicationId}: ${reason}`);

      await this.logAuditEvent('loan_application', applicationId, 'lender_declined', null, {
        lenderId: lender.lender_id,
        lenderName: lender.name,
        reason
      });

      return { success: true, declined: true };
    }

    // Lender accepted - create their offer
    const finalRate = adjustedRate || application.recommended_rate || this.calculateLenderRate(lender, application.risk_score);
    const finalTerm = adjustedTerm || application.recommended_term || application.requested_term;

    await this.createLenderOffer({
      applicationId,
      lenderId: lender.lender_id,
      amount: parseFloat(application.loan_amount),
      rate: finalRate,
      term: finalTerm,
      lenderNotes,
      conditions
    });

    return { success: true, declined: false };
  }

  /**
   * Helper: Create lender offer record
   */
  async createLenderOffer(params) {
    const {
      applicationId,
      lenderId,
      amount,
      rate,
      term,
      lenderNotes,
      conditions
    } = params;

    // Calculate payment details
    const monthlyPayment = this.calculateMonthlyPayment(amount, rate, term);
    const totalRepayable = monthlyPayment * term;
    const originationFee = amount * 0.025; // 2.5%

    // Expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await query(
      `INSERT INTO lender_offers (
        application_id,
        lender_id,
        approved_amount,
        interest_rate,
        term,
        monthly_payment,
        total_repayable,
        origination_fee,
        status,
        expires_at,
        lender_notes,
        conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, $10, $11)
      ON CONFLICT (application_id, lender_id)
      DO UPDATE SET
        approved_amount = EXCLUDED.approved_amount,
        interest_rate = EXCLUDED.interest_rate,
        term = EXCLUDED.term,
        monthly_payment = EXCLUDED.monthly_payment,
        total_repayable = EXCLUDED.total_repayable,
        origination_fee = EXCLUDED.origination_fee,
        expires_at = EXCLUDED.expires_at,
        lender_notes = EXCLUDED.lender_notes,
        conditions = EXCLUDED.conditions,
        updated_at = NOW()
      RETURNING offer_id`,
      [
        applicationId,
        lenderId,
        amount,
        rate,
        term,
        monthlyPayment,
        totalRepayable,
        originationFee,
        expiresAt,
        lenderNotes || null,
        conditions || null
      ]
    );

    const offerId = result.rows[0].offer_id;

    // Update application status if this is the first offer
    await query(
      `UPDATE loan_applications
       SET status = 'OFFERS_RECEIVED'
       WHERE application_id = $1 AND status IN ('SUBMITTED', 'UNDERWRITING')`,
      [applicationId]
    );

    // Log to audit
    await this.logAuditEvent('lender_offer', offerId, 'create', null, {
      applicationId,
      lenderId,
      amount,
      rate,
      term
    });

    this.emit('offer:created', { offerId, applicationId, lenderId });

    return offerId;
  }

  /**
   * Get all offers for an application
   */
  async getApplicationOffers(applicationId) {
    const result = await query(
      `SELECT
        lo.*,
        l.name AS lender_name,
        l.code AS lender_code,
        l.type AS lender_type
      FROM lender_offers lo
      JOIN lenders l ON lo.lender_id = l.lender_id
      WHERE lo.application_id = $1
      ORDER BY lo.interest_rate ASC`,
      [applicationId]
    );

    return result.rows;
  }

  /**
   * Accept an offer and create the loan
   */
  async acceptOffer(offerId, userId) {
    return await transaction(async (client) => {
      // Get offer details
      const offerResult = await client.query(
        `SELECT lo.*, la.user_id, la.provider_id
         FROM lender_offers lo
         JOIN loan_applications la ON lo.application_id = la.application_id
         WHERE lo.offer_id = $1 AND lo.status = 'PENDING'`,
        [offerId]
      );

      if (offerResult.rows.length === 0) {
        throw new Error('Offer not found or no longer available');
      }

      const offer = offerResult.rows[0];

      // Verify user owns this application
      if (offer.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      // Update offer status to ACCEPTED
      await client.query(
        `UPDATE lender_offers
         SET status = 'ACCEPTED', responded_at = NOW()
         WHERE offer_id = $1`,
        [offerId]
      );

      // Decline all other offers for this application
      await client.query(
        `UPDATE lender_offers
         SET status = 'DECLINED', responded_at = NOW(), decline_reason = 'Another offer accepted'
         WHERE application_id = $1 AND offer_id != $2 AND status = 'PENDING'`,
        [offer.application_id, offerId]
      );

      // Update application status
      await client.query(
        `UPDATE loan_applications
         SET status = 'OFFER_SELECTED', selected_offer_id = $1, decision_at = NOW()
         WHERE application_id = $2`,
        [offerId, offer.application_id]
      );

      // Create the marketplace loan
      const loanResult = await client.query(
        `INSERT INTO marketplace_loans (
          application_id,
          offer_id,
          lender_id,
          user_id,
          provider_id,
          principal_amount,
          interest_rate,
          term,
          monthly_payment,
          total_repayable,
          origination_fee,
          total_fees,
          status,
          outstanding_principal,
          total_outstanding,
          first_payment_date,
          maturity_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          'PENDING_DISBURSEMENT',
          $6,
          $6 + $11,
          CURRENT_DATE + INTERVAL '30 days',
          CURRENT_DATE + INTERVAL '1 month' * $8
        ) RETURNING loan_id`,
        [
          offer.application_id,
          offerId,
          offer.lender_id,
          offer.user_id,
          offer.provider_id,
          offer.approved_amount,
          offer.interest_rate,
          offer.term,
          offer.monthly_payment,
          offer.total_repayable,
          offer.origination_fee,
          offer.origination_fee,
        ]
      );

      const loanId = loanResult.rows[0].loan_id;

      // Create repayment schedule
      await this.createRepaymentSchedule(client, loanId, offer);

      return { loanId, offerId, applicationId: offer.application_id };
    });
  }

  /**
   * Create repayment schedule for a loan
   */
  async createRepaymentSchedule(client, loanId, offer) {
    const principal = parseFloat(offer.approved_amount);
    const rate = parseFloat(offer.interest_rate);
    const term = offer.term;
    const monthlyPayment = parseFloat(offer.monthly_payment);

    let remainingPrincipal = principal;
    const monthlyRate = rate / 12;

    for (let i = 1; i <= term; i++) {
      const interestPortion = remainingPrincipal * monthlyRate;
      const principalPortion = monthlyPayment - interestPortion;

      const scheduledDate = new Date();
      scheduledDate.setMonth(scheduledDate.getMonth() + i);

      await client.query(
        `INSERT INTO loan_repayments (
          loan_id,
          user_id,
          payment_number,
          scheduled_date,
          scheduled_amount,
          principal_portion,
          interest_portion,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED')`,
        [
          loanId,
          offer.user_id,
          i,
          scheduledDate,
          monthlyPayment,
          principalPortion,
          interestPortion
        ]
      );

      remainingPrincipal -= principalPortion;
    }
  }

  /**
   * Helper: Get eligible lenders
   */
  async getEligibleLenders(loanAmount, riskScore) {
    const result = await query(
      `SELECT * FROM lenders
       WHERE active = true
         AND min_loan_amount <= $1
         AND max_loan_amount >= $1
         AND min_risk_score <= $2
         AND max_risk_score >= $2
       ORDER BY base_rate ASC`,
      [loanAmount, riskScore]
    );

    return result.rows;
  }

  /**
   * Get pending applications for lender dashboard
   */
  async getPendingApplications(lenderCode = null) {
    let queryText = `
      SELECT
        la.*,
        u.full_name AS patient_name,
        u.email AS patient_email,
        p.provider_name,
        (
          SELECT COUNT(*)
          FROM lender_offers lo
          WHERE lo.application_id = la.application_id
        ) AS offer_count
      FROM loan_applications la
      JOIN users u ON la.user_id = u.user_id
      LEFT JOIN providers p ON la.provider_id = p.provider_id
      WHERE la.status IN ('SUBMITTED', 'UNDERWRITING', 'OFFERS_RECEIVED')
      ORDER BY la.submitted_at DESC
    `;

    const result = await query(queryText);
    return result.rows;
  }

  /**
   * Helper: Calculate monthly payment (amortization formula)
   */
  calculateMonthlyPayment(principal, annualRate, term) {
    const monthlyRate = annualRate / 12;
    if (monthlyRate === 0) {
      return principal / term;
    }
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, term)) /
           (Math.pow(1 + monthlyRate, term) - 1);
  }

  /**
   * Helper: Calculate lender-specific rate based on risk
   */
  calculateLenderRate(lender, riskScore) {
    const baseRate = parseFloat(lender.base_rate);
    const tier = this.getRiskTier(riskScore);

    let riskPremium = 0;
    switch (tier) {
      case 'LOW':
        riskPremium = parseFloat(lender.risk_premium_low) || 0.02;
        break;
      case 'MEDIUM':
        riskPremium = parseFloat(lender.risk_premium_mid) || 0.05;
        break;
      case 'HIGH':
        riskPremium = parseFloat(lender.risk_premium_high) || 0.10;
        break;
    }

    return baseRate + riskPremium;
  }

  /**
   * Helper: Determine risk tier from score
   */
  getRiskTier(score) {
    if (!score) return 'MEDIUM';
    if (score >= 70) return 'LOW';
    if (score >= 40) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Helper: Generate webhook signature for security
   */
  generateWebhookSignature(apiKey, payload) {
    const hmac = crypto.createHmac('sha256', apiKey || 'default-key');
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * Helper: Log audit event
   */
  async logAuditEvent(entityType, entityId, action, oldValues, newValues, performedBy = null) {
    await query(
      `INSERT INTO marketplace_audit_log (
        entity_type,
        entity_id,
        action,
        old_values,
        new_values,
        performed_by,
        performed_by_type
      ) VALUES ($1, $2, $3, $4, $5, $6, 'system')`,
      [
        entityType,
        entityId,
        action,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        performedBy
      ]
    );
  }
}

// Export singleton instance
const marketplaceAuctionService = new MarketplaceAuctionService();

module.exports = {
  MarketplaceAuctionService,
  marketplaceAuctionService
};
