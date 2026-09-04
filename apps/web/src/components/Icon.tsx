import type { CSSProperties } from 'react';

const paths = {
  folder: 'M3 7V5h6l2 2h10v12H3V7Z',
  plus: 'M12 5v14M5 12h14',
  chat: 'M4 4h16v12H9l-5 4V4Z',
  settings:
    'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  external: 'M13 4h7v7m0-7-10 10M9 4H4v16h16v-5',
  chevron: 'm9 5 7 7-7 7',
  file: 'M5 3h9l5 5v13H5V3Zm9 0v6h5M9 13h6m-6 4h6',
  tree: 'M6 3v14a3 3 0 0 0 3 3h9M6 8h12M6 14h12M18 5v6m0 0v6m0 0v6',
  terminal: 'm5 7 5 5-5 5m7 0h7',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
  stop: 'M5 5h14v14H5Z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
