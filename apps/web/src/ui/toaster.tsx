import { Toaster as Sonner } from "sonner";
import { useSettings } from "../settings";

export function Toaster() {
  const theme = useSettings((state) => state.theme);
  return <Sonner theme={theme === "light" ? "light" : "dark"} position="bottom-right" richColors closeButton />;
}
