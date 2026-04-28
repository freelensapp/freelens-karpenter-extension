/**
 * LoadingSkeleton.tsx — animated placeholder while data is loading.
 */
import React from "react";
import { TIMING } from "../../config/theme";

interface SkeletonLineProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

/** Single animated skeleton line / block */
export function SkeletonLine({
  width = "100%",
  height = 14,
  borderRadius = 4,
  style,
}: SkeletonLineProps) {
  return (
    <span
      style={{
        display: "block",
        width,
        height,
        borderRadius,
        background: "linear-gradient(90deg, rgba(128,128,128,0.08) 25%, rgba(128,128,128,0.18) 50%, rgba(128,128,128,0.08) 75%)",
        backgroundSize: "200% 100%",
        animation: `skeletonPulse ${TIMING.skeletonPulse} ease-in-out infinite`,
        ...style,
      }}
    />
  );
}

/** Full-card loading skeleton — replaces a KarpenterCard while data arrives */
export function CardLoadingSkeleton() {
  return (
    <>
      <style>{`
        @keyframes skeletonPulse {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div
        style={{
          border: "1px solid var(--borderColor, #2d2d2d)",
          borderLeft: "4px solid rgba(128,128,128,0.2)",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--contentColor, #13161b)",
        }}
      >
        {/* Top row */}
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            borderBottom: "1px solid var(--borderColor, #2d2d2d)",
            background: "var(--layoutTabsBackground, #1a1d22)",
            padding: "14px 20px 12px",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            <SkeletonLine width={180} height={22} />
            <SkeletonLine width={300} height={14} />
          </div>
          <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
            <SkeletonLine height={8} borderRadius={4} />
            <SkeletonLine height={8} borderRadius={4} />
          </div>
        </div>
        {/* Body */}
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <SkeletonLine height={10} width={80} />
          {[1, 2, 3].map((i) => (
            <SkeletonLine key={i} height={32} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Inline spinner for small loading states */
export function Spinner({ size = 16, color = "var(--colorInfo,#6ab0d4)" }: { size?: number; color?: string }) {
  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <span
        style={{
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid rgba(128,128,128,0.2)`,
          borderTopColor: color,
          animation: "spin 0.7s linear infinite",
          flexShrink: 0,
        }}
      />
    </>
  );
}

interface PageLoadingProps {
  message?: string;
  description?: string;
  preview?: React.ReactNode;
}

/** Full-page loading overlay */
export function PageLoading({ message = "Loading...", description, preview }: PageLoadingProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        minHeight: 420,
        padding: "56px 32px",
        color: "var(--textColorSecondary, #888)",
        fontSize: 14,
        textAlign: "center",
      }}
    >
      <style>{`
        @keyframes skeletonPulse {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <Spinner size={30} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <strong style={{ color: "var(--textColorPrimary, #fff)", fontSize: 18, fontWeight: 700 }}>
            {message}
          </strong>
          {description && (
            <span style={{ color: "var(--textColorSecondary, #888)", fontSize: 13, lineHeight: 1.5 }}>
              {description}
            </span>
          )}
        </div>
      </div>
      {preview}
    </div>
  );
}

function KarpenterLoadingPreview() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: "min(760px, 100%)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        opacity: 0.9,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {[120, 92, 108].map((width, index) => (
          <div
            key={index}
            style={{
              border: "1px solid var(--borderColor, #2d2d2d)",
              borderRadius: 8,
              background: "var(--contentColor, #13161b)",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <SkeletonLine width={width} height={12} />
            <SkeletonLine width={52} height={24} borderRadius={5} />
          </div>
        ))}
      </div>
      <div
        style={{
          border: "1px solid var(--borderColor, #2d2d2d)",
          borderRadius: 8,
          background: "var(--contentColor, #13161b)",
          overflow: "hidden",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "14px 16px",
            borderBottom: "1px solid var(--borderColor, #2d2d2d)",
            background: "var(--layoutTabsBackground, #1a1d22)",
          }}
        >
          <SkeletonLine width={150} height={18} />
          <SkeletonLine width={88} height={18} borderRadius={10} style={{ marginLeft: "auto" }} />
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((row) => (
            <SkeletonLine key={row} height={36} borderRadius={6} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function KarpenterPageLoading() {
  return (
    <PageLoading
      message="Loading Karpenter data"
      description="Discovering NodePools, nodes, and NodeClasses..."
      preview={<KarpenterLoadingPreview />}
    />
  );
}
