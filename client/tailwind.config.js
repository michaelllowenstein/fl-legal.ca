/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#64748b',  // slate-500  — primary
          light:   '#475569',  // slate-600  — secondary / hover
          gold:    '#334155',  // slate-700  — accent
          cream:   '#1e293b',  // slate-800  — info / surface
          dark:    '#0f172a',  // slate-900  — base / deepest bg
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
        },
      },
      keyframes: {
        dialogIn:   { from: { opacity: '0' }, to: { opacity: '1' } },
        dialogOut:  { from: { opacity: '1' }, to: { opacity: '0' } },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96) translateY(4px)' },
          to:   { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-600px 0' },
          '100%': { backgroundPosition: '600px 0'  },
        },
        progressIn: {
          from: { transform: 'scaleX(0)' },
          to:   { transform: 'scaleX(1)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans:  ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono:  ["var(--font-mono)"],
      },
      animation: {
        'dialog-in':  'dialogIn 0.18s ease both',
        'dialog-out': 'dialogOut 0.15s ease both',
        'scale-in':   'scaleIn 0.22s cubic-bezier(0.34,1.2,0.64,1) both',
        'slide-down': 'slideDown 0.2s ease both',
        'fade-up':    'fadeUp 0.38s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in':    'fadeIn 0.24s ease both',
        'shimmer':    'shimmer 1.6s linear infinite',
      },
    },
  },
};

// /** @type {import('tailwindcss').Config} */
// module.exports = {
//   content: ['./src/**/*.{html,ts}'],
//   darkMode: ["class"],
//   theme: {
//     extend: {
//       colors: {
//         brand: {
//           DEFAULT: '#1a3a5c',
//           light:   '#2d6a9f',
//           gold:    '#afafaf',
//           cream:   '#79a2b7',
//           dark:    '#353f49',
//         },
//         border: "var(--border)",
//         input: "var(--input)",
//         ring: "var(--ring)",
//         background: "var(--background)",
//         foreground: "var(--foreground)",
//         primary: {
//           DEFAULT: "var(--primary)",
//           foreground: "var(--primary-foreground)",
//         },
//         secondary: {
//           DEFAULT: "var(--secondary)",
//           foreground: "var(--secondary-foreground)",
//         },
//         destructive: {
//           DEFAULT: "var(--destructive)",
//           foreground: "var(--destructive-foreground)",
//         },
//         muted: {
//             DEFAULT: "var(--muted)",
//           foreground: "var(--muted-foreground)",
//         },
//         accent: {
//           DEFAULT: "var(--accent)",
//           foreground: "var(--accent-foreground)",
//         },
//         popover: {
//           DEFAULT: "var(--popover)",
//           foreground: "var(--popover-foreground)",
//         },
//         card: {
//           DEFAULT: "var(--card)",
//           foreground: "var(--card-foreground)",
//         },
//         sidebar: {
//           DEFAULT: "var(--sidebar)",
//           foreground: "var(--sidebar-foreground)",
//           primary: "var(--sidebar-primary)",
//           "primary-foreground": "var(--sidebar-primary-foreground)",
//           accent: "var(--sidebar-accent)",
//           "accent-foreground": "var(--sidebar-accent-foreground)",
//           border: "var(--sidebar-border)",
//           ring: "var(--sidebar-ring)",
//         },
//         chart: {
//           1: "var(--chart-1)",
//           2: "var(--chart-2)",
//           3: "var(--chart-3)",
//           4: "var(--chart-4)",
//           5: "var(--chart-5)",
//         },
//       },
//       keyframes: {
//         // Dialog backdrop
//         dialogIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
//         dialogOut: { from: { opacity: '1' }, to: { opacity: '0' } },
//         // Panel entrance
//         scaleIn: {
//           from: { opacity: '0', transform: 'scale(0.96) translateY(4px)' },
//           to:   { opacity: '1', transform: 'scale(1) translateY(0)' },
//         },
//         // Toast
//         slideDown: {
//           from: { opacity: '0', transform: 'translateY(-8px)' },
//           to:   { opacity: '1', transform: 'translateY(0)' },
//         },
//         // Page content entrance
//         fadeUp: {
//           from: { opacity: '0', transform: 'translateY(16px)' },
//           to:   { opacity: '1', transform: 'translateY(0)' },
//         },
//         // Skeleton shimmer
//         shimmer: {
//           '0%':   { backgroundPosition: '-600px 0' },
//           '100%': { backgroundPosition: '600px 0'  },
//         },
//         // Reading progress bar
//         progressIn: {
//           from: { transform: 'scaleX(0)' },
//           to:   { transform: 'scaleX(1)' },
//         },
//         // Fade in only
//         fadeIn: {
//           from: { opacity: '0' },
//           to:   { opacity: '1' },
//         }
//       },
//       borderRadius: {
//         xl: "calc(var(--radius) + 4px)",
//         lg: "var(--radius)",
//         md: "calc(var(--radius) - 2px)",
//         sm: "calc(var(--radius) - 4px)",
//       },
//       fontFamily: {
//         sans: ["var(--font-sans)"],
//         serif: ["var(--font-serif)"],
//         mono: ["var(--font-mono)"],
//       },
//       animation: {
//         'dialog-in':  'dialogIn 0.18s ease both',
//         'dialog-out': 'dialogOut 0.15s ease both',
//         'scale-in':   'scaleIn 0.22s cubic-bezier(0.34,1.2,0.64,1) both',
//         'slide-down': 'slideDown 0.2s ease both',
//         'fade-up':    'fadeUp 0.38s cubic-bezier(0.22,1,0.36,1) both',
//         'fade-in':    'fadeIn 0.24s ease both',
//         'shimmer':    'shimmer 1.6s linear infinite',
//       }
//     }
//   }
// }

