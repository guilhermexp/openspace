import { useBanners } from "./BannerContext";
import { BannerCarousel } from "./BannerCarousel";
import { SubscriptionBannerSource } from "./SubscriptionBannerSource";

export function AppBanners() {
  const banners = useBanners();

  return (
    <>
      {/* Banner sources (renderless — they only register/unregister banners) */}
      <SubscriptionBannerSource />

      {/* Carousel UI */}
      <BannerCarousel items={banners} />
    </>
  );
}
