import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageScaffoldProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  iconWrapperClassName?: string;
}

const PageScaffold = ({
  title,
  subtitle,
  icon,
  children,
  headerActions,
  className,
  headerClassName,
  contentClassName,
  iconWrapperClassName,
}: PageScaffoldProps) => {
  return (
    <div
      className={cn(
        "min-h-full overflow-x-hidden bg-linear-to-br from-blue-50 via-background to-green-50 dark:from-blue-950/20 dark:via-background dark:to-green-950/20",
        className,
      )}
      style={{
        overflowX: "hidden",
      }}
    >
      <div
        className={cn(
          "bg-card shadow-sm border-b border-border",
          headerClassName,
        )}
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              {icon && (
                <div
                  className={cn(
                    "h-10 w-10 rounded-lg bg-linear-to-br from-green-500 to-green-600 flex items-center justify-center",
                    iconWrapperClassName,
                  )}
                >
                  {icon}
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-foreground">{title}</h1>
                {subtitle && (
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
            </div>
            {headerActions}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "max-w-7xl mx-auto px-4 py-6 pb-10 md:py-8 md:pb-12",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default PageScaffold;
