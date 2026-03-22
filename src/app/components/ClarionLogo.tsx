interface ClarionLogoProps {
  className?: string;
  size?: number;
  animate?: boolean;
}

export function ClarionLogo({ className = '', size = 36, animate = true }: ClarionLogoProps) {
  const id = `clarion-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="80 80 471 471"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <radialGradient
          id={`${id}-g0`}
          cx="0" cy="0" r="1"
          gradientTransform="matrix(-0.197 -340.785 -340.785 0.184 315.5 315.5)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E8F2FF" stopOpacity="0.95">
            {animate && (
              <animate attributeName="stop-color" values="#E8F2FF;#D4E8FF;#C5DBFC;#E8F2FF" dur="6s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="0.5" stopColor="#BFDBFE" stopOpacity="0.85">
            {animate && (
              <animate attributeName="stop-color" values="#BFDBFE;#A7CBFB;#B8D4FE;#BFDBFE" dur="6s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="0.7" stopColor="white" stopOpacity="0" />
        </radialGradient>

        <radialGradient
          id={`${id}-g1`}
          cx="0" cy="0" r="1"
          gradientTransform="matrix(0.168 -221.874 -209.604 -0.167 344.832 315.374)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ADD5EF" stopOpacity="0.9">
            {animate && (
              <animate attributeName="stop-color" values="#ADD5EF;#93C5E8;#B9DEFA;#ADD5EF" dur="8s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="0.5" stopColor="#E7F1FF" stopOpacity="0.8">
            {animate && (
              <animate attributeName="stop-color" values="#E7F1FF;#D0E4FC;#E2EDFF;#E7F1FF" dur="8s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="0.9" stopColor="white" stopOpacity="0" />
        </radialGradient>

        <radialGradient
          id={`${id}-g2`}
          cx="0" cy="0" r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(328.639 331.465) rotate(-90) scale(311.424 295.025)"
        >
          <stop stopColor="#A7BFFB" stopOpacity="1">
            {animate && (
              <animate attributeName="stop-color" values="#A7BFFB;#8EAAF7;#B5C9FC;#A7BFFB" dur="7s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="0.45" stopColor="#C2D3FC" stopOpacity="0.6">
            {animate && (
              <animate attributeName="stop-color" values="#C2D3FC;#AABEF9;#D0DEFE;#C2D3FC" dur="7s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="0.75" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer blob */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M340.05 2.37499C421.758 18.2641 431.348 126.118 485.394 187.364C531.003 239.049 613.376 261.065 627.089 327.655C642.513 402.556 610.879 481.179 557.508 537.553C501.881 596.309 422.473 628.425 340.05 630.841C255.002 633.335 171.462 606.438 108.967 550.704C43.9526 492.721 -2.34725 413.063 0.0920367 327.655C2.47988 244.048 59.827 175.456 121.366 116.574C182.555 58.0268 255.589 -14.0495 340.05 2.37499Z"
        fill={`url(#${id}-g0)`}
      >
        {animate && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 315.5 315.5;3 315.5 315.5;0 315.5 315.5;-3 315.5 315.5;0 315.5 315.5"
            dur="12s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* Middle blob */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M298.721 103.621C343.148 116.086 393.375 90.184 433.004 114.462C474.185 139.69 485.316 193.155 512.039 234.304C552.655 296.845 638.116 342.963 630.075 417.912C622.292 490.459 541.511 531.645 477.012 560.807C421.124 586.074 359.349 561.093 298.721 567.723C227.146 575.55 147.905 648.56 90.8583 603.035C33.3212 557.118 72.2263 459.076 68.3431 383.873C65.6252 331.237 67.1794 282.158 71.5782 229.644C77.5906 157.866 37.5262 54.6589 98.7653 20.6825C163.652 -15.3175 227.691 83.692 298.721 103.621Z"
        fill={`url(#${id}-g1)`}
      >
        {animate && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 315.5 315.5;-2 315.5 315.5;0 315.5 315.5;2 315.5 315.5;0 315.5 315.5"
            dur="10s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* Inner blob */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M317.415 139.389C349.2 147.017 378.413 157.279 409.038 169.192C449.283 184.847 501.351 182.322 525.496 220.331C549.524 258.156 529.716 309.251 527.053 354.974C524.134 405.072 538.984 462.667 509.131 501.248C479.269 539.841 424.847 539.776 378.626 546.796C338.002 552.965 296.273 555.889 258.236 539.349C222.121 523.644 196.939 490.23 172.839 457.309C149.732 425.744 127.688 392.477 121.689 352.822C115.628 312.756 127.186 273.485 139.21 235.008C152.481 192.538 157.845 137.849 195.118 117.85C232.847 97.6057 276.264 129.512 317.415 139.389Z"
        fill={`url(#${id}-g2)`}
      >
        {animate && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 315.5 315.5;2.5 315.5 315.5;0 315.5 315.5;-2.5 315.5 315.5;0 315.5 315.5"
            dur="9s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* White stroke elements scaled down slightly, centred on shield */}
      <g transform="translate(315.5,315.5) scale(0.82) translate(-315.5,-315.5)">
        {/* White shield */}
        <path
          d="M420.667 322.301C420.667 385.745 374.656 417.467 319.97 435.866C317.106 436.803 313.995 436.758 311.162 435.739C256.344 417.467 210.333 385.745 210.333 322.301V233.48C210.333 230.114 211.718 226.887 214.184 224.507C216.649 222.128 219.993 220.791 223.479 220.791C249.771 220.791 282.635 205.564 305.509 186.277C308.294 183.981 311.837 182.719 315.5 182.719C319.163 182.719 322.706 183.981 325.491 186.277C348.496 205.691 381.229 220.791 407.521 220.791C411.007 220.791 414.351 222.128 416.816 224.507C419.282 226.887 420.667 230.114 420.667 233.48V322.301Z"
          stroke="white"
          strokeWidth={size < 40 ? 40 : 26.2917}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

      </g>
    </svg>
  );
}
