"use client";

import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SendHorizonal } from "lucide-react";
import { reportError } from "@/core/logger";
import type { SelectOption } from "@/types";

interface AsyncSelectProps {
  loadOptions:
    | ((inputValue: string) => Promise<SelectOption[]>)
    | SelectOption[];
  onChange?: (option: SelectOption | null) => void;
  value?: SelectOption | null;
  placeholder?: string;
  noOptionsMessage?: string;
  loadingMessage?: string;
  searchHint?: string;
}

const AsyncSelect: React.FC<AsyncSelectProps> = ({
  loadOptions,
  onChange,
  value,
  placeholder = "Selecciona...",
  noOptionsMessage = "No hay opciones",
  loadingMessage = "Cargando...",
  searchHint = "Presiona Enter para buscar",
}) => {
  const [dropdownPosition, setDropdownPosition] = useState<"bottom" | "top">(
    "bottom",
  );
  const [inputValue, setInputValue] = useState<string>(value?.label ?? "");
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedOption, setSelectedOption] = useState<SelectOption | null>(
    value ?? null,
  );
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const calculateDropdownPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropdownHeight = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      setDropdownPosition("top");
    } else {
      setDropdownPosition("bottom");
    }
  };

  // Sincroniza con `value` cuando el padre lo cambia (durante el render, sin efecto).
  const [previousValue, setPreviousValue] = useState(value);
  if (value !== previousValue) {
    setPreviousValue(value);
    if (value) {
      setSelectedOption(value);
      setInputValue(value.label || "");
    }
  }

  const loadOptionsDebounced = async (searchValue: string) => {
    setIsLoading(true);
    setHasSearched(true);
    setHighlightedIndex(-1);
    try {
      const fnValidated =
        typeof loadOptions === "function"
          ? loadOptions
          : async () => loadOptions;
      const results = await fnValidated(searchValue);
      setOptions(results || []);
    } catch (error) {
      reportError(error, { context: "AsyncSelect.loadOptions" });
      setOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setHasSearched(false);
    if (newValue.trim() === "") {
      setIsOpen(false);
      setOptions([]);
      setHighlightedIndex(-1);
      setSelectedOption(null);
      onChange?.(null);
    }
  };

  const handleSearch = () => {
    if (inputValue.trim()) {
      calculateDropdownPosition();
      setIsOpen(true);
      if (typeof loadOptions === "function") {
        void loadOptionsDebounced(inputValue);
      } else {
        setOptions(loadOptions);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && options[highlightedIndex]) {
        handleOptionClick(options[highlightedIndex]);
      } else if (!isOpen) {
        handleSearch();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen && hasSearched && options.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else if (isOpen && options.length > 0) {
        setHighlightedIndex((prev) =>
          prev < options.length - 1 ? prev + 1 : prev,
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isOpen && highlightedIndex > 0) {
        setHighlightedIndex((prev) => prev - 1);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleOptionClick = (option: SelectOption) => {
    setSelectedOption(option);
    setInputValue(option.label);
    setIsOpen(false);
    setHighlightedIndex(-1);
    onChange?.(option);
  };

  const handleInputFocus = () => {
    if (hasSearched && options.length > 0) {
      calculateDropdownPosition();
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const listElement = listRef.current;
      const highlightedElement = listElement.children[
        highlightedIndex
      ] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [highlightedIndex]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-12"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSearch}
          disabled={!inputValue.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2"
        >
          <SendHorizonal className="h-5 w-5 text-primary" />
        </Button>
      </div>

      {isOpen && (
        <div
          className={`absolute left-0 right-0 border border-border rounded-md shadow-lg bg-card z-50 ${
            dropdownPosition === "top" ? "bottom-full mb-1" : "top-full mt-1"
          } max-h-72 overflow-y-auto`}
        >
          {isLoading ? (
            <div className="p-4 flex flex-col items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-sm text-muted-foreground text-center">
                {loadingMessage}
              </span>
            </div>
          ) : options.length > 0 ? (
            <ul ref={listRef}>
              {options.map((option, index) => (
                <li
                  key={option.value || index}
                  className={`px-4 py-2 cursor-pointer transition-colors text-foreground ${
                    highlightedIndex === index
                      ? "bg-accent"
                      : selectedOption?.value === option.value
                        ? "bg-primary/10"
                        : "bg-card"
                  } hover:bg-muted`}
                  onClick={() => handleOptionClick(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {option.label}
                </li>
              ))}
            </ul>
          ) : hasSearched ? (
            <div className="p-4">
              <span className="text-sm text-muted-foreground text-center block">
                {noOptionsMessage}
              </span>
            </div>
          ) : (
            <div className="p-4 flex items-center justify-center gap-2">
              <SendHorizonal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground text-center">
                {searchHint}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AsyncSelect;
