import { usePet, PET_OPTIONS } from "../pet";
import PetSprite from "../ui/PetSprite";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";

export default function PetPicker() {
  const username = usePet((state) => state.username);
  const loaded = usePet((state) => state.loaded);
  const chosen = usePet((state) => state.chosen);
  const enabled = usePet((state) => state.enabled);
  const kind = usePet((state) => state.kind);
  const choose = usePet((state) => state.choose);
  const disable = usePet((state) => state.disable);

  if (!loaded || !username || chosen) return null;

  return (
    <Modal
      isOpen
      onClose={disable}
      title="Escolha seu pet"
      description="Ele vai morar no seu avatar e crescer com os seus commits."
      size="lg"
      footer={<Button variant="secondary" onClick={disable}>Continuar sem pet</Button>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PET_OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            onClick={() => choose(option.kind)}
            className={cx(
              "group flex items-center gap-3 rounded-2xl border p-3 text-start transition-all",
              enabled && kind === option.kind
                ? "border-accent-500 bg-accent-500/10 shadow-xs"
                : "border-border-button-default bg-background-secondary-default/40 hover:-translate-y-0.5 hover:border-accent-500/50 hover:bg-background-primary-hover",
            )}
          >
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-background-primary-default">
              <PetSprite kind={option.kind} size={58} />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <strong className="text-body-medium text-text-primary">{option.name}</strong>
              <span className="text-caption-1-regular leading-relaxed text-text-secondary">{option.description}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 rounded-xl border border-border-button-default bg-background-secondary-default/50 px-3 py-2 text-caption-1-regular text-text-secondary">
        Cada commit alimenta o pet. A cada 3 commits ele cresce e ganha uma estrela.
      </p>
    </Modal>
  );
}
