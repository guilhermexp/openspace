export const routes = {
  loading: "/loading",
  error: "/error",
  welcome: "/welcome",
  legacy: "/legacy",
  chat: "/chat",
  settings: "/settings",
} as const;

export function isBootstrapPath(pathname: string): boolean {
  return pathname === "/" || pathname === routes.loading || pathname === routes.error;
}

