import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import { MarketingLayout } from "./MarketingLayout.tsx";
import {
  FOUNDING,
  FREE_HISTORY_DAYS,
  FREE_PROJECTS,
  PLANS,
  formatUsd,
  monthsFreeYearly,
  type PaidPlanId,
  type Plan,
} from "../../shared/plans.ts";
import {
  cancelReservation,
  fetchReservation,
  reservePlan,
  type ReservationState,
} from "../reservation-api.ts";

// /pricing: the plans, shown before any paid plan exists. Pro is a pre-sale
// and Team is coming; both can be reserved by a signed-in person, and neither
// charges anything. Prerendered, so nothing here touches the browser at render
// time: the reservation state loads in an effect.

const STATUS_LABEL: Record<Plan["status"], string | null> = {
  available: null,
  presale: "Founding pre-sale",
  coming: "Coming soon",
};

export function Pricing() {
  const reservation = useReservation();

  return (
    <MarketingLayout>
      <main className="m-main">
        <header className="m-wrap m-page-head">
          <p className="m-label">Pricing</p>
          <h1>Free for one developer. Pay when you want more.</h1>
          <p className="m-lede" style={{ fontSize: 18 }}>
            Paid plans are not open yet. Reserve one now to lock in the founding
            price. Nothing is charged until they open, and you can cancel before
            then.
          </p>
        </header>

        <section className="m-wrap" aria-label="Plans">
          <div className="m-plans">
            {PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} reservation={reservation} />
            ))}
          </div>
          <p className="m-plans-note">
            Today every account has everything in Pro. The Free limits of{" "}
            {FREE_PROJECTS} projects and {FREE_HISTORY_DAYS} days of history start
            when paid plans open, with at least 30 days of notice, and nothing you
            have stored is deleted. Prices in US dollars.
          </p>
        </section>

        <section className="m-wrap m-section" aria-labelledby="self-host-title">
          <div className="m-promise">
            <div>
              <p className="m-label">A promise</p>
              <h2 id="self-host-title" className="m-h2">
                Self-hosting is free forever.
              </h2>
              <p>
                Every feature, no licence key, no limits. Klef is AGPL-3.0 and
                deploys to your own Cloudflare account. The plans above pay for
                running klef.sh, not for unlocking the code.
              </p>
              <Link to="/docs/guides/self-hosting" className="m-btn m-btn-line">
                Self-host Klef
              </Link>
            </div>
            <div>
              <p className="m-label">Never behind a paywall</p>
              <ul className="m-checks">
                {NEVER_PAID.map((item) => (
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

const NEVER_PAID = [
  "End-to-end encryption",
  "The CLI, klef run and klef audit",
  "Agent setup for Claude Code and Cursor",
  "Exporting your files",
  "Everything you have already stored",
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "When will I be charged?",
    a: (
      <>
        Not until paid plans open, and not without you choosing to pay then.
        A reservation is a promise of a price, not a payment. You will get an
        email before anything changes.
      </>
    ),
  },
  {
    q: "What is the founding price?",
    a: (
      <>
        Pro for {formatUsd(FOUNDING.yearly)} a year instead of{" "}
        {formatUsd(PLANS.find((p) => p.id === "pro")?.yearly ?? 0)}, for as long
        as you keep it, for the first {FOUNDING.spots} people who reserve. It goes
        by when you first reserved, so switching to Team and back keeps your
        place.
      </>
    ),
  },
  {
    q: "Can I cancel a reservation?",
    a: <>Yes, on this page, at any time. Nothing is owed.</>,
  },
  {
    q: "What happens to my data on Free?",
    a: (
      <>
        Nothing is deleted. If you have more than {FREE_PROJECTS} projects when
        the limits start, you keep them and can read, pull and export them; you
        just cannot add another until you are under the limit or on Pro.
      </>
    ),
  },
  {
    q: "Why charge at all?",
    a: (
      <>
        klef.sh is run by one person. Paid plans pay for the hosting and the
        time to keep it maintained and reviewed. If you would rather not pay,
        self-host it; that will always be free.
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
  reserve: (plan: PaidPlanId) => void;
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
  const label = STATUS_LABEL[plan.status];
  const featured = plan.id === FOUNDING.plan;

  return (
    <article className={featured ? "m-plan m-plan-featured" : "m-plan"} aria-labelledby={`plan-${plan.id}`}>
      <div className="m-plan-head">
        <h2 id={`plan-${plan.id}`}>{plan.name}</h2>
        {label && <span className="m-plan-status">{label}</span>}
      </div>
      <p className="m-plan-audience">{plan.audience}</p>

      <p className="m-price">
        <b>{formatUsd(plan.monthly)}</b>
        <span>{plan.monthly === 0 ? "forever" : plan.id === "team" ? "a month, flat" : "a month"}</span>
      </p>
      <p className="m-price-yearly">
        {plan.yearly === null
          ? "No card, no trial clock."
          : `or ${formatUsd(plan.yearly)} a year, ${monthsFreeYearly(plan)} months free`}
      </p>

      {featured && (
        <p className="m-founding">
          <b>{`Founding price: ${formatUsd(FOUNDING.yearly)} a year, for life.`}</b>{" "}
          {`For the first ${FOUNDING.spots} reservations.`}
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
        {plan.id === "free" ? (
          <Link to="/auth" className="m-btn m-btn-line">
            Get started free
          </Link>
        ) : (
          <ReserveAction plan={plan.id} controls={reservation} />
        )}
      </div>
    </article>
  );
}

function ReserveAction({ plan, controls }: { plan: PaidPlanId; controls: ReservationControls }) {
  const { state, busy, reserve, cancel } = controls;
  const cta = plan === "pro" ? "Reserve the founding price" : "Reserve a Team spot";

  if (state.kind === "loading" || state.kind === "signedOut") {
    return (
      <Link
        to="/auth"
        state={{ from: "/pricing" }}
        className={plan === "pro" ? "m-btn m-btn-ink" : "m-btn m-btn-line"}
      >
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
          Reserved. Nothing is charged until paid plans open.
        </p>
        <button type="button" className="m-link-btn" onClick={cancel} disabled={busy}>
          Cancel reservation
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={plan === "pro" ? "m-btn m-btn-ink" : "m-btn m-btn-line"}
      onClick={() => reserve(plan)}
      disabled={busy}
    >
      {current ? `Switch reservation to ${plan === "pro" ? "Pro" : "Team"}` : cta}
    </button>
  );
}
