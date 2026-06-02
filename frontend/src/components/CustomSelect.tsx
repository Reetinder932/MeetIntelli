import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: any;
  label: string;
}

interface CustomSelectProps {
  value: any;
  onChange: (value: any) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
  renderOption?: (option: SelectOption, isSelected: boolean) => React.ReactNode;
  renderTrigger?: (selectedOption: SelectOption | undefined) => React.ReactNode;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  triggerClassName = '',
  dropdownClassName = '',
  renderOption,
  renderTrigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 bg-muted/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-2.5 text-sm text-foreground font-semibold outline-none cursor-pointer transition-all duration-200 hover:border-primary/45 ${triggerClassName}`}
      >
        {renderTrigger ? (
          renderTrigger(selectedOption)
        ) : (
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute left-0 mt-2 bg-card/95 backdrop-blur-md border border-border/80 rounded-2xl shadow-2xl p-2 z-50 max-h-60 overflow-y-auto space-y-1 w-full min-w-max ${dropdownClassName}`}>
          {options.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground font-semibold italic">
              No options available
            </div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={String(opt.value)}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className="w-full text-left"
                >
                  {renderOption ? (
                    renderOption(opt, isSelected)
                  ) : (
                    <div
                      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all duration-200 text-sm font-semibold select-none ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-bold'
                          : 'text-foreground/90 hover:bg-primary/10 hover:text-primary'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0" />}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
