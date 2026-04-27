"use client";

import { useEffect, useRef } from "react";
import { createLogo3D } from "../../logo3d.js";

export function Logo3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Mount the 3D logo into the container
    const cleanup = createLogo3D(containerRef.current, {
      width: 500,
      height: 500,
      interactive: true
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px',
        height: '500px',
        zIndex: 0,
        pointerEvents: 'none' // allow clicks to pass through if needed, though interactive: true requires events
      }}
      className="logo-3d-container"
    />
  );
}
