import { motion } from 'motion/react';

interface AmbientBackgroundProps {
  variant?: 'hero' | 'subtle' | 'minimal' | 'midpage';
  className?: string;
}

export function AmbientBackground({ variant = 'subtle', className = '' }: AmbientBackgroundProps) {
  // Much lighter, more visible colors with higher opacity
  const colors = {
    hero: [
      'rgba(191, 219, 254, 0.75)',    // blue-200 - much lighter and more visible
      'rgba(224, 242, 254, 0.7)',     // blue-100
      'rgba(239, 246, 255, 0.65)',    // blue-50
    ],
    subtle: [
      'rgba(191, 219, 254, 0.6)',   
      'rgba(224, 242, 254, 0.55)',
      'rgba(239, 246, 255, 0.5)',
    ],
    minimal: [
      'rgba(191, 219, 254, 0.5)',
      'rgba(224, 242, 254, 0.45)',
      'rgba(239, 246, 255, 0.4)',
    ],
    midpage: [
      'rgba(191, 219, 254, 0.55)',
      'rgba(224, 242, 254, 0.5)',
      'rgba(239, 246, 255, 0.45)',
    ],
  };

  const selectedColors = colors[variant];

  // Much faster, more dramatic animations for obvious motion (10-15 seconds)
  const layer1Variants = {
    initial: { 
      x: '-15%', 
      y: '-15%',
      scale: 1,
    },
    animate: { 
      x: ['-15%', '25%', '-15%'],
      y: ['-15%', '20%', '-15%'],
      scale: [1, 1.3, 1],
      transition: {
        duration: 12,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      },
    },
  };

  const layer2Variants = {
    initial: { 
      x: '20%', 
      y: '15%',
      scale: 1.1,
    },
    animate: { 
      x: ['20%', '-20%', '20%'],
      y: ['15%', '-20%', '15%'],
      scale: [1.1, 0.85, 1.1],
      transition: {
        duration: 15,
        repeat: Infinity,
        ease: 'easeInOut' as const,
        delay: 1,
      },
    },
  };

  const layer3Variants = {
    initial: { 
      x: '-10%', 
      y: '25%',
      scale: 0.9,
    },
    animate: { 
      x: ['-10%', '30%', '-10%'],
      y: ['25%', '-10%', '25%'],
      scale: [0.9, 1.25, 0.9],
      transition: {
        duration: 10,
        repeat: Infinity,
        ease: 'easeInOut' as const,
        delay: 3,
      },
    },
  };

  if (variant === 'midpage') {
    return (
      <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
        {/* Drifting ellipse — wide, low opacity */}
        <motion.div
          initial={{ x: '10%', y: '5%', rotate: -15, scale: 1 }}
          animate={{
            x: ['10%', '-8%', '18%', '10%'],
            y: ['5%', '20%', '-5%', '5%'],
            rotate: [-15, 10, -20, -15],
            scale: [1, 1.15, 0.9, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute"
          style={{
            width: '600px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at 40% 60%, rgba(167,191,251,0.45), rgba(191,219,254,0.3) 50%, transparent 75%)',
            filter: 'blur(48px)',
            top: '10%',
            left: '5%',
          }}
        />
        {/* Roaming blob — tall, offset rhythm */}
        <motion.div
          initial={{ x: '60%', y: '30%', rotate: 20, scale: 1.1 }}
          animate={{
            x: ['60%', '30%', '70%', '60%'],
            y: ['30%', '50%', '15%', '30%'],
            rotate: [20, -10, 30, 20],
            scale: [1.1, 0.85, 1.2, 1.1],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute"
          style={{
            width: '350px',
            height: '500px',
            borderRadius: '40% 60% 55% 45% / 50% 45% 55% 50%',
            background: 'radial-gradient(ellipse at 60% 40%, rgba(196,181,253,0.3), rgba(167,191,251,0.2) 55%, transparent 75%)',
            filter: 'blur(52px)',
            top: '0%',
            right: '10%',
          }}
        />
        {/* Small accent — faster, bottom-right */}
        <motion.div
          initial={{ x: '0%', y: '60%', scale: 0.8 }}
          animate={{
            x: ['0%', '20%', '-10%', '0%'],
            y: ['60%', '40%', '70%', '60%'],
            scale: [0.8, 1.1, 0.75, 0.8],
          }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
          className="absolute"
          style={{
            width: '280px',
            height: '280px',
            borderRadius: '60% 40% 45% 55% / 55% 60% 40% 45%',
            background: 'radial-gradient(circle at 50% 50%, rgba(224,242,254,0.4), transparent 70%)',
            filter: 'blur(38px)',
            bottom: '5%',
            right: '25%',
          }}
        />
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* Layer 1 - Largest, slowest */}
      <motion.div
        variants={layer1Variants}
        initial="initial"
        animate="animate"
        className="absolute w-[700px] h-[700px] rounded-full"
        style={{
          background: `radial-gradient(circle at center, ${selectedColors[0]}, ${selectedColors[1]} 45%, transparent 75%)`,
          filter: 'blur(40px)',
          top: '10%',
          left: '20%',
        }}
      />

      {/* Layer 2 - Medium, offset timing */}
      <motion.div
        variants={layer2Variants}
        initial="initial"
        animate="animate"
        className="absolute w-[600px] h-[600px] rounded-full"
        style={{
          background: `radial-gradient(circle at center, ${selectedColors[1]}, ${selectedColors[2]} 50%, transparent 70%)`,
          filter: 'blur(35px)',
          top: '30%',
          right: '15%',
        }}
      />

      {/* Layer 3 - Smaller, different rhythm */}
      <motion.div
        variants={layer3Variants}
        initial="initial"
        animate="animate"
        className="absolute w-[550px] h-[550px] rounded-full"
        style={{
          background: `radial-gradient(circle at center, ${selectedColors[2]}, ${selectedColors[0]} 40%, transparent 65%)`,
          filter: 'blur(38px)',
          bottom: '15%',
          left: '25%',
        }}
      />
    </div>
  );
}