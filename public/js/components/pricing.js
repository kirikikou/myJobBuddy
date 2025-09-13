(function() {
    let selectedDuration = 1;
    let pricingData = null;
    let isInitialized = false;

    function initPricing() {
        if (isInitialized) return;
        
        if (!window.userData) {
            setTimeout(initPricing, 100);
            return;
        }

        isInitialized = true;
        loadPricingData();
        setupEventListeners();
        updateCurrentPlanDisplay();
        initializeComponentI18n();
    }

    function initializeComponentI18n() {
        if (window.uiManager && window.uiManager.isInitialized) {
            window.uiManager.translatePage();
            window.uiManager.onLanguageChange(() => {
                setTimeout(() => {
                    window.uiManager.translatePage();
                    updateCurrentPlanDisplay();
                    updatePricing();
                }, 100);
            });
        }
    }

    function showLocalizedToast(type, messageKey, params = {}) {
        const message = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate(messageKey, params) : 
            messageKey;
        showToast(type, message);
    }

    function setupEventListeners() {
        document.querySelectorAll('.duration-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                selectedDuration = parseInt(this.dataset.duration);
                updatePricing();
            });
        });

        document.querySelectorAll('.plan-btn[data-plan]').forEach(btn => {
            btn.addEventListener('click', function() {
                const planName = this.dataset.plan;
                initiateUpgrade(planName, selectedDuration);
            });
        });
    }

    async function loadPricingData() {
        try {
            const response = await fetch('/plan/pricing');
            const data = await response.json();
            
            if (data.success) {
                pricingData = data.plans;
                updatePricing();
            }
        } catch (error) {
            console.error('Error loading pricing data:', error);
        }
    }

    function updatePricing() {
        if (!pricingData) return;

        updatePlanPricing('standard');
        updatePlanPricing('pro');
    }

    function updatePlanPricing(planName) {
        const plan = pricingData[planName];
        if (!plan || !plan.durations[selectedDuration]) return;

        const duration = plan.durations[selectedDuration];
        const monthlyEquivalent = duration.monthlyEquivalent;
        const totalPrice = duration.price;

        const priceEl = document.getElementById(`${planName}-price`);
        const totalEl = document.getElementById(`${planName}-total`);
        const savingsEl = document.getElementById(`${planName}-savings`);

        if (priceEl) {
            priceEl.textContent = `€${monthlyEquivalent.toFixed(2)}`;
        }

        if (totalEl) {
            if (selectedDuration === 1) {
                const billedMonthlyText = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate('pricing.billedMonthly') : 
                    'Billed monthly';
                totalEl.textContent = billedMonthlyText;
                if (savingsEl) savingsEl.style.display = 'none';
            } else {
                const totalText = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate('pricing.total') : 
                    'total';
                totalEl.textContent = `€${totalPrice.toFixed(2)} ${totalText}`;
                
                if (savingsEl) {
                    const monthlySavings = (plan.durations[1].price * selectedDuration) - totalPrice;
                    const percentSavings = Math.round((monthlySavings / (plan.durations[1].price * selectedDuration)) * 100);
                    
                    if (percentSavings > 0) {
                        const saveText = window.uiManager && window.uiManager.translate ? 
                            window.uiManager.translate('pricing.save') : 
                            'Save';
                        savingsEl.textContent = `${saveText} ${percentSavings}% (€${monthlySavings.toFixed(2)})`;
                        savingsEl.style.display = 'block';
                    } else {
                        savingsEl.style.display = 'none';
                    }
                }
            }
        }
    }

    function updateCurrentPlanDisplay() {
        if (!userData || !userData.subscription) return;

        const currentPlan = userData.subscription.plan;
        
        document.querySelectorAll('.pricing-card').forEach(card => {
            const planBtn = card.querySelector('.plan-btn');
            if (planBtn && planBtn.dataset.plan === currentPlan) {
                const currentPlanText = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate('pricing.currentPlan') : 
                    'Current Plan';
                planBtn.textContent = currentPlanText;
                planBtn.disabled = true;
                planBtn.classList.add('current-plan');
                card.classList.add('current');
            } else if (planBtn && planBtn.dataset.plan) {
                const planName = planBtn.dataset.plan;
                const upgradeToText = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate('pricing.upgradeTo') : 
                    'Upgrade to';
                const planDisplayName = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate(`pricing.plans.${planName}`) : 
                    planName.charAt(0).toUpperCase() + planName.slice(1);
                
                planBtn.innerHTML = `${upgradeToText} ${planDisplayName}`;
                planBtn.disabled = false;
                planBtn.classList.remove('current-plan');
                card.classList.remove('current');
            }
        });

        if (currentPlan === 'free') {
            const freeBtn = document.querySelector('.free-plan .plan-btn');
            if (freeBtn) {
                const currentPlanText = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate('pricing.currentPlan') : 
                    'Current Plan';
                freeBtn.textContent = currentPlanText;
                freeBtn.disabled = true;
                freeBtn.classList.add('current-plan');
            }
        }
    }

    async function initiateUpgrade(planName, duration) {
        try {
            const response = await fetch('/plan/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planName, duration })
            });

            const data = await response.json();

            if (data.success) {
                const planDisplayName = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate(`pricing.plans.${planName}`) : 
                    planName;
                
                let durationText;
                if (duration === 1) {
                    durationText = window.uiManager && window.uiManager.translate ? 
                        window.uiManager.translate('pricing.duration.oneMonth') : 
                        '1 month';
                } else if (duration === 3) {
                    durationText = window.uiManager && window.uiManager.translate ? 
                        window.uiManager.translate('pricing.duration.threeMonths') : 
                        '3 months';
                } else if (duration === 6) {
                    durationText = window.uiManager && window.uiManager.translate ? 
                        window.uiManager.translate('pricing.duration.sixMonths') : 
                        '6 months';
                } else if (duration === 12) {
                    durationText = window.uiManager && window.uiManager.translate ? 
                        window.uiManager.translate('pricing.duration.twelveMonths') : 
                        '12 months';
                }
                
                showLocalizedToast('info', 'pricing.redirectingToPayment', { 
                    plan: planDisplayName, 
                    duration: durationText 
                });
                
                setTimeout(() => {
                    window.location.href = `/payment?plan=${planName}&duration=${duration}`;
                }, 1000);
            } else {
                showLocalizedToast('error', data.error || 'pricing.upgradeFailed');
            }
        } catch (error) {
            console.error('Upgrade error:', error);
            showLocalizedToast('error', 'pricing.failedToInitiateUpgrade');
        }
    }

    window.getComponentData = function() {
        return {
            selectedDuration,
            timestamp: Date.now()
        };
    };

    window.setComponentData = function(data) {
        if (data.selectedDuration) {
            selectedDuration = data.selectedDuration;
            
            const durationBtn = document.querySelector(`[data-duration="${selectedDuration}"]`);
            if (durationBtn) {
                document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
                durationBtn.classList.add('active');
                updatePricing();
            }
        }
        
        updateCurrentPlanDisplay();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPricing);
    } else {
        initPricing();
    }

    window.pricingModule = {
        updateCurrentPlanDisplay,
        updatePricing,
        initPricing
    };
})();