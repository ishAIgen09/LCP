import { useEffect, useState } from "react";
import c1 from "@/assets/coffee-1.jpg";
import c2 from "@/assets/coffee-2.jpg";
import c3 from "@/assets/coffee-3.jpg";
import c4 from "@/assets/coffee-4.jpg";

const slides = [c1, c2, c3, c4];

export const HeroSlideshow = () => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 6500);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-espresso">
      {slides.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          width={1600}
          height={1200}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1800ms] ease-out"
          style={{
            opacity: i === idx ? 1 : 0,
            animation: i === idx ? "ken-burns 9s ease-out forwards" : undefined,
          }}
        />
      ))}
      <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-espresso/30 via-espresso/40 to-espresso" />
    </div>
  );
};
