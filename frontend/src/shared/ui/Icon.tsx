/*    Conjunto único de ícones de traço (1.6px, currentColor) que substitui
   os antigos emojis usados como ícones em toda a interface.
   Uso: <Icon n="folder" />  - herda a cor e o tamanho do texto ao redor. */

import type { CSSProperties, HTMLAttributes } from 'react';

const P: Record<string, string> = {
  eye:          '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':    '<path d="M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.9 3.9M6.5 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M14.1 14.2a3 3 0 0 1-4.2-4.3"/><path d="m2 2 20 20"/>',
  check:        '<polyline points="20 6 9 17 4 12"/>',
  x:            '<path d="M18 6 6 18M6 6l12 12"/>',
  alert:        '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  edit:         '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash:        '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  save:         '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7M8 21v-7h8v7"/>',
  file:         '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  clipboard:    '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v1H9z"/><path d="M9 11h6M9 15h4"/>',
  folder:       '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  box:          '<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  building:     '<path d="M4 21V6l7-3 7 3v15"/><path d="M9 21v-5h4v5M8 9h.01M13 9h.01M8 13h.01M13 13h.01"/>',
  hospital:     '<path d="M4 21V8l8-4 8 4v13"/><path d="M12 9v6M9 12h6"/>',
  users:        '<circle cx="8" cy="9" r="3"/><path d="M2 20c0-3 2.7-5 6-5s6 2 6 5"/><circle cx="17" cy="10" r="2.4"/><path d="M15 20c0-2.4 1.5-4 3.5-4"/>',
  user:         '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/>',
  'user-plus':  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.5 6-5.5"/><path d="M17 8h5M19.5 5.5v5"/>',
  hardhat:      '<path d="M4 17a8 8 0 0 1 16 0"/><path d="M10 9a2 2 0 0 1 4 0v2"/><path d="M2 17h20v2H2z"/>',
  lock:         '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  key:          '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 5l2 2M14 8l2 2"/>',
  search:       '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  bell:         '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  bookmark:     '<path d="M6 3h12v18l-6-4-6 4z"/>',
  calendar:     '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  clock:        '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1A2 2 0 1 1 8.4 5.4l.1.1A1.6 1.6 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-1.1 2.7v.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1z"/>',
  tool:         '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2-2 2.4-2.4Z"/>',
  build:        '<path d="M3 21h18M6 21V9l6-4 6 4v12"/><path d="M10 21v-5h4v5"/>',
  grid:         '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  'bar-chart':  '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  trend:        '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  target:       '<path d="M5 21V4M5 4l11 3-3 4 3 4-11 2"/>',
  pin:          '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  link:         '<path d="M9 15l6-6"/><path d="M10.5 6.5 12 5a4 4 0 0 1 6 6l-1.5 1.5M13.5 17.5 12 19a4 4 0 0 1-6-6l1.5-1.5"/>',
  refresh:      '<path d="M20 11a8 8 0 0 0-14-4.5L3 9"/><path d="M4 13a8 8 0 0 0 14 4.5L21 15"/><path d="M3 5v4h4M21 19v-4h-4"/>',
  printer:      '<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M8 16h8v5H8z"/>',
  image:        '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M5 19l5-5 4 4 2-2 3 3"/>',
  camera:       '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.2"/>',
  umbrella:     '<path d="M3 20h18"/><path d="M12 20V9"/><path d="M12 9a7 7 0 0 1 7 6H5a7 7 0 0 1 7-6Z"/>',
  logout:       '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  plus:         '<path d="M12 5v14M5 12h14"/>',
  globe:        '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  monitor:      '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  puzzle:       '<path d="M9 4a1.5 1.5 0 0 1 3 0c0 .8.7 1.5 1.5 1.5H16v2.5c0 .8.7 1.5 1.5 1.5a1.5 1.5 0 0 1 0 3c-.8 0-1.5.7-1.5 1.5V20h-2.5c-.8 0-1.5-.7-1.5-1.5a1.5 1.5 0 0 0-3 0c0 .8-.7 1.5-1.5 1.5H4v-2.5C4 16.7 3.3 16 2.5 16"/>',
  inbox:        '<path d="M4 13l2 5h12l2-5"/><path d="M4 13V5h16v8"/><path d="M4 13h4l1 2h6l1-2h4"/>',
  stethoscope:  '<path d="M5 3v6a4 4 0 0 0 8 0V3"/><path d="M9 15a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="10" r="2"/>',
  handshake:    '<path d="m11 17 2 2 4-4"/><path d="M3 10l4-4 5 5 2-2 5 4v4l-4 3-4-3"/>',
  sun:          '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  moon:         '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'arrow-right':'<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-up':   '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  undo:         '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo:         '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  dot:          '<circle cx="12" cy="12" r="3"/>',
  map:          '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  upload:       '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download:     '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
};

// Tamanho embutido: o ícone nunca "explode" mesmo que o CSS do tema não carregue.
const BASE: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.15em', height: '1.15em', verticalAlign: '-0.18em', flex: '0 0 auto' };
const SVG: CSSProperties = { width: '100%', height: '100%', display: 'block' };

type IconProps = HTMLAttributes<HTMLSpanElement> & {
  n?: string;
};

function Icon({ n = 'dot', className = '', title, style, ...rest }: IconProps) {
  const path = P[n] ?? '';
  return (
    <span className={`shrink-0${className ? ' ' + className : ''}`} style={style ? { ...BASE, ...style } : BASE} aria-hidden={title ? undefined : true} {...rest}>
      <svg viewBox="0 0 24 24" width="1em" height="1em" style={SVG} fill="none" stroke="currentColor" strokeWidth="1.6"
           strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined}>
        {title ? <title>{title}</title> : null}
        <g dangerouslySetInnerHTML={{ __html: path }} />
      </svg>
    </span>
  );
}

export default Icon;
