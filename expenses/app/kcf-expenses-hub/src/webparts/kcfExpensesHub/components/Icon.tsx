import * as React from 'react';

/** Small local UI pictograms; never branding or a substitute Foundation crest. */
export function Icon({ name }: { name: string }): React.ReactElement {
  const paths: Record<string, string> = {
    home: 'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',
    receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3M9 7h6M9 11h6M9 15h4',
    route: 'M5 5a2 2 0 1 0 0 .1M19 19a2 2 0 1 0 0 .1M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9',
    check: 'M5 12l4 4L19 6M5 21h14',
    users: 'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M16 10a3 3 0 1 0 0-6M2 21v-3a6 6 0 0 1 12 0v3M16 13a6 6 0 0 1 6 5v3',
    review: 'M5 3h14v18H5V3M9 7h6M9 11h6M9 15l2 2 4-4',
    finance: 'M3 21h18M5 18V9h4v9M15 18V9h4v9M3 6l9-4 9 4H3',
    book: 'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15',
    help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 22v-2a8 8 0 0 1 16 0v2',
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    plus: 'M12 5v14M5 12h14',
    arrow: 'M5 12h14M14 7l5 5-5 5',
    menu: 'M4 6h16M4 12h16M4 18h16'
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] || paths.receipt} /></svg>;
}
