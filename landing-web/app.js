/**
 * PiyNotes God-Tier Landing Page Interactions
 */
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// Initialize Lenis Smooth Scrolling Engine
const lenis = new Lenis()
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add(time => {
  lenis.raf(time * 1000)
})
gsap.ticker.lagSmoothing(0)

document.addEventListener('DOMContentLoaded', () => {
  // ═══ 1. Interactive Aha! Sandbox ═══
  const typeText = document.getElementById('typewriter-text')
  const triggerBtn = document.getElementById('sandbox-trigger')
  const inputState = document.getElementById('sandbox-input')
  const processingState = document.getElementById('sandbox-processing')
  const outputState = document.getElementById('sandbox-output')
  const resetBtn = document.getElementById('sandbox-reset')

  const textToType =
    'sarah will finalize graphql payload... blocker is devops staging lambda... target shifted to friday eod'
  let typeIndex = 0
  let isTyping = false

  function typeWriter() {
    if (typeIndex < textToType.length) {
      isTyping = true
      typeText.textContent += textToType.charAt(typeIndex)
      typeIndex++
      setTimeout(typeWriter, Math.random() * 40 + 20) // Random variance for human feel
    } else {
      isTyping = false
      triggerBtn.classList.add('active')
    }
  }

  // Start typing when sandbox comes into view
  const sandboxObserver = new IntersectionObserver(
    entries => {
      if (entries[0].isIntersecting && typeIndex === 0 && !isTyping) {
        setTimeout(typeWriter, 500)
      }
    },
    { threshold: 0.5 }
  )

  const sandboxEl = document.querySelector('.sandbox-container')
  if (sandboxEl) sandboxObserver.observe(sandboxEl)

  triggerBtn?.addEventListener('click', () => {
    // Transition to processing state
    inputState.style.display = 'none'
    processingState.style.display = 'flex'

    // Simulate local AI processing
    setTimeout(() => {
      processingState.style.display = 'none'
      outputState.style.display = 'flex'
    }, 1200)
  })

  resetBtn?.addEventListener('click', () => {
    outputState.style.display = 'none'
    inputState.style.display = 'flex'
    typeText.textContent = ''
    typeIndex = 0
    triggerBtn.classList.remove('active')
    setTimeout(typeWriter, 300)
  })

  // ═══ 2. Scrollytelling Memory Fabric ═══
  const scrollyLine = document.getElementById('scrolly-line')
  const nodes = document.querySelectorAll('.memory-fabric-node')

  window.addEventListener(
    'scroll',
    () => {
      if (!scrollyLine) return

      // Calculate scroll percentage
      const scrollPx = document.documentElement.scrollTop || document.body.scrollTop
      const winHeightPx =
        document.documentElement.scrollHeight - document.documentElement.clientHeight
      const scrolledX = (scrollPx / winHeightPx) * 100

      // Grow the line
      scrollyLine.style.height = scrolledX + '%'

      // Illuminate nodes when scroll line passes them
      nodes.forEach(node => {
        // The nodes are positioned via top percentages (e.g. top: 40%)
        const topPos = (parseFloat(getComputedStyle(node).top) / window.innerHeight) * 100
        if (scrolledX >= topPos - 5) {
          node.classList.add('illuminated')
        } else {
          node.classList.remove('illuminated')
        }
      })
    },
    { passive: true }
  )

  // ═══ 3. Magnetic Buttons (Vercel-Grade Micro-interaction) ═══
  const magneticButtons = document.querySelectorAll('.magnetic')
  magneticButtons.forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const rect = btn.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2

      // Pull button towards mouse
      btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`
    })

    btn.addEventListener('mouseleave', () => {
      // Spring back to center
      btn.style.transform = `translate(0px, 0px)`
    })
  })

  // ═══ 4. Role-Based Suggestion Engine ═══
  const roleTabs = document.querySelectorAll('.role-tab')
  const rolePanels = document.querySelectorAll('.role-panel')

  roleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs & panels
      roleTabs.forEach(t => {
        t.classList.remove('active')
        t.setAttribute('aria-selected', 'false')
      })
      rolePanels.forEach(p => p.classList.remove('active'))

      // Add active to clicked tab
      tab.classList.add('active')
      tab.setAttribute('aria-selected', 'true')

      // Show corresponding panel
      const targetRole = tab.getAttribute('data-role')
      const targetPanel = document.getElementById(`role-${targetRole}`)
      if (targetPanel) {
        targetPanel.classList.add('active')
      }
    })
  })

  // ═══ 5. Impossible Metric Counters (Web Worker Powered) ═══
  const counters = document.querySelectorAll('.counter')
  const metricWorker = new window.Worker('/worker.js')

  // Store DOM references to update them when the worker replies
  const counterMap = new Map()

  metricWorker.onmessage = e => {
    const { id, value, done } = e.data
    const entry = counterMap.get(id)
    if (!entry) return
    const { target, prefix, suffix } = entry

    target.innerText = prefix + value + suffix

    // Cleanup memory when animation finishes
    if (done) counterMap.delete(id)
  }

  metricWorker.onerror = () => {
    // If worker fails, populate counters with static values
    counters.forEach(counter => {
      const t = counter.getAttribute('data-target')
      const p = counter.getAttribute('data-prefix') || ''
      const s = counter.getAttribute('data-suffix') || ''
      const d = parseInt(counter.getAttribute('data-decimals')) || 0
      counter.innerText = p + parseFloat(t).toFixed(d) + s
    })
  }

  const counterObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = entry.target

          // Generate unique ID for worker tracking
          const id = Math.random().toString(36).substring(7)

          const targetValue = parseFloat(target.getAttribute('data-target'))
          const prefix = target.getAttribute('data-prefix') || ''
          const suffix = target.getAttribute('data-suffix') || ''
          const decimals = parseInt(target.getAttribute('data-decimals')) || 0

          // Save DOM reference mapping to DOM ID
          counterMap.set(id, { target, prefix, suffix })

          // Offload math to the Web Worker
          metricWorker.postMessage({
            id,
            targetValue,
            duration: 2000,
            frameRate: 1000 / 60, // 60 FPS
            decimals,
          })

          observer.unobserve(target) // Only run once
        }
      })
    },
    { threshold: 0.5 }
  )

  counters.forEach(counter => {
    counterObserver.observe(counter)
  })

  // ═══ 6. Pricing Toggle Logic ═══
  const pricingTabs = document.querySelectorAll('.pricing-tab')
  const pricingTierName = document.getElementById('pricing-tier-name')
  const pricingStrikethrough = document.getElementById('pricing-strikethrough')
  const pricingNumber = document.getElementById('pricing-number')
  const pricingSuffix = document.getElementById('pricing-suffix')
  const pricingPeriod = document.getElementById('pricing-period')
  const pricingFeatures = document.getElementById('pricing-features')
  const pricingCta = document.getElementById('pricing-cta')

  const pricingData = {
    personal: {
      name: 'Personal Sanctuary (Early Adopter)',
      strikethrough: '$11',
      price: '0',
      showSuffix: false,
      period: 'Free for now. Free forever.',
      features: [
        'Unlimited private meeting notes',
        'Floating "focus" widget',
        'Smart thought expansion',
        'Magic meeting search',
        'Military-grade security AES-256',
        'Works completely offline',
      ],
      ctaText: 'Download Free',
      ctaHref: '#download',
    },
    enterprise: {
      name: 'Enterprise Infrastructure',
      strikethrough: '',
      price: '29',
      showSuffix: true,
      period: 'Billed annually.',
      features: [
        'Everything in Personal',
        'Self-hosted deployment (VPC)',
        'SAML / SSO Integration',
        'Custom local LLM provisioning',
        'SOC2 Type II Compliance reports',
        'Dedicated success engineer',
      ],
      ctaText: 'Contact Sales',
      ctaHref: 'mailto:sales@piynotes.com',
    },
  }

  // Animate number function for pricing
  const animatePriceNumber = (start, end) => {
    const duration = 500 // faster for toggle
    const totalFrames = Math.round(duration / (1000 / 60))
    let currentFrame = 0
    const easeOutQuad = t => t * (2 - t)

    const update = () => {
      currentFrame++
      const progress = easeOutQuad(currentFrame / totalFrames)
      const currentVal = start + (end - start) * progress

      if (currentFrame < totalFrames) {
        pricingNumber.innerText = Math.round(currentVal)
        requestAnimationFrame(update)
      } else {
        pricingNumber.innerText = end
      }
    }
    requestAnimationFrame(update)
  }

  pricingTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('active')) return

      const currentActive = document.querySelector('.pricing-tab.active')
      const currentData = pricingData[currentActive.getAttribute('data-period')]

      pricingTabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')

      const selectedPeriod = tab.getAttribute('data-period')
      const data = pricingData[selectedPeriod]

      // Simple Fade Content Updates
      pricingTierName.style.opacity = '0'
      pricingPeriod.style.opacity = '0'
      pricingFeatures.style.opacity = '0'

      setTimeout(() => {
        pricingTierName.innerText = data.name
        pricingStrikethrough.innerText = data.strikethrough
        pricingStrikethrough.style.display = data.strikethrough ? 'inline' : 'none'
        pricingSuffix.style.display = data.showSuffix ? 'inline' : 'none'
        pricingPeriod.innerText = data.period
        pricingCta.innerText = data.ctaText
        pricingCta.href = data.ctaHref

        pricingFeatures.innerHTML = data.features.map(f => `<li>${f}</li>`).join('')

        pricingTierName.style.opacity = '1'
        pricingPeriod.style.opacity = '1'
        pricingFeatures.style.opacity = '1'
      }, 200)

      // Smooth Number Animation
      animatePriceNumber(parseInt(currentData.price), parseInt(data.price))
    })
  })

  // ═══ 7. GSAP ScrollTrigger Sequence ═══
  const reveals = gsap.utils.toArray('.reveal')

  reveals.forEach(reveal => {
    // Read legacy delay classes for backwards compatibility
    let extraDelay = 0
    if (reveal.classList.contains('reveal-delay-1')) extraDelay = 0.1
    if (reveal.classList.contains('reveal-delay-2')) extraDelay = 0.2
    if (reveal.classList.contains('reveal-delay-3')) extraDelay = 0.3

    gsap.fromTo(
      reveal,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        delay: extraDelay,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: reveal,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      }
    )
  })

  // ═══ 5. Smooth Scrolling for Hash Links ═══
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault()
      const targetId = this.getAttribute('href')
      if (targetId === '#') return

      const targetElement = document.querySelector(targetId)
      if (targetElement) {
        const headerOffset = 64
        const elementPosition = targetElement.getBoundingClientRect().top
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
      }
    })
  })
  // ═══ 9. Linear-style Bento Spotlight ═══
  const bentoGrid = document.querySelector('.bento-grid')
  if (bentoGrid) {
    bentoGrid.addEventListener('mousemove', e => {
      for (const card of document.querySelectorAll('.bento-card')) {
        const rect = card.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        card.style.setProperty('--mouse-x', `${x}px`)
        card.style.setProperty('--mouse-y', `${y}px`)
      }
    })
  }

  // ═══ 8. Exit Intent Modal ═══
  const exitModal = document.getElementById('exit-modal')
  const exitCloseBtn = document.getElementById('exit-close')
  let exitIntentTriggered = sessionStorage.getItem('piynotes-exit-intent') === 'true'

  if (exitModal && exitCloseBtn) {
    document.addEventListener('mouseleave', e => {
      if (e.clientY <= 0 && !exitIntentTriggered) {
        exitModal.classList.add('active')
        exitIntentTriggered = true
        sessionStorage.setItem('piynotes-exit-intent', 'true')
      }
    })

    exitCloseBtn.addEventListener('click', () => {
      exitModal.classList.remove('active')
    })

    exitModal.addEventListener('click', e => {
      if (e.target === exitModal) {
        exitModal.classList.remove('active')
      }
    })
  }

  // ═══ 10. Voice of Customer GSAP Marquee ═══
  const marqueeTrack = document.querySelector('.voc-marquee-track')
  if (marqueeTrack) {
    // Clone nodes for infinite scroll
    const items = marqueeTrack.innerHTML
    marqueeTrack.innerHTML = items + items + items

    gsap.to(marqueeTrack, {
      xPercent: -50,
      repeat: -1,
      duration: 35,
      ease: 'linear',
    })
  }

  // ═══ 11. Live Community Urgency Counter (WebSocket Simulator) ═══
  const counterVal = document.getElementById('live-community-counter')
  if (counterVal) {
    let currentCount = 2847 // Starting baseline
    setInterval(() => {
      // 10% chance a new meeting is recorded somewhere globally every 3 seconds
      if (Math.random() > 0.9) {
        currentCount += Math.floor(Math.random() * 3) + 1
        counterVal.innerText = currentCount.toLocaleString()

        // Flash amber ping dot to draw attention to activity
        const dot = document.querySelector('.urgency-counter .pulse-status-dot')
        if (dot) {
          gsap.fromTo(dot, { opacity: 1, scale: 1.5 }, { opacity: 0.5, scale: 1, duration: 0.5 })
        }
      }
    }, 3000)
  }

  // ═══ 12. Phase 10: Ultimate Onboarding Handshake (God-Tier) ═══
  const onboardingRoleTabs = document.querySelectorAll('.role-tab')
  let accumulatedRole = 'general'

  // Step 1: The State Accumulator
  onboardingRoleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      accumulatedRole = tab.getAttribute('data-role')
    })
  })

  // Step 2 & 3: The Interception & Dual-Payload Handoff
  const downloadLinks = document.querySelectorAll(
    'a[href*=".dmg"], a[href*=".exe"], a[href*=".AppImage"], a[href*=".deb"], a[href*=".rpm"]'
  )
  const handshakeModal = document.getElementById('handshake-modal')
  const handshakeTitle = document.getElementById('handshake-title')
  const handshakeSubtitle = document.getElementById('handshake-subtitle')
  const handshakeFallback = document.getElementById('handshake-fallback')
  const handshakeDeeplink = document.getElementById('handshake-deeplink')
  const handshakeSpinner = document.querySelector('.handshake-spinner')

  downloadLinks.forEach(link => {
    link.addEventListener('click', async e => {
      e.preventDefault() // Stop immediate unceremonious download
      const targetUrl = link.href

      // Generate the Payload (Base64 encoded JSON)
      const payloadObj = {
        role: accumulatedRole,
        timestamp: Date.now(),
        source: 'landing_page_v0.3.0',
      }
      const rawPayload = JSON.stringify(payloadObj)
      const encodedPayload = btoa(rawPayload)
      const handshakeToken = `__piy_init:${encodedPayload}`

      // Trigger the Cinematic Over-Screen Modal
      if (handshakeModal) {
        handshakeModal.classList.add('active')

        // Personalize the text based on the accumulated state
        const roleLabels = {
          founders: 'Founders',
          engineers: 'Engineers',
          sales: 'Sales',
          product: 'Product Management',
          general: 'Sovereign Users',
        }
        const displayRole = roleLabels[accumulatedRole] || 'Sovereign Users'

        handshakeTitle.innerText = `Configuring BlueArkive for ${displayRole}...`
        handshakeSubtitle.innerText = 'Compiling personalized templates and preparing executable.'

        // Payload A: The Clipboard Beacon (Write silently)
        try {
          await navigator.clipboard.writeText(handshakeToken)
        } catch (err) {
          console.log('Clipboard write restricted, relying on Deep Link fallback.')
        }

        // Payload B: The Deep Link Fallback (Prepare link for the button)
        if (handshakeDeeplink) {
          handshakeDeeplink.href = `piynotes://init?payload=${encodedPayload}`
        }

        // Simulate the "Build" sequence physically
        setTimeout(() => {
          handshakeSubtitle.innerText = 'Authenticating local environment...'
        }, 1500)

        setTimeout(() => {
          handshakeSubtitle.innerText = 'Finalizing Application Node...'
        }, 3000)

        setTimeout(() => {
          // Trigger the actual file download via a hidden iframe or location
          window.location.href = targetUrl

          // Show the Success state and the Fallback button
          if (handshakeSpinner) handshakeSpinner.style.display = 'none'
          handshakeTitle.innerText = 'Node Compiled Successfully.'
          handshakeSubtitle.innerText = 'Please install the downloaded file.'

          if (handshakeFallback) {
            handshakeFallback.style.display = 'block'
            setTimeout(() => {
              handshakeFallback.style.opacity = '1'
              handshakeFallback.style.transform = 'translateY(0)'
            }, 100)
          }
        }, 4500)
      } else {
        // Fallback if modal missing entirely
        window.location.href = targetUrl
      }
    })
  })

  // Close handler for the Handshake modal (ESC, close button, click outside)
  const handshakeCloseBtn = document.getElementById('handshake-close')

  function closeHandshakeModal() {
    if (handshakeModal) handshakeModal.classList.remove('active')
  }

  if (handshakeCloseBtn) {
    handshakeCloseBtn.addEventListener('click', closeHandshakeModal)
  }

  if (handshakeModal) {
    handshakeModal.addEventListener('click', e => {
      if (e.target === handshakeModal) closeHandshakeModal()
    })
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && handshakeModal?.classList.contains('active')) {
      closeHandshakeModal()
    }
  })
})
