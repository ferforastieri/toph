import BrandMark from "@toph/brand";

/** First paint on mobile while the session is restored. No connection screen. */
export default function MobileBoot() {
  return (
    <div
      className="flex h-dvh flex-col bg-background-full"
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "var(--safe-bottom)",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
      }}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 px-4">
        <BrandMark size="small" />
        <div className="h-3 w-24 animate-pulse rounded-full bg-background-tertiary-default/70" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="h-20 animate-pulse rounded-3xl bg-background-secondary-default" />
        <div className="h-28 animate-pulse rounded-3xl bg-background-secondary-default" />
        <div className="h-36 animate-pulse rounded-3xl bg-background-secondary-default" />
      </div>
      <div className="shrink-0 p-3">
        <div className="h-24 animate-pulse rounded-3xl border border-border-button-default bg-background-secondary-default" />
      </div>
    </div>
  );
}
