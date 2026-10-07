import React from 'react';

export const ROUTES = {
  dashboard: '/',
  cards: '/cards',
  search: '/search-location',
  containers: '/containers',
  scan: '/scanner',
  scanner: '/scanner'
};

const TAB_ALIASES = {
  dashboard: 'dashboard',
  cards: 'cards',
  search: 'search',
  containers: 'containers',
  scan: 'scanner'
};

export function normalizeUrl(path = '/') {
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(String(path || '/'), base);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  return `${pathname}${url.search}${url.hash}`;
}

export function getRoute(pathname) {
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(String(pathname || '/'), base);
  const path = (url.pathname || '/').replace(/\/+$/, '') || '/';

  if (path === '/') {
    const requestedTab = url.searchParams.get('tab');
    if (requestedTab && TAB_ALIASES[requestedTab]) {
      return { name: TAB_ALIASES[requestedTab] };
    }
    return { name: 'dashboard' };
  }

  if (path === ROUTES.cards) return { name: 'cards' };
  if (path === ROUTES.search) return { name: 'search' };
  if (path === ROUTES.containers) return { name: 'containers' };
  if (path === ROUTES.scanner) return { name: 'scanner' };

  const boxMatch = path.match(/^\/box\/([^/]+)$/);
  if (boxMatch) {
    return { name: 'box', id: decodeURIComponent(boxMatch[1]) };
  }

  return { name: 'not-found' };
}

export function navigate(path) {
  if (typeof window === 'undefined') return;

  const nextUrl = normalizeUrl(path);
  const currentUrl = normalizeUrl(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  if (nextUrl === currentUrl) return;

  window.history.pushState({}, '', nextUrl);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function NavLink({ href, children, className = '', active = false, ...props }) {
  const handleClick = (event) => {
    if (typeof props.onClick === 'function') {
      props.onClick(event);
    }
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigate(href);
  };

  const anchorProps = {
    ...props,
    href: normalizeUrl(href),
    className,
    'aria-current': active ? 'page' : props['aria-current'],
    onClick: handleClick
  };

  return React.createElement('a', anchorProps, children);
}
