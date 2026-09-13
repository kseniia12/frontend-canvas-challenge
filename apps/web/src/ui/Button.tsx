import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  pendingLabel?: string;
  variant?: 'primary' | 'ghost';
  children: ReactNode;
};

export function Button({
  pending,
  pendingLabel = 'Сохраняем…',
  variant = 'primary',
  children,
  className,
  disabled,
  type = 'button',
  ...props
}: Props) {
  const cn = ['btn', variant === 'ghost' ? 'btn-ghost' : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cn} disabled={disabled || pending} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}
