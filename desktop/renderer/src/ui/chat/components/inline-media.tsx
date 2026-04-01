import { useEffect, useState } from "react";
import { getDesktopApiOrNull } from "@ipc/desktopApi";

export function useInlineMediaSrc(params: { dataUrl?: string; filePath?: string }) {
  const { dataUrl, filePath } = params;
  const [resolvedSrc, setResolvedSrc] = useState<string>(dataUrl ?? "");
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

    let cancelled = false;
    const api = getDesktopApiOrNull();
    if (!api || typeof api.readFileDataUrl !== "function") {
      if (import.meta.env.DEV) {
        console.error("[inline-media] desktop bridge unavailable", { filePath });
      }
      setResolvedSrc("");
      setError("Desktop media bridge unavailable.");
      return;
    }

    setResolvedSrc("");
    setError(null);
    if (import.meta.env.DEV) {
      console.log("[inline-media] resolving file via IPC", { filePath });
    }

    void api.readFileDataUrl(filePath).then((result) => {
      if (cancelled) {
        return;
      }
      if ("error" in result) {
        if (import.meta.env.DEV) {
          console.error("[inline-media] failed to resolve media", {
            filePath,
            error: result.error,
          });
        }
        setResolvedSrc("");
        setError(result.error);
        return;
      }
      if (import.meta.env.DEV) {
        console.log("[inline-media] resolved media", {
          filePath,
          mimeType: result.mimeType,
          dataUrlLength: result.dataUrl.length,
        });
      }
      setResolvedSrc(result.dataUrl);
      setError(null);
    });

    return () => {
      cancelled = true;
    };
  }, [dataUrl, filePath]);

  return { src: resolvedSrc, error };
}
