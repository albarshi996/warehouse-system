import React from 'react';
import { ICONS } from './icon-data.js';

/**
 * React mirror of `Icon.astro`. Same icon set, same default size.
 *
 * Usage:
 *   <Icon name="package" className="text-brand-red" />
 */
export default function Icon({ name, size = 20, className = '', strokeWidth = 2 }) {
  const content = ICONS[name];
  if (!content) {
    if (typeof console !== 'undefined') {
      console.warn(`<Icon> got unknown name: "${name}"`);
    }
    return null;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
