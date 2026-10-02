import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-teal-600 text-white shadow-sm hover:bg-teal-700 active:bg-teal-800",
        secondary:
          "bg-slate-100 text-slate-800 shadow-sm hover:bg-slate-200 active:bg-slate-300",
        outline:
          "border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100",
        ghost:
          "text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
        link:
          "text-teal-600 underline-offset-4 hover:underline",
        subtle:
          "bg-teal-50 text-teal-700 hover:bg-teal-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
