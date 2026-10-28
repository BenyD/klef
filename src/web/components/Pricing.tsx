import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import { MarketingLayout, GitHubIcon } from "./MarketingLayout.tsx";
import {
  EARLY,
  KIT_UPDATE_MONTHS,
  PLANS,
  TRIAL_DAYS,
  formatUsd,
  planById,
  type Plan,
  type ReservablePlanId,
} from "../../shared/plans.ts";
import {
  cancelReservation,
  fetchReservation,
  reservePlan,
  type ReservationState,
} from "../reservation-api.ts";

// /pricing: two one-time plans and Team announced with no price. Hosted runs
// on klef.sh; the self-host kit runs the closed server on the buyer's own
// Cloudflare account. The CLI and the encryption are open source (MIT).
// Neither paid plan is open yet: a signed-in person can reserve one, and
// nothing is charged. Prerendered, so nothing here touches the browser at
// render time; the reservation state loads in an effect.

const GITHUB = "https://github.com/BenyD/klef";
const HOSTED_PRICE = planById("hosted").price ?? 0;

const STATUS_LABEL: Record<Plan["status"], string> = {
  early: "Early access",
  soon: "Opening soon",
  coming: "Coming soon",
};

const PLAN_NAME: Record<ReservablePlanId, string> = {
  hosted: "Hosted",
  kit: "the self-host kit",
};

export function Pricing() {
  const reservation = useReservation();

  return (
    <MarketingLayout>
      <main className="m-main">
        <header className="m-wrap m-page-head">
          <p className="m-label">Pricing</p>
          <h1>Pay once. Use it for good.</h1>
          <p className="m-lede" style={{ fontSize: 18 }}>
            No subscriptions. Let us host Klef for you, or run it on your own
            Cloudflare account with the self-host kit. Every new account gets{" "}
            {TRIAL_DAYS} days free first.
          </p>
        </header>

        <section className="m-wrap" aria-label="Plans">
          <div className="m-plans">
            {PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} reservation={reservation} />
            ))}
          </div>
          <p className="m-plans-note">
            Paid plans are not open yet, and until they are every account is free
            with everything. Reserve one now: nothing is charged until it opens,
            and you can cancel or switch before then. Prices in US dollars.
          </p>
        </section>

        <section className="m-wrap m-section" aria-labelledby="open-title">
          <div className="m-promise">
            <div>
              <p className="m-label">Open where it counts</p>
              <h2 id="open-title" className="m-h2">
                The code that touches your secrets is open source.
              </h2>
              <p>
                The CLI and the encryption are MIT licensed. Read them and check
                that your files are encrypted on your device and that the server
                only ever stores ciphertext. The server itself is closed, and the
                self-host kit is how you run your own.
              </p>
              <a href={GITHUB} target="_blank" rel="noreferrer" className="m-btn m-btn-line">
                <GitHubIcon />
                Read the code
              </a>
            </div>
            <div>
              <p className="m-label">On every plan, and during the trial</p>
              <ul className="m-checks">
                {ALWAYS.map((item) => (
                  <li key={item}>
                    <Check aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="m-wrap m-section" aria-labelledby="pricing-faq-title" style={{ paddingBottom: 96 }}>
          <h2 id="pricing-faq-title" className="m-h2" style={{ marginBottom: 24 }}>
            Questions
          </h2>
          <div className="m-faq">
            {FAQ.map((item, i) => (
              <details key={item.q} className="m-faq-item" open={i === 0}>
                <summary>
                  {item.q}
                  <span className="m-faq-icon" aria-hidden="true" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}

const ALWAYS = [
  "End-to-end encryption",
  "Exporting your files, at any time",
  "The open-source CLI",
  "Everything you have already stored",
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Is it really one payment?",
    a: (
      <>
        Yes. Hosted and the self-host kit are each paid once, with no
        subscription and no renewal.
      </>
    ),
  },
  {
    q: "What happens when the trial ends?",
    a: (
      <>
        {`After ${TRIAL_DAYS} days you can still sign in, read, pull and export everything you stored. Saving new versions needs Hosted or the kit. Nothing is ever deleted for not paying.`}
      </>
    ),
  },
  {
    q: "When will I be charged?",
    a: (
      <>
        Not until paid plans open, and not without you choosing to pay then. A
        reservation holds a price; it is not a payment. You will get an email
        before anything changes.
      </>
    ),
  },
  {
    q: "What is the early price?",
    a: (
      <>
        {`Hosted for ${formatUsd(EARLY.price)} instead of ${formatUsd(HOSTED_PRICE)}, for the first ${EARLY.spots} people who reserve it. It goes by when you first reserved, so switching to the kit and back keeps your place.`}
      </>
    ),
  },
  {
    q: "What is in the self-host kit?",
    a: (
      <>
        {`The Klef server, built for Cloudflare Workers and D1, with one command that creates the database, sets the secrets and deploys, and one that applies updates. ${KIT_UPDATE_MONTHS} months of updates are included, and the kit keeps working after that.`}
      </>
    ),
  },
  {
    q: "Why is the server not open source?",
    a: (
      <>
        It only ever sees ciphertext, so its code is not what you have to
        trust. The parts that are, the CLI and the encryption, stay open. Keeping
        the server closed is how klef.sh pays for itself.
      </>
    ),
  },
  {
    q: "What if klef.sh shuts down?",
    a: (
      <>
        You get notice and time to export, and everyone with Hosted gets the
        self-host kit free, so you can keep running Klef yourself.
      </>
    ),
  },
  {
    q: "What about teams?",
    a: (
      <>
        Shared projects for small teams are planned, still end-to-end
        encrypted. There is no price or date yet, and nothing to reserve.
      </>
    ),
  },
  {
    q: "What does a reservation store?",
    a: (
      <>
        Which plan you reserved and when, tied to your account. It is deleted
        when you cancel it or delete your account.{" "}
        <Link to="/privacy">Privacy</Link>.
      </>
    ),
  },
];

/** "loading" until the browser asks; the prerendered page shows the signed-out button. */
type Loaded = { kind: "loading" } | ReservationState | { kind: "error"; message: string };

interface ReservationControls {
  state: Loaded;
  busy: boolean;
  reserve: (plan: ReservablePlanId) => void;
  cancel: () => void;
}

function useReservation(): ReservationControls {
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetchReservation()
      .then((s) => live && setState(s))
      .catch(() => live && setState({ kind: "signedOut" }));
    return () => {
      live = false;
    };
  }, []);

  const run = (action: () => Promise<ReservationState>) => {
    setBusy(true);
    action()
      .then(setState)
      .catch((e: unknown) =>
        setState({ kind: "error", message: e instanceof Error ? e.message : String(e) }),
      )
      .finally(() => setBusy(false));
  };

  return {
    state,
    busy,
    reserve: (plan) => run(() => reservePlan(plan)),
    cancel: () => run(cancelReservation),
  };
}

function PlanCard({ plan, reservation }: { plan: Plan; reservation: ReservationControls }) {
  const featured = plan.id === EARLY.plan;

  return (
    <article className={featured ? "m-plan m-plan-featured" : "m-plan"} aria-labelledby={`plan-${plan.id}`}>
      <div className="m-plan-head">
        <h2 id={`plan-${plan.id}`}>{plan.name}</h2>
        <span className="m-plan-status">{STATUS_LABEL[plan.status]}</span>
      </div>
      <p className="m-plan-audience">{plan.audience}</p>

      {plan.price === null ? (
        <p className="m-price m-price-none">
          <span>No price yet</span>
        </p>
      ) : (
        <>
          <p className="m-price">
            <b>{formatUsd(plan.price)}</b>
            <span>once</span>
          </p>
          <p className="m-price-sub">No subscription. No renewals.</p>
        </>
      )}

      {featured && (
        <p className="m-early">
          <b>{`Early price: ${formatUsd(EARLY.price)}.`}</b>{" "}
          {`For the first ${EARLY.spots} people who reserve.`}
        </p>
      )}

      <ul className="m-checks">
        {plan.features.map((f) => (
          <li key={f}>
            <Check aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>

      <div className="m-plan-action">
        {plan.id === "team" ? (
          <p className="m-plan-msg m-plan-later">Planned. Nothing to reserve yet.</p>
        ) : (
          <ReserveAction plan={plan.id} controls={reservation} />
        )}
      </div>
    </article>
  );
}

function ReserveAction({ plan, controls }: { plan: ReservablePlanId; controls: ReservationControls }) {
  const { state, busy, reserve, cancel } = controls;
  const ink = plan === EARLY.plan;
  const cta = plan === "hosted" ? `Reserve at ${formatUsd(EARLY.price)}` : "Reserve the kit";
  const className = ink ? "m-btn m-btn-ink" : "m-btn m-btn-line";

  if (state.kind === "loading" || state.kind === "signedOut") {
    return (
      <Link to="/auth" state={{ from: "/pricing" }} className={className}>
        {cta}
      </Link>
    );
  }

  if (state.kind === "error") {
    return (
      <p className="m-plan-msg" role="alert">
        Could not save that: {state.message}
      </p>
    );
  }

  const current = state.reservation?.plan ?? null;

  if (current === plan) {
    return (
      <div className="m-reserved" aria-live="polite">
        <p className="m-plan-msg">
          <Check aria-hidden="true" />
          Reserved. Nothing is charged until it opens.
        </p>
        <button type="button" className="m-link-btn" onClick={cancel} disabled={busy}>
          Cancel reservation
        </button>
      </div>
    );
  }

  return (
    <button type="button" className={className} onClick={() => reserve(plan)} disabled={busy}>
      {current ? `Switch to ${PLAN_NAME[plan]}` : cta}
    </button>
  );
}
