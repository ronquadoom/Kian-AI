import { useMemo } from 'react';

interface Star {
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
}

function makeStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() < 0.85 ? 1 : 2,
      delay: `${(Math.random() * 6).toFixed(2)}s`,
      duration: `${(3 + Math.random() * 5).toFixed(2)}s`,
    });
  }
  return stars;
}

/** Fixed full-viewport aurora/nebula backdrop + faint star-field + grain. */
export default function Backdrop() {
  const stars = useMemo(() => makeStars(140), []);

  return (
    <>
      <div className="aurora" aria-hidden="true">
        <div className="aurora__glow aurora__glow--cyan" />
        <div className="aurora__glow aurora__glow--purple" />
        <div className="aurora__glow aurora__glow--indigo" />
        {stars.map((s, i) => (
          <span
            key={i}
            className="star"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              animationDelay: s.delay,
              animationDuration: s.duration,
            }}
          />
        ))}
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
}
