"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ColumnComboboxProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  usedOptions?: string[];
  placeholder?: string;
  isInvalid?: boolean;
}

export default function ColumnCombobox({
  options,
  value,
  onChange,
  usedOptions = [],
  placeholder = "Selecciona una columna...",
  isInvalid = false,
}: ColumnComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    return options.filter((opt) =>
      opt.toLowerCase().includes(search.toLowerCase()),
    );
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 30);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm transition-colors",
          isInvalid
            ? "border-destructive/60"
            : value
              ? "border-primary/50"
              : "border-border",
          "hover:border-primary/50",
        )}
      >
        <span
          className={cn(
            "truncate",
            value ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {value || placeholder}
        </span>
        <ChevronDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
      </button>

      {isOpen ? (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="p-2">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar columna..."
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary/50"
            />
          </div>

          <div className="max-h-52 overflow-y-auto px-1 pb-2">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isUsedElsewhere =
                  usedOptions.includes(option) && option !== value;
                return (
                  <div
                    key={option}
                    onClick={() => {
                      if (isUsedElsewhere) return;
                      onChange(option);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                      isUsedElsewhere
                        ? "cursor-not-allowed text-muted-foreground/50"
                        : "cursor-pointer hover:bg-muted",
                    )}
                  >
                    <span className="truncate">{option}</span>
                    {isUsedElsewhere ? (
                      <span className="text-xs text-muted-foreground">
                        en uso
                      </span>
                    ) : value === option ? (
                      <Check className="size-4 text-primary" />
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-2 text-center text-sm text-muted-foreground">
                Sin resultados
              </div>
            )}
          </div>

          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setIsOpen(false);
                setSearch("");
              }}
              className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Quitar mapeo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
