/**
 * BlueArkive Landing Page Interactions
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
})
