"use client";

import { useCallback, useState, type HTMLAttributes, type MouseEvent } from "react";

type ElementProps = HTMLAttributes<HTMLElement>;

export interface UseDisclosureProps {
  defaultIsOpen?: boolean;
}

export interface UseDisclosureReturn {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
  getButtonProps: (props?: ElementProps) => ElementProps & { "aria-expanded": boolean; "aria-controls": string };
  getDisclosureProps: (props?: ElementProps) => ElementProps & { hidden: boolean; id: string };
}

export function useDisclosure(
  props: UseDisclosureProps = {}
): UseDisclosureReturn {
  const { defaultIsOpen = false } = props;
  const [isOpen, setIsOpen] = useState(defaultIsOpen);

  const onOpen = useCallback(() => setIsOpen(true), []);
  const onClose = useCallback(() => setIsOpen(false), []);
  const onToggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const getButtonProps = useCallback(
    (props: ElementProps = {}) => ({
      ...props,
      "aria-expanded": isOpen,
      "aria-controls": "disclosure-content",
      onClick: (event: MouseEvent<HTMLElement>) => {
        props.onClick?.(event);
        onToggle();
      },
    }),
    [isOpen, onToggle]
  );

  const getDisclosureProps = useCallback(
    (props: ElementProps = {}) => ({
      ...props,
      hidden: !isOpen,
      id: "disclosure-content",
    }),
    [isOpen]
  );

  return {
    isOpen,
    onOpen,
    onClose,
    onToggle,
    getButtonProps,
    getDisclosureProps,
  };
}
