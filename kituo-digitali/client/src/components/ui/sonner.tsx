import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme="dark"
      richColors
      closeButton
      position="top-center"
      offset={90}
      className="toaster group"
      style={
        {
          "--normal-bg": "#172033",
          "--normal-text": "#ffffff",
          "--normal-border": "#475569",
          "--success-bg": "#14532d",
          "--success-text": "#ffffff",
          "--success-border": "#22c55e",
          "--error-bg": "#7f1d1d",
          "--error-text": "#ffffff",
          "--error-border": "#ef4444",
          "--warning-bg": "#78350f",
          "--warning-text": "#ffffff",
          "--warning-border": "#f59e0b",
          "--info-bg": "#1e3a8a",
          "--info-text": "#ffffff",
          "--info-border": "#60a5fa",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
