import React from "react";
import { useArtifact } from "../context/ArtifactContext";
import { clampArtifactPanelWidth } from "./artifact-preview";
import styles from "./ArtifactPanel.module.css";

export function ArtifactDivider({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { setPanelWidth } = useArtifact();
  const [isDragging, setIsDragging] = React.useState(false);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  const stopDragging = React.useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsDragging(false);
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
  }, []);

  React.useEffect(() => stopDragging, [stopDragging]);

  const handleMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) {
          return;
        }
        const nextWidth = rect.right - moveEvent.clientX;
        setPanelWidth(clampArtifactPanelWidth(nextWidth, rect.width));
      };

      const handleMouseUp = () => {
        stopDragging();
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      cleanupRef.current = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    },
    [containerRef, setPanelWidth, stopDragging]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={`${styles.ArtifactDivider} ${isDragging ? styles["ArtifactDivider--active"] : ""}`}
      onMouseDown={handleMouseDown}
    />
  );
}
