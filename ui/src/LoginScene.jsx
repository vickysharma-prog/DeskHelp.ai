/**
 * The reception desk, drawn along the foot of the sign-in panel.
 *
 * It reads left to right and tells one thing: a telephone rings on a counter,
 * the call travels, and somebody's phone lights up at the other end.
 *
 * Drawn as white line art because it sits on the coloured panel, and given its
 * own bounded area there rather than being spread behind the page. A full
 * width band behind centred content runs under the text on one side and
 * disappears behind the form on the other, which is what the earlier version
 * did.
 *
 * Marked aria-hidden. It is decoration, and a screen reader gains nothing from
 * a description of it.
 */

import { greeting } from './greeting.js';


/** A desk telephone: handset resting on its base, with the cord. */
function DeskPhone() {
  return (
    <g className="scene-deskphone">
      <path
        d="M34 26c10 0 9 8 16 8s8-8 16-8 9 8 16 8"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.42"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      <rect x="-34" y="10" width="68" height="20" rx="7" fill="#fff" fillOpacity="0.22" />
      <rect x="-34" y="10" width="68" height="20" rx="7" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2.2" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <circle key={`${row}-${col}`} cx={-12 + col * 10} cy={16 + row * 5} r="1.5" fill="#fff" fillOpacity="0.65" />
        )),
      )}

      <g className="scene-handset">
        <rect x="-37" y="-11" width="14" height="15" rx="5" fill="#fff" fillOpacity="0.78" />
        <rect x="23" y="-11" width="14" height="15" rx="5" fill="#fff" fillOpacity="0.78" />
        <rect x="-26" y="-6" width="52" height="8" rx="4" fill="#fff" fillOpacity="0.78" />
      </g>
    </g>
  );
}

/** One call on its way out. */
function CallCard({ className, width }) {
  return (
    <g className={className}>
      <rect x="0" y="0" width="92" height="28" rx="8" fill="#fff" fillOpacity="0.92" />
      <circle cx="16" cy="14" r="5" fill="#6d4ae0" fillOpacity="0.55" />
      <rect x="28" y="8" width={width} height="4" rx="2" fill="#5b4bd6" fillOpacity="0.4" />
      <rect x="28" y="17" width={width * 0.6} height="3.6" rx="1.8" fill="#5b4bd6" fillOpacity="0.22" />
    </g>
  );
}

export function LoginScene() {
  return (
    <div className="scene" aria-hidden="true">
      <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMax meet">
        {/* The floor. */}
        <line x1="20" y1="300" x2="880" y2="300" stroke="#fff" strokeOpacity="0.3" strokeWidth="2.5" strokeLinecap="round" />

        {/* The clock. */}
        <g>
          <circle cx="74" cy="74" r="27" fill="none" stroke="#fff" strokeOpacity="0.42" strokeWidth="2.6" />
          <line x1="74" y1="74" x2="74" y2="56" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.6" strokeLinecap="round" />
          <line className="scene-hand" x1="74" y1="74" x2="87" y2="74" stroke="#fff" strokeOpacity="0.75" strokeWidth="2.6" strokeLinecap="round" />
        </g>

        {/* The noticeboard, greeting whoever is at the desk right now. */}
        <g>
          <circle cx="290" cy="26" r="4.5" fill="#fff" fillOpacity="0.6" />
          <rect x="150" y="34" width="280" height="98" rx="11" fill="#fff" fillOpacity="0.14" />
          <rect x="150" y="34" width="280" height="98" rx="11" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="2.4" />
          <rect x="161" y="45" width="258" height="76" rx="6" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.8" />
          <text
            x="290"
            y="90"
            textAnchor="middle"
            fill="#fff"
            fillOpacity="0.9"
            fontSize="31"
            fontWeight="620"
            fontFamily="ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif"
          >
            {greeting()}
          </text>
          <line x1="222" y1="106" x2="358" y2="106" stroke="#fff" strokeOpacity="0.3" strokeWidth="2.4" strokeLinecap="round" />
        </g>

        {/* The counter. */}
        <rect x="52" y="200" width="352" height="100" rx="13" fill="#fff" fillOpacity="0.12" />
        <rect x="52" y="200" width="352" height="100" rx="13" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="2.6" />
        <line x1="52" y1="236" x2="404" y2="236" stroke="#fff" strokeOpacity="0.22" strokeWidth="2.4" />

        {/* The telephone on it, ringing. */}
        <g transform="translate(236 166)">
          <circle className="scene-ripple" cx="0" cy="10" r="38" fill="none" stroke="#fff" strokeWidth="2.4" />
          <circle className="scene-ripple d1" cx="0" cy="10" r="38" fill="none" stroke="#fff" strokeWidth="2.4" />
          <circle className="scene-ripple d2" cx="0" cy="10" r="38" fill="none" stroke="#fff" strokeWidth="2.4" />
          <DeskPhone />
        </g>

        {/* The route the calls take. */}
        <path
          className="scene-path"
          d="M440 212C540 212 620 194 716 158"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.4"
          strokeWidth="2.4"
          strokeDasharray="5 11"
          strokeLinecap="round"
        />

        <g transform="translate(436 188)">
          <CallCard className="scene-card" width={44} />
          <CallCard className="scene-card d1" width={34} />
        </g>

        {/* The phone at the other end. */}
        <g className="scene-phone">
          <rect x="782" y="108" width="72" height="128" rx="15" fill="#fff" fillOpacity="0.9" />
          <rect x="798" y="132" width="40" height="6" rx="3" fill="#5b4bd6" fillOpacity="0.35" />
          <rect x="798" y="147" width="28" height="5" rx="2.5" fill="#5b4bd6" fillOpacity="0.2" />
          <circle cx="818" cy="204" r="11" fill="#5b4bd6" fillOpacity="0.3" />
        </g>
      </svg>
    </div>
  );
}
