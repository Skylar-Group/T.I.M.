import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff, RotateCcw, X } from 'lucide-react';

export const CUSTOM_OPTION_VALUE = '__custom__';
const REMOVED_OPTIONS_STORAGE_PREFIX = 'ma_craft_removed_opts_v1_';

interface FieldHeaderProps {
  label: string;
  visible?: boolean;
  onToggleVisible?: (next: boolean) => void;
  compact?: boolean;
}

export const FieldLabelHeader: React.FC<FieldHeaderProps> = ({
  label,
  visible = true,
  onToggleVisible,
  compact = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-medium text-[#51443d]`}>
        {label}
      </span>
      {onToggleVisible && (
        <button
          type="button"
          onClick={() => onToggleVisible(!visible)}
          className={`inline-flex items-center gap-1 px-2 h-6 rounded border text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            visible
              ? 'border-[#e0d8d3] bg-[#fcf9f8] text-[#73594c] hover:bg-[#e8ded8]/60'
              : 'border-[#ba1a1a]/30 bg-[#ffdad6]/40 text-[#93000a] hover:bg-[#ffdad6]/60'
          }`}
          title={visible ? '點擊即可於前台隱藏此欄位' : '點擊即可於前台顯示此欄位'}
        >
          {visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {visible ? '顯示中' : '已隱藏'}
        </button>
      )}
    </div>
  );
};

interface OptionOrCustomFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  optionStorageKey?: string;
  placeholder?: string;
  customOptionLabel?: string;
  visible?: boolean;
  onToggleVisible?: (next: boolean) => void;
  multilineCustom?: boolean;
  rows?: number;
  compact?: boolean;
}

export const OptionOrCustomField: React.FC<OptionOrCustomFieldProps> = ({
  label,
  value,
  onChange,
  options,
  optionStorageKey,
  placeholder = '請自行輸入自訂內容...',
  customOptionLabel = '自訂（自行輸入）',
  visible = true,
  onToggleVisible,
  multilineCustom = false,
  rows = 2,
  compact = false,
}) => {
  const storageKey = `${REMOVED_OPTIONS_STORAGE_PREFIX}${(optionStorageKey || label).replace(/\s+/g, '_')}`;

  const [removedOptions, setRemovedOptions] = useState<string[]>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  const activeOptions = Array.from(
    new Set(options.filter((o) => o.trim() !== '' && !removedOptions.includes(o)))
  );

  const isPreset = activeOptions.includes(value);
  const [customMode, setCustomMode] = useState<boolean>(
    () => Boolean(value && !activeOptions.includes(value))
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && !activeOptions.includes(value)) {
      setCustomMode(true);
    }
  }, [value, removedOptions.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const persistRemoved = (next: string[]) => {
    setRemovedOptions(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const handleSelectOption = (opt: string) => {
    if (opt === CUSTOM_OPTION_VALUE) {
      setCustomMode(true);
      setMenuOpen(false);
    } else {
      setCustomMode(false);
      onChange(opt);
      setMenuOpen(false);
    }
  };

  const handleRemoveOption = (e: React.MouseEvent, opt: string) => {
    e.stopPropagation();
    const next = Array.from(new Set([...removedOptions, opt]));
    persistRemoved(next);
    if (value === opt) {
      onChange('');
      setCustomMode(false);
    }
  };

  const handleRestoreDefaults = (e: React.MouseEvent) => {
    e.stopPropagation();
    persistRemoved([]);
  };

  const triggerLabel = customMode
    ? `${customOptionLabel}${value ? `：${value}` : ''}`
    : isPreset
    ? value
    : `請選擇預設項目或「${customOptionLabel}」`;

  return (
    <div
      ref={containerRef}
      className={`space-y-1.5 relative transition-opacity ${visible ? '' : 'opacity-65'}`}
    >
      <FieldLabelHeader
        label={label}
        visible={visible}
        onToggleVisible={onToggleVisible}
        compact={compact}
      />

      <div className="relative flex items-center">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className={`w-full ${
            compact ? 'h-9 px-2.5 pr-14 text-xs' : 'h-11 px-3.5 pr-14 text-sm'
          } rounded-lg bg-white border border-[#e0d8d3] text-left flex items-center justify-between gap-2 focus:outline-none focus:border-[#8c5e43] cursor-pointer ${
            !isPreset && !customMode ? 'text-[#51443d]/70' : 'text-[#1b1c1c]'
          }`}
        >
          <span className="truncate">{triggerLabel}</span>
        </button>

        <div className="absolute right-2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setCustomMode(false);
              }}
              className="w-6 h-6 rounded hover:bg-[#ffdad6]/60 text-[#73594c] hover:text-[#93000a] flex items-center justify-center cursor-pointer"
              title="清除目前內容"
              aria-label="清除目前內容"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="w-6 h-6 rounded hover:bg-[#f6f3f2] text-[#51443d] flex items-center justify-center cursor-pointer"
            aria-label="展開或收合選項清單"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-[#e0d8d3] rounded-lg shadow-warm max-h-60 overflow-y-auto py-1">
          {activeOptions.map((opt) => {
            const active = !customMode && value === opt;
            return (
              <div
                key={opt}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors ${
                  active ? 'bg-[#e8ded8]/60 text-[#70472d] font-medium' : 'text-[#1b1c1c] hover:bg-[#fcf9f8]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectOption(opt)}
                  className="flex-1 text-left truncate cursor-pointer py-0.5"
                >
                  {opt}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleRemoveOption(e, opt)}
                  className="w-6 h-6 rounded border border-transparent hover:border-[#ba1a1a]/30 hover:bg-[#ffdad6]/50 text-[#73594c] hover:text-[#93000a] flex items-center justify-center shrink-0 cursor-pointer"
                  title={`從清單移除「${opt}」`}
                  aria-label={`從清單移除 ${opt}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {activeOptions.length === 0 && (
            <p className="px-3 py-2 text-xs text-[#73594c]">目前已移除全部預設選項，可直接選擇自訂輸入。</p>
          )}

          <div className="border-t border-[#e0d8d3] mt-1 pt-1">
            <button
              type="button"
              onClick={() => handleSelectOption(CUSTOM_OPTION_VALUE)}
              className={`w-full text-left px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                customMode
                  ? 'bg-[#8c5e43] text-white'
                  : 'text-[#8c5e43] hover:bg-[#f6f3f2]'
              }`}
            >
              + {customOptionLabel}
            </button>
            {removedOptions.length > 0 && (
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[#73594c] hover:bg-[#f6f3f2] flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                還原已移除的選項 ({removedOptions.length})
              </button>
            )}
          </div>
        </div>
      )}

      {customMode &&
        (multilineCustom ? (
          <textarea
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full p-3.5 rounded-lg bg-[#fcf9f8] border border-[#8c5e43]/60 text-sm text-[#1b1c1c] focus:outline-none focus:border-[#8c5e43]"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full ${
              compact ? 'h-9 px-2.5 text-xs' : 'h-11 px-3.5 text-sm'
            } rounded-lg bg-[#fcf9f8] border border-[#8c5e43]/60 text-[#1b1c1c] focus:outline-none focus:border-[#8c5e43]`}
          />
        ))}
    </div>
  );
};

interface TextFieldWithVisibilityProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'tel' | 'email';
  placeholder?: string;
  visible?: boolean;
  onToggleVisible?: (next: boolean) => void;
  tabular?: boolean;
  compact?: boolean;
  className?: string;
}

export const TextFieldWithVisibility: React.FC<TextFieldWithVisibilityProps> = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  visible = true,
  onToggleVisible,
  tabular = false,
  compact = false,
  className = '',
}) => {
  return (
    <label className={`block space-y-1.5 transition-opacity ${visible ? '' : 'opacity-65'} ${className}`}>
      <FieldLabelHeader
        label={label}
        visible={visible}
        onToggleVisible={onToggleVisible}
        compact={compact}
      />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full ${
          compact ? 'h-9 px-2.5 text-xs' : 'h-11 px-3.5 text-sm'
        } rounded-lg bg-white border border-[#e0d8d3] text-[#1b1c1c] focus:outline-none focus:border-[#8c5e43] ${
          tabular ? 'tabular-nums' : ''
        }`}
      />
    </label>
  );
};

interface NumberFieldWithVisibilityProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  placeholder?: string;
  visible?: boolean;
  onToggleVisible?: (next: boolean) => void;
}

export const NumberFieldWithVisibility: React.FC<NumberFieldWithVisibilityProps> = ({
  label,
  value,
  onChange,
  min = 0,
  placeholder,
  visible = true,
  onToggleVisible,
}) => {
  return (
    <label className={`block space-y-1.5 transition-opacity ${visible ? '' : 'opacity-65'}`}>
      <FieldLabelHeader
        label={label}
        visible={visible}
        onToggleVisible={onToggleVisible}
      />
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder={placeholder}
        className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#e0d8d3] text-sm text-[#1b1c1c] tabular-nums focus:outline-none focus:border-[#8c5e43]"
      />
    </label>
  );
};

interface TextAreaFieldWithVisibilityProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  visible?: boolean;
  onToggleVisible?: (next: boolean) => void;
  compact?: boolean;
}

export const TextAreaFieldWithVisibility: React.FC<TextAreaFieldWithVisibilityProps> = ({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  visible = true,
  onToggleVisible,
  compact = false,
}) => {
  return (
    <label className={`block space-y-1.5 transition-opacity ${visible ? '' : 'opacity-65'}`}>
      <FieldLabelHeader
        label={label}
        visible={visible}
        onToggleVisible={onToggleVisible}
        compact={compact}
      />
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full p-3.5 rounded-lg bg-white border border-[#e0d8d3] ${
          compact ? 'text-xs' : 'text-sm'
        } text-[#1b1c1c] focus:outline-none focus:border-[#8c5e43]`}
      />
    </label>
  );
};
