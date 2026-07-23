import * as React from 'react';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MenuItem {
  riveIcon: {
    src: string;
    stateMachine: string;
  };
  label: string;
  hotkey: string;
  onClick?: () => void;
}

interface AnimatedMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  items: MenuItem[];
}

function RiveIcon({
  src,
  stateMachine,
  index,
  activeIndex,
}: {
  src: string;
  stateMachine: string;
  index: number;
  activeIndex: number | null;
}) {
  const { RiveComponent, rive } = useRive({
    src,
    stateMachines: stateMachine,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
    autoplay: false,
  });

  React.useEffect(() => {
    if (!rive) return;

    if (activeIndex === index) {
      rive.play(stateMachine);
    } else {
      rive.reset();
    }
  }, [activeIndex, index, rive, stateMachine]);

  return <RiveComponent className="size-6" />;
}

export function AnimatedMenu({ items, className, ...props }: AnimatedMenuProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  return (
    <div
      className={cn(
        'relative w-[210px] bg-[#2A2A27] shadow-lg rounded-lg p-0.5',
        "after:content-[''] after:absolute after:inset-0 after:bg-gradient-to-br after:from-white/10 after:to-transparent",
        'after:rounded-lg after:border after:border-transparent after:pointer-events-none',
        className,
      )}
      {...props}
    >
      <menu className="relative">
        {items.map((item, index) => (
          <li key={index}>
            <button
              className={cn(
                'h-[34px] rounded-md flex gap-2 w-full items-center px-2.5 py-1.5',
                'text-sm font-medium text-[#DFDFDC]',
                'focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-[#7A8FF7]',
                'relative z-10 select-none',
                'active:bg-[#3D3D38]',
              )}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={item.onClick}
            >
              <RiveIcon
                src={item.riveIcon.src}
                stateMachine={item.riveIcon.stateMachine}
                index={index}
                activeIndex={hoveredIndex}
              />
              <span>{item.label}</span>
              <span className="ml-auto text-[#5E5E55]">
                <span className="sr-only">Hotkey: </span>
                {item.hotkey}
              </span>
            </button>
          </li>
        ))}

        <motion.div
          className="absolute inset-x-0 h-[34px] bg-[#353531] rounded-md"
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{
            opacity: hoveredIndex !== null ? 1 : 0,
            scale: hoveredIndex !== null ? 1 : 0.75,
            top: hoveredIndex !== null ? hoveredIndex * 34 : 0,
          }}
          transition={{ duration: 0.1 }}
        />
      </menu>
    </div>
  );
}
