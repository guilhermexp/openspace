import React from "react";
import { getDesktopApi } from "@ipc/desktopApi";
import { isTextArtifactPath } from "../components/artifact-preview";

type ArtifactContextValue = {
  filePath: string | null;
  fileContent: string | null;
  loading: boolean;
  error: string | null;
  panelWidth: number;
  openArtifact: (filePath: string) => Promise<void>;
  closeArtifact: () => void;
  setPanelWidth: (width: number) => void;
};

const DEFAULT_PANEL_WIDTH = 520;

const ArtifactContext = React.createContext<ArtifactContextValue | null>(null);

export function ArtifactProvider({ children }: { children: React.ReactNode }) {
  const [filePath, setFilePath] = React.useState<string | null>(null);
  const [fileContent, setFileContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [panelWidth, setPanelWidthState] = React.useState(DEFAULT_PANEL_WIDTH);
  const requestIdRef = React.useRef(0);

  const closeArtifact = React.useCallback(() => {
    requestIdRef.current += 1;
    setFilePath(null);
    setFileContent(null);
    setLoading(false);
    setError(null);
  }, []);

  const setPanelWidth = React.useCallback((width: number) => {
    setPanelWidthState(Math.max(300, Math.round(width)));
  }, []);

  const openArtifact = React.useCallback(async (nextFilePath: string) => {
    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;

    setLoading(true);
    setFileContent(null);
    setError(null);

    let resolvedFilePath = nextFilePath;
    try {
      const resolved = await getDesktopApi().resolveFilePath(nextFilePath);
      if (requestIdRef.current !== nextRequestId) {
        return;
      }
      if ("error" in resolved) {
        setError(resolved.error);
        setLoading(false);
        setFilePath(nextFilePath);
        return;
      }
      resolvedFilePath = resolved.path;
    } catch (caughtError) {
      if (requestIdRef.current !== nextRequestId) {
        return;
      }
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to resolve file path.";
      setError(message);
      setLoading(false);
      setFilePath(nextFilePath);
      return;
    }

    setFilePath(resolvedFilePath);
    setError(null);

    if (!isTextArtifactPath(resolvedFilePath)) {
      setFileContent(null);
      setLoading(false);
      return;
    }

    try {
      const result = await getDesktopApi().readFileText(resolvedFilePath);
      if (requestIdRef.current !== nextRequestId) {
        return;
      }
      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setFileContent(result.content);
      setLoading(false);
    } catch (caughtError) {
      if (requestIdRef.current !== nextRequestId) {
        return;
      }
      const message = caughtError instanceof Error ? caughtError.message : "Unable to read file.";
      setError(message);
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!filePath) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeArtifact();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeArtifact, filePath]);

  const value = React.useMemo<ArtifactContextValue>(
    () => ({
      filePath,
      fileContent,
      loading,
      error,
      panelWidth,
      openArtifact,
      closeArtifact,
      setPanelWidth,
    }),
    [closeArtifact, error, fileContent, filePath, loading, openArtifact, panelWidth, setPanelWidth]
  );

  return <ArtifactContext.Provider value={value}>{children}</ArtifactContext.Provider>;
}

export function useArtifact(): ArtifactContextValue {
  const value = React.useContext(ArtifactContext);
  if (!value) {
    throw new Error("useArtifact must be used within an ArtifactProvider");
  }
  return value;
}
