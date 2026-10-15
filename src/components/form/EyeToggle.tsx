import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface EyeToggleProps {
  onToggle?: (isVisible: boolean) => void;
  defaultVisible?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ghost" | "outline";
}

const EyeToggle = ({
  onToggle,
  defaultVisible = false,
  size = "md",
  variant = "ghost",
}: EyeToggleProps) => {
  const [isVisible, setIsVisible] = useState(defaultVisible);

  const handleToggle = () => {
    const newState = !isVisible;
    setIsVisible(newState);
    onToggle?.(newState);
  };

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      onClick={handleToggle}
      aria-pressed={isVisible}
      className={`${sizeClasses[size]} group relative rounded-lg transition-all duration-300 hover:bg-accent`}
    >
      <div className="relative">
        {isVisible ? (
          <Eye
            className={`${iconSizes[size]} text-primary transition-transform duration-300 group-hover:scale-110`}
          />
        ) : (
          <EyeOff
            className={`${iconSizes[size]} text-muted-foreground transition-all duration-300 group-hover:scale-110 group-hover:text-primary`}
          />
        )}
      </div>
      <span className="sr-only">{isVisible ? "Ocultar contraseña" : "Mostrar contraseña"}</span>
    </Button>
  );
};

export default EyeToggle;
