import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { HashRouter } from "react-router-dom";
import { App } from "./ui/app/App";
import { Toaster } from "./ui/shared/Toaster";
import { UpdateBanner } from "./ui/updates/UpdateBanner";
import { DefenderBanner } from "./ui/updates/DefenderBanner";
import { WhatsNewModal } from "./ui/updates/WhatsNewModal";
import { BannerProvider } from "./ui/shared/banners/BannerContext";
import { AppBanners } from "./ui/shared/banners/AppBanners";
import { store } from "./store/store";
import "./ui/styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <BannerProvider>
          <App />
          <Toaster />
          <UpdateBanner />
          <DefenderBanner />
          <WhatsNewModal />
          <AppBanners />
        </BannerProvider>
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
