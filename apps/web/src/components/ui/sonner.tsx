import { CircleCheck, Info, TriangleAlert, CircleAlert, RefreshCw } from "@toph/icons"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useSettings } from "@/settings"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useSettings((state) => state.theme)
  return (
    <Sonner
      theme={theme === "light" ? "light" : "dark"}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <CircleAlert className="size-4" />,
        loading: <RefreshCw className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
