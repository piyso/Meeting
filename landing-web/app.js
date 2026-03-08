/**
 * BlueArkive Landing Page Interactions (Clean Aesthetic)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Smooth Scrolling for Hash Links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault()
      const targetId = this.getAttribute('href')
      if (targetId === '#') return

      const targetElement = document.querySelector(targetId)
      if (targetElement) {
        // Offset for sticky navigation header
        const headerOffset = 64
        const elementPosition = targetElement.getBoundingClientRect().top
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        })
      }
    })
  })

  // Dynamic OS Detection for primary download button
  const heroDownloadBtn = document.getElementById('hero-download')
  if (heroDownloadBtn) {
    const platform = navigator.platform.toLowerCase()
    const subtext = heroDownloadBtn.querySelector('.btn-subtext')

    if (platform.includes('win')) {
      heroDownloadBtn.childNodes[0].nodeValue = 'Download for Windows\n'
      if (subtext) subtext.textContent = 'x64 Installer & Portable (Coming Soon)'
      heroDownloadBtn.classList.add('btn-outline')
      heroDownloadBtn.classList.remove('btn-primary')
    } else if (platform.includes('linux')) {
      heroDownloadBtn.childNodes[0].nodeValue = 'Download for Linux\n'
      if (subtext) subtext.textContent = 'AppImage, .deb, .rpm (Coming Soon)'
      heroDownloadBtn.classList.add('btn-outline')
      heroDownloadBtn.classList.remove('btn-primary')
    } else if (platform.includes('mac')) {
      // Keep default Mac styling and text
      heroDownloadBtn.childNodes[0].nodeValue = 'Download BlueArkive\n'
      if (subtext) subtext.textContent = 'For macOS (Apple Silicon & Intel)'
    }
  }
})
