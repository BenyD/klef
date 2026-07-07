import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  KeyRound,
  LifeBuoy,
  Lock,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { signOut } from "../auth.ts";
import { clearDek } from "../dek-store.ts";
import { useFieldValidation } from "../lib/use-field-validation.ts";
import { useVault } from "../vault-context.ts";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field.tsx";
import { PasswordInput } from "./ui/password-input.tsx";
import { StrengthMeter } from "./StrengthMeter.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

const STEPS = ["welcome", "passphrase", "recovery"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  passphrase: "Passphrase",
  recovery: "Recovery",
};

const schema = z
  .object({
    passphrase: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.passphrase === d.confirm, {
    message: "Passphrases don't match",
    path: ["confirm"],
  });

export function Onboarding() {
  const { runSetup, finishSetup } = useVault();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const validation = useFieldValidation<"passphrase" | "confirm">(schema);
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [saved, setSaved] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (
      !validation.validateAll({ passphrase, confirm }, ["passphrase", "confirm"])
    ) {
      return;
    }
    setBusy(true);
    try {
      setRecoveryKey(await runSetup(passphrase));
      setStep("recovery");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    void navigator.clipboard?.writeText(recoveryKey);
    toast.success("Recovery key copied");
  }

  function download() {
    const blob = new Blob(
      [
        `Klef recovery key\n\n${recoveryKey}\n\n`,
        "Keep this somewhere safe and private. It is the ONLY way back into your\n",
        "vault if you forget your passphrase. Klef cannot recover it for you.\n",
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "klef-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Recovery key downloaded");
  }

  async function onSignOut() {
    await clearDek();
    await signOut();
    navigate("/");
  }

  return (
    <div className="klef-screen relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <WorkbenchBackdrop />
      <div className="bg-background/70 absolute inset-0" aria-hidden="true" />

      <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => void onSignOut()}
        >
          <LogOut />
          Sign out
        </Button>
      </div>

      <div className="bg-card relative z-10 flex w-full max-w-2xl overflow-hidden rounded-xl border">
        <aside className="bg-muted/40 hidden w-56 shrink-0 flex-col gap-8 border-r p-6 sm:flex">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg">
              <KeyRound className="size-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Klef</span>
          </div>

          <ol className="flex flex-col">
            {STEPS.map((s, i) => {
              const done = i < stepIndex;
              const current = i === stepIndex;
              const last = i === STEPS.length - 1;
              return (
                <li key={s} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                        done
                          ? "bg-primary text-primary-foreground"
                          : current
                            ? "border-primary text-foreground border-2"
                            : "border-border text-muted-foreground border"
                      }`}
                    >
                      {done ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    {!last && (
                      <span
                        className={`my-1 w-px flex-1 transition-colors ${
                          done ? "bg-primary" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                  <span
                    className={`pt-0.5 text-sm transition-colors ${
                      last ? "" : "pb-6"
                    } ${
                      current
                        ? "text-foreground font-medium"
                        : done
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                    aria-current={current ? "step" : undefined}
                  >
                    {STEP_LABELS[s]}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="flex-1 p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between sm:hidden">
            <div className="flex items-center gap-2">
              <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
                <KeyRound className="size-3.5" />
              </div>
              <span className="text-sm font-semibold tracking-tight">Klef</span>
            </div>
            <span className="text-muted-foreground text-xs">
              Step {stepIndex + 1} of {STEPS.length}
            </span>
          </div>

          <StepViewport>
          <div key={step} className="klef-step">
          {step === "welcome" && (
            <WelcomeStep onNext={() => setStep("passphrase")} />
          )}

          {step === "passphrase" && (
            <form onSubmit={onCreate} noValidate>
              <StepHeader
                title="Create your master passphrase"
                description="This encrypts your vault. It's separate from your login password and never leaves this device."
              />
              <FieldGroup className="mt-5">
                <Field>
                  <FieldLabel htmlFor="passphrase">Master passphrase</FieldLabel>
                  <PasswordInput
                    id="passphrase"
                    autoComplete="new-password"
                    aria-invalid={!!validation.errors.passphrase}
                    value={passphrase}
                    onChange={(e) => {
                      setPassphrase(e.target.value);
                      validation.change({ passphrase: e.target.value, confirm });
                    }}
                    onBlur={() =>
                      validation.blur("passphrase", { passphrase, confirm })
                    }
                    autoFocus
                  />
                  <StrengthMeter value={passphrase} />
                  {validation.errors.passphrase && (
                    <FieldError>{validation.errors.passphrase}</FieldError>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm">Confirm passphrase</FieldLabel>
                  <PasswordInput
                    id="confirm"
                    autoComplete="new-password"
                    aria-invalid={!!validation.errors.confirm}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      validation.change({ passphrase, confirm: e.target.value });
                    }}
                    onBlur={() =>
                      validation.blur("confirm", { passphrase, confirm })
                    }
                  />
                  {validation.errors.confirm && (
                    <FieldError>{validation.errors.confirm}</FieldError>
                  )}
                </Field>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep("welcome")}
                    disabled={busy}
                  >
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={busy}>
                    {busy ? "Creating your vault..." : "Continue"}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          )}

          {step === "recovery" && (
            <div>
              <StepHeader
                title="Save your recovery key"
                description="Shown once. It's the only way back if you forget your passphrase. Klef can't recover it for you."
              />
              <div className="mt-5 flex flex-col gap-4">
                <pre className="bg-muted rounded-md border p-4 text-center font-mono text-sm tracking-wide break-all whitespace-pre-wrap">
                  {recoveryKey}
                </pre>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={copy}
                  >
                    <Copy />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={download}
                  >
                    <Download />
                    Download
                  </Button>
                </div>
                <label className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={saved}
                    onCheckedChange={(checked) => setSaved(checked === true)}
                  />
                  <span>I've saved my recovery key.</span>
                </label>
                <Button
                  className="w-full"
                  disabled={!saved}
                  onClick={finishSetup}
                >
                  <Check />
                  Enter Klef
                </Button>
              </div>
            </div>
          )}
          </div>
          </StepViewport>
        </div>
      </div>
    </div>
  );
}

// Animates the card height as steps swap (and as validation errors or the
// strength meter appear), instead of snapping. Content is measured, so the
// transition tracks anything that changes the step's natural height.
function StepViewport({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      style={{ height }}
      className="overflow-y-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
    >
      {/* pb-1 keeps bottom focus rings clear of the clip edge. */}
      <div ref={inner} className="pb-1">
        {children}
      </div>
    </div>
  );
}

function StepHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col">
      <StepHeader
        title="Welcome to Klef"
        description="Let's set up your encrypted vault. It takes about a minute."
      />
      <div className="mt-6 flex flex-col gap-4">
        <Point
          icon={<Lock className="size-4" />}
          title="Encrypted in your browser"
          body="Klef's servers only ever store ciphertext. Your secrets are encrypted before they leave this device."
        />
        <Point
          icon={<KeyRound className="size-4" />}
          title="A passphrase only you know"
          body="It's separate from your login and never leaves your browser. Klef never sees it."
        />
        <Point
          icon={<LifeBuoy className="size-4" />}
          title="A recovery key as backup"
          body="Your only way back in if you forget your passphrase. We can't reset it for you."
        />
      </div>
      <Button className="mt-7 w-full" onClick={onNext}>
        Set up your vault
        <ArrowRight />
      </Button>
    </div>
  );
}

function Point({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="bg-muted text-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md">
        {icon}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>
    </div>
  );
}

// Decorative, blurred hint of the workbench behind the modal, so onboarding
// feels like the last step before entering the app. Non-interactive.
function WorkbenchBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none opacity-40 blur-sm"
    >
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="bg-primary/80 size-6 rounded-md" />
        <div className="bg-muted h-6 w-24 rounded-md" />
        <div className="text-muted-foreground/40">/</div>
        <div className="bg-muted h-6 w-20 rounded-md" />
        <div className="text-muted-foreground/40">/</div>
        <div className="bg-muted h-6 w-16 rounded-md" />
        <div className="ml-auto flex gap-2">
          <div className="bg-muted size-6 rounded-md" />
          <div className="bg-muted size-6 rounded-md" />
        </div>
      </div>
    </div>
  );
}
