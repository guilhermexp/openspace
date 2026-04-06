import { useBanners } from "./BannerContext";
import { BannerCarousel } from "./BannerCarousel";

export function AppBanners() {
  const banners = useBanners();

  return <BannerCarousel items={banners} />;
}
