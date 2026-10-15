import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, ChevronsUpDown, Search } from "lucide-react";
import { createPortal } from "react-dom";

export type SelectValue = string | number;

export interface OptionsType {
  value: SelectValue;
  label: string;
}

type ValueProp = SelectValue | SelectValue[] | OptionsType | OptionsType[] | null;

interface SelectProps {
  defaultValue?: ValueProp;
  value?: ValueProp;
  /**
   * Simple: `(valor, opción)`; múltiple: `(opciones, opciones)`; al limpiar: `null` o `[]`.
   */
  onChange: (value: SelectValue | OptionsType[] | null, option?: OptionsType | OptionsType[] | null) => void;
  options: OptionsType[] | string[];
  placeholder?: string;
  clearable?: boolean;
  filterOption?: (
    option: {
      label: string;
      value: SelectValue;
      data: OptionsType;
    },
    inputValue: string,
  ) => boolean;
  onInputChange?: (value: string) => void;
  isLoading?: boolean;
  isMulti?: boolean;
  isDisabled?: boolean;
  width?: string;
  closeMenuOnSelect?: boolean;
  isOptionDisabled?: (option: OptionsType) => boolean;
  controlHeight?: string;
  menuPosition?: "fixed" | "absolute";
  numericKeyboard?: boolean;
  commonFontSize?: string;
  onClose?: () => void;
}

/** Lo que expone el `ref` del Select. */
export interface SelectHandle {
  clear: () => void;
  focus: () => void;
  setInputValue: (value: string) => void;
}

const Select = forwardRef<SelectHandle, SelectProps>(
  (
    {
      options: rawOptions,
      defaultValue,
      placeholder = "Seleccione",
      clearable = false,
      value,
      isLoading = false,
      onChange,
      filterOption,
      onInputChange,
      isMulti = false,
      isDisabled = false,
      width = "full",
      closeMenuOnSelect = true,
      isOptionDisabled,
      controlHeight = "50px",
      menuPosition = "absolute",
      numericKeyboard = false,
      commonFontSize = "16px",
      onClose,
    }: SelectProps,
    ref,
  ) => {
    const options = useMemo(() => {
      return rawOptions.map((opt) =>
        typeof opt === "string" ? { value: opt, label: opt } : opt,
      );
    }, [rawOptions]);

    const [dropdownPosition, setDropdownPosition] = useState<"bottom" | "top">(
      "bottom",
    );
    const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>(
      {},
    );
    const [inputValue, setInputValue] = useState<string>("");
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [selectedOptions, setSelectedOptions] = useState<OptionsType[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);

    const filteredOptions = useMemo(() => {
      if (inputValue.trim() === "") {
        return options;
      }
      return options.filter((option) => {
        if (filterOption) {
          return filterOption(
            { label: option.label, value: option.value, data: option },
            inputValue,
          );
        }
        return option.label.toLowerCase().includes(inputValue.toLowerCase());
      });
    }, [inputValue, options, filterOption]);

    const calculateDropdownPosition = useCallback(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 300;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const position =
        spaceBelow < dropdownHeight && spaceAbove > spaceBelow
          ? "top"
          : "bottom";
      setDropdownPosition(position);

      if (menuPosition === "fixed") {
        setDropdownStyles({
          position: "fixed",
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          top: position === "bottom" ? `${rect.bottom + 4}px` : "auto",
          bottom:
            position === "top"
              ? `${window.innerHeight - rect.top + 4}px`
              : "auto",
        });
      }
    }, [menuPosition]);

    useEffect(() => {
      const currentValue =
        value !== undefined && value !== null ? value : defaultValue;

      const syncSelection = () => {
        if (!currentValue) {
          // Controlado y vaciado desde afuera (p. ej. "Limpiar filtros"): se limpia.
          // No controlado: se respeta lo que el usuario eligió.
          if (!isInitialMount.current && value === undefined) return;
          setSelectedOptions([]);
          setInputValue("");
          isInitialMount.current = false;
          return;
        }

        if (isMulti) {
          const valueArray = Array.isArray(currentValue)
            ? currentValue
            : [currentValue];
          const matchedOptions = valueArray
            .map((val) => {
              if (typeof val === "object" && val.value !== undefined) return val;
              return options.find((opt) => opt.value === val);
            })
            .filter(Boolean) as OptionsType[];

          if (matchedOptions.length > 0) {
            setSelectedOptions(matchedOptions);
          }
        } else {
          // En modo simple un arreglo no tiene sentido: se toma su primer elemento.
          const single = Array.isArray(currentValue) ? currentValue[0] : currentValue;
          const option =
            typeof single === "object" && single !== null
              ? single
              : options.find((opt) => opt.value === single);

          if (option) {
            setSelectedOptions([option]);
            setInputValue(option.label);
          }
        }

        isInitialMount.current = false;
      };

      const timerId = window.setTimeout(syncSelection, 0);
      return () => window.clearTimeout(timerId);
    }, [value, defaultValue, isMulti, options]);

    useEffect(() => {
      if (isOpen && menuPosition === "fixed") {
        const timerId = window.setTimeout(calculateDropdownPosition, 0);
        const handleResize = () => calculateDropdownPosition();
        const handleScroll = () => calculateDropdownPosition();

        window.addEventListener("resize", handleResize);
        window.addEventListener("scroll", handleScroll, true);

        return () => {
          window.clearTimeout(timerId);
          window.removeEventListener("resize", handleResize);
          window.removeEventListener("scroll", handleScroll, true);
        };
      }
    }, [isOpen, menuPosition, calculateDropdownPosition]);

    useImperativeHandle(ref, () => ({
      clear: () => {
        setSelectedOptions([]);
        setInputValue("");
        onChange(isMulti ? [] : null);
      },
      focus: () => {
        inputRef.current?.focus();
      },
      setInputValue: (val: string) => {
        setInputValue(val);
      },
    }));

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      onInputChange?.(newValue);

      if (!isOpen && newValue.trim()) {
        setIsOpen(true);
        calculateDropdownPosition();
      }

      if (newValue.trim() === "" && !isMulti) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }

      setHighlightedIndex(-1);
    };

    const handleOptionClick = (option: OptionsType) => {
      if (isOptionDisabled?.(option)) return;

      if (isMulti) {
        const exists = selectedOptions.find(
          (opt) => opt.value === option.value,
        );
        let newSelected: OptionsType[];
        if (exists) {
          newSelected = selectedOptions.filter(
            (opt) => opt.value !== option.value,
          );
        } else {
          newSelected = [...selectedOptions, option];
        }
        setSelectedOptions(newSelected);
        onChange(newSelected, newSelected);
        setInputValue("");
        if (closeMenuOnSelect) {
          setIsOpen(false);
        }
      } else {
        setSelectedOptions([option]);
        setInputValue(option.label);
        onChange(option.value, option);
        if (closeMenuOnSelect) {
          setIsOpen(false);
        }
      }
      setHighlightedIndex(-1);
    };

    const handleRemoveOption = (
      optionToRemove: OptionsType,
      e: React.MouseEvent,
    ) => {
      e.stopPropagation();
      const newSelected = selectedOptions.filter(
        (opt) => opt.value !== optionToRemove.value,
      );
      setSelectedOptions(newSelected);
      onChange(isMulti ? newSelected : null, isMulti ? newSelected : null);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedOptions([]);
      setInputValue("");
      onChange(isMulti ? [] : null);
      inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (
          isOpen &&
          highlightedIndex >= 0 &&
          filteredOptions[highlightedIndex]
        ) {
          handleOptionClick(filteredOptions[highlightedIndex]);
        } else if (!isOpen && inputValue.trim()) {
          setIsOpen(true);
          calculateDropdownPosition();
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          calculateDropdownPosition();
          setHighlightedIndex(0);
        } else if (highlightedIndex < filteredOptions.length - 1) {
          setHighlightedIndex(highlightedIndex + 1);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (isOpen && highlightedIndex > 0) {
          setHighlightedIndex(highlightedIndex - 1);
        }
      } else if (e.key === "Escape") {
        setIsOpen(false);
        setHighlightedIndex(-1);
        onClose?.();
      } else if (
        e.key === "Backspace" &&
        inputValue === "" &&
        isMulti &&
        selectedOptions.length > 0
      ) {
        const newSelected = selectedOptions.slice(0, -1);
        setSelectedOptions(newSelected);
        onChange(newSelected, newSelected);
      }
    };

    const handleInputFocus = () => {
      if (!isDisabled) {
        setIsOpen(true);
        calculateDropdownPosition();
      }
    };

    const handleInputBlur = (e: React.FocusEvent) => {
      // Verificar si el nuevo elemento enfocado está dentro del dropdown o el contenedor
      setTimeout(() => {
        const relatedTarget = e.relatedTarget as HTMLElement;
        const clickedInsideDropdown =
          dropdownRef.current?.contains(relatedTarget);
        const clickedInsideContainer =
          containerRef.current?.contains(relatedTarget);

        if (
          !clickedInsideDropdown &&
          !clickedInsideContainer &&
          !document.activeElement?.closest('[role="listbox"]')
        ) {
          setIsOpen(false);
          if (!isMulti && selectedOptions.length > 0 && inputValue === "") {
            setInputValue(selectedOptions[0].label);
          }
        }
      }, 150); // Reducido el delay
    };

    useEffect(() => {
      if (
        highlightedIndex >= 0 &&
        listRef.current &&
        listRef.current.children[highlightedIndex]
      ) {
        const highlightedElement = listRef.current.children[
          highlightedIndex
        ] as HTMLElement;
        highlightedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }, [highlightedIndex]);

    const isSelected = (option: OptionsType) => {
      return selectedOptions.some((opt) => opt.value === option.value);
    };

    const dropdownContent = isOpen && !isDisabled && (
      <div
        ref={dropdownRef}
        role="listbox"
        className={`border border-border rounded-lg shadow-lg bg-card max-h-72 overflow-hidden flex flex-col ${
          menuPosition === "absolute"
            ? `absolute left-0 right-0 ${
                dropdownPosition === "top"
                  ? "bottom-full mb-1"
                  : "top-full mt-1"
              } z-100`
            : ""
        }`}
        style={
          menuPosition === "fixed"
            ? { ...dropdownStyles, zIndex: 9999 }
            : undefined
        }
        onMouseDown={(e) => e.preventDefault()} // Previene que el input pierda el focus
      >
        {isLoading ? (
          <div className="p-4 flex flex-col items-center gap-2">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            <span className="text-sm text-muted-foreground">Cargando...</span>
          </div>
        ) : filteredOptions.length > 0 ? (
          <ul ref={listRef} className="overflow-y-auto">
            {filteredOptions.map((option, index) => {
              const selected = isSelected(option);
              const highlighted = highlightedIndex === index;
              const disabled = isOptionDisabled?.(option);

              return (
                <li
                  key={`${option.value}-${index}`}
                  role="option"
                  aria-selected={selected}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                    disabled
                      ? "opacity-50 cursor-not-allowed"
                      : highlighted
                        ? "bg-primary/10"
                        : selected
                          ? "bg-primary/5"
                          : "hover: bg-muted"
                  }`}
                  style={{ fontSize: commonFontSize }}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Previene que el input pierda el focus
                    if (!disabled) {
                      handleOptionClick(option);
                    }
                  }}
                  onMouseEnter={() => !disabled && setHighlightedIndex(index)}
                >
                  <span className="text-foreground">{option.label}</span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-4 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <span className="text-sm text-muted-foreground">
              {inputValue.trim()
                ? "No se encontraron opciones"
                : "Escribe para buscar"}
            </span>
          </div>
        )}
      </div>
    );

    return (
      <div ref={containerRef} className={`relative w-${width}`}>
        <div
          className={`flex items-center gap-2 border border-border rounded-lg bg-background px-3 transition-all ${
            isOpen ? "ring-2 ring-primary/20" : ""
          } ${isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-text"}`}
          style={{ minHeight: controlHeight }}
          onClick={() => !isDisabled && inputRef.current?.focus()}
        >
          {isMulti && selectedOptions.length > 0 && (
            <div className="flex flex-wrap gap-1 flex-1">
              {selectedOptions.map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className="gap-1 pr-1"
                  style={{ fontSize: `calc(${commonFontSize} - 2px)` }}
                >
                  {option.label}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 p-0 hover:bg-destructive/20"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => handleRemoveOption(option, e)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}

          <Input
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder={selectedOptions.length === 0 ? placeholder : ""}
            disabled={isDisabled}
            inputMode={numericKeyboard ? "numeric" : "text"}
            pattern={numericKeyboard ? "[0-9]*" : undefined}
            autoComplete="off"
            className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
            style={{ fontSize: commonFontSize }}
          />

          <div className="flex items-center gap-1 flex-shrink-0">
            {isLoading && (
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            )}
            {clearable && selectedOptions.length > 0 && !isDisabled && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClear}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {menuPosition === "fixed" && typeof window !== "undefined"
          ? createPortal(dropdownContent, document.body)
          : dropdownContent}
      </div>
    );
  },
);

Select.displayName = "NumericSelect";
export default Select;
