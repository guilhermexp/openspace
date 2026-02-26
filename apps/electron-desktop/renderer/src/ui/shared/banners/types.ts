import type React from "react";

export type BannerItem = {
  id: string;
  variant: "warning" | "info" | "success" | "error";
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  /** "session" = dismiss until next app launch; "persistent" = dismiss forever (localStorage). */
  dismissible?: "session" | "persistent";
};
