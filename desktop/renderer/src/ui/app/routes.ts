export const routes = {
  consent: "/consent",
  loading: "/loading",
  error: "/error",
  installOpenclaw: "/install-openclaw",
  welcome: "/welcome",
  legacy: "/legacy",
  chat: "/chat",
  settings: "/settings",
  terminal: "/terminal",
  skills: "/skills",
  models: "/models",
} as const;

export function isBootstrapPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === routes.consent ||
    pathname === routes.loading ||
    pathname === routes.error ||
    pathname === routes.installOpenclaw ||
    pathname === routes.welcome ||
    pathname.startsWith(`${routes.welcome}/`)
  );
}
