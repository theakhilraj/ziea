import React, { useState, useRef, useEffect } from 'react';
import { MdKeyboardArrowDown } from 'react-icons/md';
import { Button } from './Button';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  allowAdd?: boolean;
  onAdd?: (newOption: string) => void;
  /** Show the "None" (clear) option at the top of the list. Default true. */
  allowNone?: boolean;
  /** Extra classes merged onto the trigger box (e.g. compact font / no-wrap). */
  triggerClassName?: string;
  /** Extra classes merged onto each dropdown option (e.g. compact font). */
  optionClassName?: string;
  disabled?: boolean;
}

export function Select({ label, value, onChange, options, placeholder = "Select an option", allowAdd, onAdd, allowNone = true, triggerClassName = "", optionClassName = "", disabled = false }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newInput, setNewInput] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="relative" ref={wrapperRef}>
      {label && (
        <label className="font-jost text-sm font-medium text-[#2C3829] mb-1 block">{label}</label>
      )}
      <div
        aria-disabled={disabled}
        className={`w-full px-4 py-3 bg-white border border-[#d6c3b3] rounded-xl font-jost font-normal text-base text-[#2C3829] transition-all outline-none focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5 hover:border-primary/50 duration-200 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} flex justify-between items-center ${triggerClassName}`}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
      >
        <span className={`truncate ${value ? "text-[#2C3829]" : "text-[#2C3829]/50"}`}>
          {selectedOption ? selectedOption.label : (value || placeholder)}
        </span>
        <MdKeyboardArrowDown className={`text-xl transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-[#d6c3b3]/50 rounded-xl shadow-lg shadow-black/5 overflow-hidden font-jost animate-in fade-in slide-in-from-top-2 duration-200">
          {allowAdd && onAdd && (
            <div className="p-2 border-b border-[#d6c3b3]/30">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newInput}
                  onChange={(e) => setNewInput(e.target.value)}
                  placeholder="Type custom value..."
                  className="flex-1 px-3 py-2 text-sm bg-[#FAF7F2] rounded-lg outline-none border border-transparent focus:border-[#d6c3b3] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newInput.trim()) {
                      e.preventDefault();
                      onAdd(newInput.trim());
                      setNewInput('');
                      setIsOpen(false);
                    }
                  }}
                />
                <Button 
                  type="button" 
                  variant="auth-social" 
                  className="!px-3 !py-2 !text-xs !w-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (newInput.trim()) {
                      onAdd(newInput.trim());
                      setNewInput('');
                      setIsOpen(false);
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto p-2">
            {options.length === 0 && !allowAdd ? (
              <div className="px-4 py-3 text-sm text-[#2C3829]/50 italic">No options available</div>
            ) : (
              <>
                {allowNone && (
                  <div
                    className={`px-4 py-2.5 rounded-lg cursor-pointer transition-colors ${!value ? 'bg-[#e5d8ce] font-medium' : 'hover:bg-[#FAF7F2]'} ${optionClassName}`}
                    onClick={() => {
                      onChange('');
                      setIsOpen(false);
                    }}
                  >
                    None
                  </div>
                )}
                {options.map(opt => (
                  <div
                    key={opt.value}
                    className={`px-4 py-2.5 rounded-lg cursor-pointer transition-colors ${value === opt.value ? 'bg-[#e5d8ce] font-medium' : 'hover:bg-[#FAF7F2]'} ${optionClassName}`}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                  >
                    {opt.label}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
