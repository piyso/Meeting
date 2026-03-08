/**
 * BlueArkive Landing Page Interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation Scroll Effect
  const nav = document.querySelector('.nav')

  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY > 50) {
        nav.classList.add('scrolled')
      } else {
        nav.classList.remove('scrolled')
      }
    },
    { passive: true }
  )

  // Intersection Observer for Scroll Animations
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.15,
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        // Optional: Stop observing once animated
        // observer.unobserve(entry.target)
      }
    })
  }, observerOptions)

  document.querySelectorAll('.animate-in').forEach(element => {
    observer.observe(element)
  })

  // Smooth Scrolling for Hash Links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault()
      const targetId = this.getAttribute('href')
      if (targetId === '#') return

      const targetElement = document.querySelector(targetId)
      if (targetElement) {
        // Offset for fixed header
        const headerOffset = 80
        const elementPosition = targetElement.getBoundingClientRect().top
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        })
      }
    })
  })

  // Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobile-toggle')
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      // In a full implementation, this opens a mobile menu overlay
      alert('Mobile menu navigation to be implemented.')
    })
  }

  // Dynamic OS Detection for Download Button (Optional enhancement)
  const heroDownloadBtn = document.querySelector('.hero-actions .btn-primary')
  if (heroDownloadBtn) {
    const platform = navigator.platform.toLowerCase()
    if (platform.includes('win')) {
      heroDownloadBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 3h7l2 2h9v14H3V3z"/>
          <path d="M8 13h8M8 17h5"/>
        </svg>
        Download for Windows
      `
      heroDownloadBtn.href = '#download'
    } else if (platform.includes('linux')) {
      heroDownloadBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2a10 10 0 0110 10H12V2zM12 22a10 10 0 01-10-10h10v10z"/>
        </svg>
        Download for Linux
      `
      heroDownloadBtn.href = '#download'
    }
  }
})
