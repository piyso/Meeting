/**
 * BlueArkive Premium Billing Logic - checkout.js
 * Handles Spotlight effects, Currency detection, and Checkout SDK integrations.
 */

/* global Razorpay */

// Resolve the API base URL:
// 1. From ?api_base= query param (passed by the Electron app)
// 2. Fallback to Supabase Edge Functions URL (set at deploy time)
const API_BASE_URL = (() => {
  const params = new URLSearchParams(window.location.search)
  return params.get('api_base') || 'https://YOUR_PROJECT.supabase.co/functions/v1'
})()
let CURRENT_CURRENCY = 'USD' // Default fallback
let BILLING_INTERVAL = 'monthly' // monthly | yearly
let USER_CONTEXT = null

// --- DOM Nodes ---
const amountSpans = document.querySelectorAll('.amount')
const currencySyms = document.querySelectorAll('.currency-sym')
const billedAsElements = document.querySelectorAll('.billed-as')
const btnUsd = document.getElementById('btn-usd')
const btnInr = document.getElementById('btn-inr')
const switcherGlider = document.getElementById('switcher-glider')
const overlay = document.getElementById('processing-overlay')
const toggleThumb = document.getElementById('toggle-thumb')
const labelMonthly = document.getElementById('label-monthly')
const labelYearly = document.getElementById('label-yearly')
const saveBadge = document.getElementById('save-badge')

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  parseUrlParams()
  detectCurrencyRegion()
  initSpotlightEffect()
  initMagneticButtons()
})

// --- URL & Context ---
function parseUrlParams() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const email = params.get('email')
  const tier = params.get('current_tier')

  if (token && email) {
    USER_CONTEXT = { token, email, tier: tier || 'free' }

    // Show context UI
    document.getElementById('user-context').classList.remove('hidden')
    document.getElementById('user-display').innerText = email
    document.getElementById('current-tier-badge').innerText = tier ? tier.toUpperCase() : 'FREE'

    // Custom behaviors based on target
    const target = params.get('target_tier')
    if (target) {
      highlightTargetTier(target)
    }
  }
}

function highlightTargetTier(tierId) {
  const targetCard = document.querySelector(`.spotlight-card[data-tier="${tierId}"]`)
  if (targetCard) {
    // Remove recommended from others
    document.querySelectorAll('.spotlight-card').forEach(c => c.classList.remove('recommended'))
    targetCard.classList.add('recommended')

    // Ensure ambient glow exists
    if (!targetCard.querySelector('.ambient-glow')) {
      const glow = document.createElement('div')
      glow.className = 'ambient-glow'
      targetCard.querySelector('.card-border').after(glow)
    }
  }
}

// --- Currency Logic ---
function detectCurrencyRegion() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone.includes('Asia/Kolkata') || timezone.includes('Asia/Calcutta')) {
      setCurrency('INR', false)
    } else {
      setCurrency('USD', false)
    }
  } catch {
    setCurrency('USD', false)
  }
}

// Exposed to HTML onclick handlers
window.setCurrency = setCurrency
function setCurrency(currency, animate = true) {
  CURRENT_CURRENCY = currency

  // Update Switcher UI
  if (currency === 'USD') {
    btnUsd.classList.add('active')
    btnInr.classList.remove('active')
    switcherGlider.style.transform = 'translateX(0)'
  } else {
    btnInr.classList.add('active')
    btnUsd.classList.remove('active')
    switcherGlider.style.transform = 'translateX(100%)'
  }

  // Update Prices — respect billing interval
  amountSpans.forEach(span => {
    const isYearly = BILLING_INTERVAL === 'yearly'
    const key = isYearly
      ? currency === 'USD'
        ? 'data-usd-yearly'
        : 'data-inr-yearly'
      : currency === 'USD'
        ? 'data-usd'
        : 'data-inr'
    const val = span.getAttribute(key)
    if (val) {
      if (animate) animateValueChange(span, val)
      else span.innerText = val
    }
  })

  // Update Symbols
  currencySyms.forEach(sym => {
    sym.innerText = currency === 'USD' ? '$' : '₹'
  })

  // Update billed-as subtexts
  updateBilledAs()
}

// --- Billing Interval Logic ---
window.setBillingInterval = setBillingInterval
window.toggleBillingInterval = toggleBillingInterval

function toggleBillingInterval() {
  setBillingInterval(BILLING_INTERVAL === 'monthly' ? 'yearly' : 'monthly')
}

function setBillingInterval(interval) {
  BILLING_INTERVAL = interval

  // Update toggle UI
  if (interval === 'yearly') {
    toggleThumb.style.transform = 'translateX(24px)'
    document.getElementById('billing-toggle-btn').style.background = '#8b5cf6'
    labelYearly.classList.add('active')
    labelMonthly.classList.remove('active')
    saveBadge.classList.remove('hidden')
  } else {
    toggleThumb.style.transform = 'translateX(0)'
    document.getElementById('billing-toggle-btn').style.background = 'rgba(255,255,255,0.1)'
    labelMonthly.classList.add('active')
    labelYearly.classList.remove('active')
    saveBadge.classList.add('hidden')
  }

  // Re-apply currency with new interval
  setCurrency(CURRENT_CURRENCY, true)
}

function updateBilledAs() {
  billedAsElements.forEach(el => {
    if (BILLING_INTERVAL === 'yearly') {
      const yearlyTotal =
        CURRENT_CURRENCY === 'USD'
          ? el.getAttribute('data-yearly-usd')
          : el.getAttribute('data-yearly-inr')
      const sym = CURRENT_CURRENCY === 'USD' ? '$' : '₹'
      el.innerText = `Billed as ${sym}${yearlyTotal}/year`
      el.classList.remove('hidden')
    } else {
      el.classList.add('hidden')
    }
  })
}

function animateValueChange(element, newValue) {
  element.style.opacity = '0'
  element.style.transform = 'translateY(-10px)'

  setTimeout(() => {
    element.innerText = newValue
    element.style.opacity = '1'
    element.style.transform = 'translateY(0)'
    element.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
  }, 150)
}

// --- World-Class UX Effects ---

// 1. Spotlight Cards
function initSpotlightEffect() {
  const cards = document.querySelectorAll('.spotlight-card')

  cards.forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      card.style.setProperty('--mouse-x', `${x}px`)
      card.style.setProperty('--mouse-y', `${y}px`)
    })
  })
}

// 2. Magnetic Buttons
function initMagneticButtons() {
  const buttons = document.querySelectorAll('.magnetic')

  buttons.forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const rect = btn.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2

      // Soft magnetic pull
      btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`
    })

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translate(0px, 0px)'
      btn.style.transition = 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)'
    })

    btn.addEventListener('mouseenter', () => {
      btn.style.transition = 'none' // remove transition for snappy tracking
    })
  })
}

// --- Payment Integration ---

// Expose to HTML onclick handlers
window.initiateCheckout = async function initiateCheckout(tierId) {
  if (!USER_CONTEXT || !USER_CONTEXT.token) {
    // Not launched from the app — prompt them to open the app
    alert(
      'Please initiate upgrades directly from the BlueArkive desktop application to ensure your account is securely linked.'
    )
    return
  }

  showOverlay()

  try {
    // 1. Call PiyAPI to create a checkout session/order
    const response = await fetch(`${API_BASE_URL}/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${USER_CONTEXT.token}`,
      },
      body: JSON.stringify({
        tierId: tierId,
        currency: CURRENT_CURRENCY,
        billingInterval: BILLING_INTERVAL,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Failed to initialize checkout')
    }

    hideOverlay()

    // 2. Launch respective SDK
    if (CURRENT_CURRENCY === 'INR') {
      launchRazorpay(data.data)
    } else {
      launchLemonSqueezy(data.data.checkoutUrl)
    }
  } catch (err) {
    hideOverlay()
    console.error('Checkout error:', err)
    alert(`We encountered an error setting up your secure checkout: ${err.message}`)
  }
}

function launchRazorpay(orderData) {
  const options = {
    key: orderData.keyId, // Razorpay public key from backend
    amount: orderData.amount,
    currency: 'INR',
    name: 'BlueArkive',
    description: `BlueArkive ${orderData.tierName} Plan`,
    order_id: orderData.orderId,
    handler: async function (_response) {
      showOverlay()
      document.querySelector('.overlay-text').innerText = 'Verifying payment...'
      // Backend will handle verification via webhooks, but we can do a quick check
      setTimeout(() => {
        showSuccess()
      }, 2000)
    },
    prefill: {
      email: USER_CONTEXT.email,
    },
    theme: {
      color: '#8b5cf6',
    },
  }

  const rzp = new Razorpay(options)
  rzp.on('payment.failed', function (response) {
    console.error(response.error)
    alert('Payment failed or cancelled.')
  })
  rzp.open()
}

function launchLemonSqueezy(checkoutUrl) {
  if (window.createLemonSqueezy) {
    window.createLemonSqueezy()
    window.LemonSqueezy.Url.Open(checkoutUrl)

    window.LemonSqueezy.Setup({
      eventHandler: event => {
        if (event.event === 'Checkout.Success') {
          showSuccess()
        }
      },
    })
  } else {
    // Fallback to direct redirect
    window.location.href = checkoutUrl
  }
}

function showOverlay() {
  overlay.classList.remove('hidden')
}

function hideOverlay() {
  overlay.classList.add('hidden')
}

function showSuccess() {
  const container = document.getElementById('app')
  container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; text-align: center; animation: fadeInUp 0.8s forwards;">
            <div style="width: 80px; height: 80px; background: rgba(139, 92, 246, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem;">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h1 class="hero-title" style="margin-bottom: 1rem;">Sanctuary Secured.</h1>
            <p class="hero-subtitle">Your payment was successful. Return to the BlueArkive app — your new premium features will unlock in just a moment.</p>
        </div>
    `
  hideOverlay()
}
