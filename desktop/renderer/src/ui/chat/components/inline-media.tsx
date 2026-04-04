import { useEffect, useState } from "react";
import { getDesktopApiOrNull } from "@ipc/desktopApi";

const inlineMediaSrcCache = new Map<string, string>();

export function useInlineMediaSrc(params: { dataUrl?: string; filePath?: string }) {
  const { dataUrl, filePath } = params;
  const [resolvedSrc, setResolvedSrc] = useState<string>(() => {
    if (dataUrl) {
      return dataUrl;
    }
    if (filePath) {
      return inlineMediaSrcCache.get(filePath) ?? "";
    }
    return "";
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dataUrl) {
      setResolvedSrc(dataUrl);
      setError(null);
      return;
    }

    if (!filePath) {
      setResolvedSrc("");
      setError(null);
      return;
    }

    const cachedSrc = inlineMediaSrcCache.get(filePath);
    if (cachedSrc) {
      setResolvedSrc(cachedSrc);
      setError(null);
      return;
    }

    let cancelled = false;
    const api = getDesktopApiOrNull();
    if (!api || typeof api.readFileDataUrl !== "function") {
      setResolvedSrc("");
      setError("Desktop media bridge unavailable.");
      return;
    }

    setResolvedSrc("");
    setError(null);

    void api.readFileDataUrl(filePath).then((result) => {
      if (cancelled) {
        return;
      }
      if ("error" in result) {
        setResolvedSrc("");
        setError(result.error);
        return;
      }
      inlineMediaSrcCache.set(filePath, result.dataUrl);
      setResolvedSrc(result.dataUrl);
      setError(null);
    });

    return () => {
      cancelled = true;
    };
  }, [dataUrl, filePath]);

  return { src: resolvedSrc, error };
}
