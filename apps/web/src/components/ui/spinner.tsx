import { cn } from "@/lib/utils"
import { LoaderCircle } from "@toph/icons"

function Spinner({ className, ...props }: React.ComponentProps<typeof LoaderCircle>) {
  return (
    <LoaderCircle
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
