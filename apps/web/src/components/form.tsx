"use client";

import Link from "next/link";

/** Small form kit shared by every create/edit screen. */

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

const control =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40 disabled:opacity-60";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${control} ${props.className ?? ""}`} />;
}

type Variant = "primary" | "secondary" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "border border-border bg-surface hover:bg-foreground/5",
  danger: "border border-red-500/40 text-red-600 hover:bg-red-500/10",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: Variant;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap ${variants[variant]}`}
    >
      {children}
    </Link>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

/** "" → undefined, so optional fields are omitted rather than sent empty. */
export const opt = (v: string) => (v.trim() === "" ? undefined : v.trim());
export const optNum = (v: string) => (v.trim() === "" ? undefined : Number(v));
