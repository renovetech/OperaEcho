import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/shared/lib';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    isLoading?: boolean;
    ref?: Ref<HTMLButtonElement>;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'border-pine bg-pine text-white hover:border-pine-800 hover:bg-pine-800',
    secondary: 'border-line bg-white font-medium text-text hover:bg-surface-2',
    ghost: 'border-transparent bg-transparent font-medium text-text-2 hover:bg-line-2 hover:text-ink',
    danger: 'border-danger bg-danger text-white hover:border-ink hover:bg-ink'
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'gap-1.5 px-[13px] py-2 text-[13px]',
    md: 'gap-[7px] px-4 py-2.5 text-sm'
};

export function Button({
    variant = 'primary',
    size = 'md',
    isLoading = false,
    disabled,
    type = 'button',
    className,
    children,
    ...rest
}: ButtonProps) {
    return (
        <button
            type={type}
            disabled={disabled || isLoading}
            aria-busy={isLoading}
            className={cn(
                'inline-flex cursor-pointer items-center justify-center rounded-lg border border-solid font-sans font-semibold transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine',
                'disabled:cursor-not-allowed disabled:opacity-60',
                VARIANT_CLASSES[variant],
                SIZE_CLASSES[size],
                className
            )}
            {...rest}
        >
            {isLoading && (
                <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {children}
        </button>
    );
}
