/**
 * أيقونات خطّية (stroke) للجسر — بلا إيموجي، تلتزم معيار اللوحة الحاكم.
 * حجمٌ افتراضيّ 18، تُورَّث ألوانها من `currentColor`.
 */
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function IconDoc(p) {
  return (
    <svg {...base} {...p}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
export function IconBox(p) {
  return (
    <svg {...base} {...p}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  );
}
export function IconSync(p) {
  return (
    <svg {...base} {...p}>
      <path d="M21 12a9 9 0 0 1-9 9c-2.5 0-4.8-1-6.4-2.7M3 12a9 9 0 0 1 9-9c2.5 0 4.8 1 6.4 2.7" />
      <path d="M21 3v5h-5M3 21v-5h5" />
    </svg>
  );
}
export function IconArrow(p) {
  return (
    <svg {...base} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
export function IconCheck(p) {
  return (
    <svg {...base} {...p}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function IconBell(p) {
  return (
    <svg {...base} {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
export function IconUp(p) {
  return (
    <svg {...base} {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}
export function IconDown(p) {
  return (
    <svg {...base} {...p}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}
