/**
 * DEMO DATA - dashboard.html demo mode fixture
 *
 * Fabricated financial data used only when a demo-mode auth token
 * (`demo-...`) is present. Kept out of dashboard.html so the file that
 * renders real users' account balances doesn't also carry hardcoded
 * fake ones inline.
 */

function loadDemoData() {
    // Stats
    document.getElementById('statTotalBalance').textContent = fmt(18500);
    document.getElementById('statBalanceDesc').textContent = 'Across 1 active plan';
    document.getElementById('statNextPayment').textContent = fmt(6167);
    document.getElementById('statNextDesc').textContent = 'Due in 14 days';
    document.getElementById('statPaidYear').textContent = fmt(6167);
    document.getElementById('statPaidDesc').textContent = '1 payment completed';
    document.getElementById('statActivePlans').textContent = '1';
    document.getElementById('statPlansDesc').textContent = 'All in good standing';

    // Active plans
    document.getElementById('activePlansList').innerHTML =
        '<div class="payment-plan">' +
            '<div class="plan-header">' +
                '<span class="plan-provider">Netcare Dental Centre</span>' +
                '<span class="plan-status status-active">Active</span>' +
            '</div>' +
            '<div class="plan-details">' +
                '<div class="plan-detail"><span class="plan-detail-label">Total Amount</span><span class="plan-detail-value">' + fmt(18500) + '</span></div>' +
                '<div class="plan-detail"><span class="plan-detail-label">Remaining</span><span class="plan-detail-value">' + fmt(12333) + '</span></div>' +
                '<div class="plan-detail"><span class="plan-detail-label">Monthly Payment</span><span class="plan-detail-value">' + fmt(6167) + '</span></div>' +
                '<div class="plan-detail"><span class="plan-detail-label">Next Due</span><span class="plan-detail-value">15 Apr 2026</span></div>' +
            '</div>' +
            '<div class="progress-bar"><div class="progress-fill" style="width:33%"></div></div>' +
        '</div>';

    // Upcoming payments
    document.getElementById('upcomingPaymentsList').innerHTML =
        '<div class="payment-item">' +
            '<div class="payment-info">' +
                '<div class="payment-date">15 April 2026</div>' +
                '<div class="payment-provider">Netcare Dental Centre</div>' +
            '</div>' +
            '<div class="payment-actions">' +
                '<div class="payment-amount">' + fmt(6167) + '</div>' +
                '<span class="pay-now-btn" style="opacity:0.5;cursor:default;">Demo</span>' +
            '</div>' +
        '</div>';
}

/** Demo notifications for demo mode */
function getDemoNotifications() {
    var now = new Date();
    return [
        { notification_id: 'demo-1', type: 'payment_upcoming_1d', subject: 'Payment due tomorrow', message: 'Your payment of R6,167.00 is due tomorrow on 6 April 2026.', created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(), read_at: null },
        { notification_id: 'demo-2', type: 'plan_activated', subject: 'Payment plan active', message: 'Your payment plan with Netcare Dental Centre is now active.', created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(), read_at: null },
        { notification_id: 'demo-3', type: 'welcome', subject: 'Welcome to PaySick!', message: 'Your account is active. You can now apply for a healthcare payment plan.', created_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), read_at: null }
    ];
}
