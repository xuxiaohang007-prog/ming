import { HTMLAttributes } from "react";

type GlassPanelProps = HTMLAttributes<HTMLDivElement> & {
  accent?: "gold" | "aurora";
};

export function GlassPanel({
  className = "",
  accent = "gold",
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={`paper-panel panel-${accent} ${className}`.trim()}
      {...props}
    />
  );
}
