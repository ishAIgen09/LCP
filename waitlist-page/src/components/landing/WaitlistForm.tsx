import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Coffee, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWaitlistCounts, type Audience } from "@/hooks/useWaitlistCounts";
import { LiveCounters } from "./LiveCounters";

const WAITLIST_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbwhzhDwQwr1OLiE_GAuS6SJScuDucZXVYX8y9Wdozt0i5cPq-HVkMpXeQbixOzRbno/exec";

const ownerSchema = z.object({
  cafeName: z.string().trim().min(1, "Cafe name is required").max(100),
  name: z.string().trim().min(1, "Your name is required").max(80),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(255),
  city: z.string().trim().min(1, "City is required").max(80),
  "bot-field": z.string().max(0).optional(),
});

const consumerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(255),
  city: z.string().trim().min(1, "City is required").max(80),
  "bot-field": z.string().max(0).optional(),
});

type OwnerForm = z.infer<typeof ownerSchema>;
type ConsumerForm = z.infer<typeof consumerSchema>;

async function postToWaitlist(payload: Record<string, string>) {
  const body = new URLSearchParams(payload);
  await fetch(WAITLIST_WEBHOOK_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export const WaitlistForm = () => {
  const [audience, setAudience] = useState<Audience>("owner");
  const [submitted, setSubmitted] = useState(false);
  const { increment } = useWaitlistCounts();

  return (
    <section id="waitlist" className="bg-espresso py-24 text-white sm:py-32">
      <div className="container mx-auto px-6">
        <div className="reveal mx-auto max-w-2xl text-center">
          <p className="mb-4 text-xs uppercase tracking-[0.25em] text-white/55">Join the waitlist</p>
          <h2 className="font-display text-balance text-4xl font-medium leading-tight sm:text-5xl">
            Be first to know. Be first in line for Founding price.
          </h2>
          <p className="mt-5 text-white/70">
            No payment, no commitment — just your spot on the list. The earlier you join, the better your shot at one of the 100 Founding spots when we open the doors.
          </p>
          <div className="mt-6 flex justify-center">
            <LiveCounters variant="hero" />
          </div>
        </div>

        <div className="reveal mx-auto mt-12 max-w-xl">
          {submitted ? (
            <SuccessState audience={audience} onReset={() => setSubmitted(false)} />
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-elegant backdrop-blur sm:p-8">
              {/* Audience toggle */}
              <div className="mb-7 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                {(["owner", "consumer"] as Audience[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAudience(a)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-300",
                      audience === a
                        ? "bg-mint text-accent-foreground shadow-mint"
                        : "text-white/70 hover:text-white",
                    )}
                  >
                    {a === "owner" ? <Coffee className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
                    {a === "owner" ? "I run a cafe" : "I love coffee"}
                  </button>
                ))}
              </div>

              {audience === "owner" ? (
                <OwnerFormFields
                  onDone={() => {
                    increment("owner");
                    setSubmitted(true);
                  }}
                />
              ) : (
                <ConsumerFormFields
                  onDone={() => {
                    increment("consumer");
                    setSubmitted(true);
                  }}
                />
              )}

              <p className="mt-5 text-center text-xs text-white/50">
                No payment. No spam. One email at launch, that's it.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const fieldClass =
  "border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-mint focus-visible:border-mint h-11";
const labelClass = "text-white/80 text-sm";

const honeypotStyle: React.CSSProperties = {
  position: "absolute",
  left: "-10000px",
  top: "auto",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  opacity: 0,
};

function Honeypot({ register }: { register: ReturnType<typeof useForm>["register"] }) {
  return (
    <div aria-hidden="true" style={honeypotStyle}>
      <label htmlFor="bot-field">Don't fill this out if you're human</label>
      <input
        id="bot-field"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        {...register("bot-field")}
      />
    </div>
  );
}

function OwnerFormFields({ onDone }: { onDone: () => void }) {
  const form = useForm<OwnerForm>({
    resolver: zodResolver(ownerSchema),
    defaultValues: { cafeName: "", name: "", email: "", city: "", "bot-field": "" },
  });
  const onSubmit = async (values: OwnerForm) => {
    if (values["bot-field"]) return;
    try {
      await postToWaitlist({
        type: "Owner",
        name: values.name,
        email: values.email,
        cafe: values.cafeName,
        city: values.city,
      });
      form.reset();
      onDone();
    } catch {
      // no-cors gives an opaque response; only network failures land here.
      // Treat as soft success so the user isn't punished for transient blips.
      form.reset();
      onDone();
    }
  };
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Honeypot register={form.register as ReturnType<typeof useForm>["register"]} />
      <Field label="Cafe name" id="cafeName" error={form.formState.errors.cafeName?.message}>
        <Input id="cafeName" autoComplete="organization" className={fieldClass} placeholder="The Daily Grind" {...form.register("cafeName")} />
      </Field>
      <Field label="Your name" id="name" error={form.formState.errors.name?.message}>
        <Input id="name" autoComplete="name" className={fieldClass} placeholder="Alex Morgan" {...form.register("name")} />
      </Field>
      <Field label="Email" id="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" className={fieldClass} placeholder="alex@dailygrind.co" {...form.register("email")} />
      </Field>
      <Field label="City" id="city" error={form.formState.errors.city?.message}>
        <Input id="city" autoComplete="address-level2" className={fieldClass} placeholder="London" {...form.register("city")} />
      </Field>
      <SubmitButton submitting={form.formState.isSubmitting}>Add me to the waitlist</SubmitButton>
    </form>
  );
}

function ConsumerFormFields({ onDone }: { onDone: () => void }) {
  const form = useForm<ConsumerForm>({
    resolver: zodResolver(consumerSchema),
    defaultValues: { name: "", email: "", city: "", "bot-field": "" },
  });
  const onSubmit = async (values: ConsumerForm) => {
    if (values["bot-field"]) return;
    try {
      await postToWaitlist({
        type: "Customer",
        name: values.name,
        email: values.email,
        city: values.city,
        cafe: "",
      });
      form.reset();
      onDone();
    } catch {
      form.reset();
      onDone();
    }
  };
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Honeypot register={form.register as ReturnType<typeof useForm>["register"]} />
      <Field label="Name" id="cname" error={form.formState.errors.name?.message}>
        <Input id="cname" autoComplete="name" className={fieldClass} placeholder="Sam Patel" {...form.register("name")} />
      </Field>
      <Field label="Email" id="cemail" error={form.formState.errors.email?.message}>
        <Input id="cemail" type="email" autoComplete="email" className={fieldClass} placeholder="sam@example.com" {...form.register("email")} />
      </Field>
      <Field label="City" id="ccity" error={form.formState.errors.city?.message}>
        <Input id="ccity" autoComplete="address-level2" className={fieldClass} placeholder="Manchester" {...form.register("city")} />
      </Field>
      <SubmitButton submitting={form.formState.isSubmitting}>Notify me at launch</SubmitButton>
    </form>
  );
}

function Field({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={labelClass}>{label}</Label>
      {children}
      {error && <p className="text-destructive-foreground/90 text-xs" style={{ color: "hsl(var(--mint))" }}>{error}</p>}
    </div>
  );
}

function SubmitButton({ submitting, children }: { submitting: boolean; children: React.ReactNode }) {
  return (
    <div className="mt-4 space-y-3">
      <p className="text-center text-xs leading-relaxed text-white/60">
        By joining the waitlist, you agree to our privacy policy and consent to us contacting you with updates.
      </p>
      <Button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="bg-mint text-accent-foreground hover:bg-mint/90 shadow-mint h-12 w-full text-base font-semibold disabled:opacity-90 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving…
          </span>
        ) : (
          children
        )}
      </Button>
    </div>
  );
}

function SuccessState({ audience, onReset }: { audience: Audience; onReset: () => void }) {
  return (
    <div className="animate-fade-in-up rounded-3xl border border-mint/40 bg-white/5 p-10 text-center shadow-elegant backdrop-blur">
      <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-mint text-accent-foreground shadow-mint">
        <Check className="h-7 w-7" strokeWidth={3} />
      </div>
      <h3 className="font-display text-3xl font-semibold">You're on the list!</h3>
      <p className="mx-auto mt-3 text-white/80">We'll be in touch soon.</p>
      <p className="mx-auto mt-4 max-w-md text-sm text-white/65">
        {audience === "owner"
          ? "Be quick — the first 100 cafes to sign up become Founding Members and lock in founding price for life."
          : "Once we're live, you'll be among the first to download the app."}
      </p>
      <button
        onClick={onReset}
        className="mt-6 text-sm text-white/60 underline-offset-4 hover:text-mint hover:underline"
      >
        Add another sign-up
      </button>
    </div>
  );
}
