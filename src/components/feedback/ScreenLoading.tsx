import { FC } from "react";

const ScreenLoading: FC = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="relative w-24 h-24">
        {/* Outer rotating gradient ring */}
        <div
          className="absolute inset-0 rounded-full animate-spin-slow
                     bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
        >
          {/* Blurred layers for glow effect */}
          <span className="absolute inset-0 rounded-full bg-gradient-to-l from-blue-500 via-purple-500 to-pink-500 blur-sm" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-l from-blue-500 via-purple-500 to-pink-500 blur-md" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-l from-blue-500 via-purple-500 to-pink-500 blur-xl" />
        </div>

        {/* Inner circle */}
        <div className="absolute inset-2 rounded-full bg-card border-4 border-border dark:bg-neutral-900" />
      </div>
    </div>
  );
};

export default ScreenLoading;

/* Tailwind config suggestion:
   Add custom animation for smoother rotation
   theme.extend.animation = {
     'spin-slow': 'spin 1.5s linear infinite',
   }
*/
