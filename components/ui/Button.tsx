import { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "pill"
  | "icon"
  | "ghost"
  | "auth-primary"
  | "auth-social"
  | "outline";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
}

// Exported so anchors/links (which can't be a <button>) can reuse the exact
// same styling, e.g. `<a className={`${buttonBase} ${buttonVariants.outline}`}>`.
export const buttonBase =
  "transition-all active:scale-95 flex items-center justify-center";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-secondary text-background rounded-full px-8 py-3 font-label-md shadow-lg shadow-black/10",
  pill: "gap-3 bg-surface border border-border rounded-full px-6 py-3 whitespace-nowrap font-label-md text-primary-dark",
  icon: "scale-95 hover:opacity-80 duration-200 text-primary-dark",
  ghost: "text-primary font-semibold hover:gap-3 inline-flex items-center gap-2",
  "auth-primary":
    "w-full bg-[#2C3829] text-white rounded-full py-4 font-jost font-medium text-lg hover:opacity-90 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center",
  "auth-social":
    "w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border border-outline-variant hover:bg-surface-container-low transition-colors font-jost font-medium text-sm text-on-surface shadow-sm",
  outline:
    "rounded-full border border-primary-dark px-8 py-4 font-jost font-medium text-lg text-primary-dark hover:bg-primary-dark hover:text-background",
};

export function Button({ variant = "primary", children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
