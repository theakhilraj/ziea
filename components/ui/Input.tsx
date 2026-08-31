import React, { InputHTMLAttributes, forwardRef, useId } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftElement, rightElement, className = '', id, ...props }, ref) => {
    // Programmatic label/error association for assistive tech. Honour a caller
    // supplied id, otherwise generate a stable one.
    const reactId = useId();
    const inputId = id ?? reactId;
    const errorId = `${inputId}-error`;
    const isPassword = props.type === 'password';
    const passwordClasses = isPassword ? 'font-sans text-2xl tracking-[0.15em] placeholder:text-base placeholder:tracking-normal placeholder:font-jost' : '';
    
    const paddingLeftClass = leftElement ? 'pl-12' : 'px-4';
    const paddingRightClass = rightElement ? 'pr-12' : (leftElement ? 'pr-4' : '');
    
    const inputClasses = `w-full ${paddingLeftClass} ${paddingRightClass} py-3 border border-outline-variant rounded-xl bg-white font-jost font-normal text-base text-on-surface transition-all outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 hover:border-primary/50 group-focus-within:translate-x-1 duration-200 ${passwordClasses} ${className}`;
    const labelClasses = "block font-jost font-medium text-sm text-on-surface-variant mb-2 ml-1";

    return (
      <div className="group relative w-full">
        {label && <label htmlFor={inputId} className={labelClasses}>{label}</label>}
        
        <div className="relative">
          {leftElement && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center">
              {leftElement}
            </div>
          )}
          
          <input
            id={inputId}
            ref={ref}
            className={inputClasses}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            {...props}
          />
          
          {rightElement && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
              {rightElement}
            </div>
          )}
        </div>

        {error && (
          <p id={errorId} role="alert" className="text-red-500 text-xs mt-1 font-jost ml-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
