"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const quotes = [
  "It's like having a brilliant intern who never misses anything.",
  "I can finally use an AI tool without my IT team screaming at me.",
  "I kept waiting for the paywall. It never came.",
  "It doesn't destroy my MacBook Air battery.",
  "I asked 'What did we decide?' and it pulled answers from three meetings ago.",
  "The 0 cloud uploads gives me total peace of mind.",
];

export function VocMarquee() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="voc-marquee-section" style={{ overflow: 'hidden', padding: '4rem 0', position: 'relative', zIndex: 10 }}>
      <div className="voc-marquee-track" style={{ display: 'flex', whiteSpace: 'nowrap' }}>
        <motion.div
          initial={{ x: 0 }}
          animate={{ x: "-50%" }}
          transition={{
            repeat: Infinity,
            ease: "linear",
            duration: 40,
          }}
          style={{ display: 'flex', gap: '2rem', paddingRight: '2rem' }}
        >
          {/* Double the array for seamless infinite scroll */}
          {[...quotes, ...quotes].map((quote, i) => (
            <div
              key={i}
              className="voc-quote liquid-glass"
              style={{
                padding: '1.5rem 2rem',
                borderRadius: '1rem',
                fontSize: '0.9375rem',
                color: 'rgba(255, 255, 255, 0.85)',
                fontWeight: 500,
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                flexShrink: 0,
              }}
            >
              "{quote}"
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
