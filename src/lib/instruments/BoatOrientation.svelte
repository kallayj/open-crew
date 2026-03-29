<script lang="ts">
  let { offset }: { offset: number | null } = $props();
  let rotation = $derived(offset ?? 0);
  let calibrated = $derived(offset !== null);
</script>

<!--
  Compass-rose indicator showing the boat's axes in the device's portrait reference frame.
  The arrow group rotates by `offset` degrees clockwise from the portrait y-axis (screen
  top in the device's natural orientation). The static portrait rectangle makes that frame
  of reference explicit — the arrows are always relative to it, regardless of how the
  device is physically oriented on screen.

  Forward arrow: red on the port (left) half, green on the starboard (right) half —
  matching navigation light convention as seen from ahead of the boat.
  Starboard: green. Port: red. Stern: dim.
-->
<svg viewBox="0 0 100 100" class="indicator" class:uncalibrated={!calibrated} aria-hidden="true">
  <!-- Portrait device outline — fixed, defines the reference frame for the arrows -->
  <rect x="31" y="5" width="38" height="90" rx="4" ry="4"
        fill="none" stroke="#444" stroke-width="1.5" />

  <g transform="rotate({rotation}, 50, 50)">
    <!-- Forward arrow: port half red, starboard half green -->
    <polygon points="50,14 43,34 50,34" fill="#ff5252" />
    <polygon points="50,14 50,34 57,34" fill="#00e676" />

    <!-- Starboard arrow: green -->
    <polygon points="86,50 66,43 66,57" fill="#00e676" />

    <!-- Port arrow: red -->
    <polygon points="14,50 34,43 34,57" fill="#ff5252" />

    <!-- Stern arrow: dim -->
    <polygon points="50,86 43,66 57,66" fill="#555" />

    <circle cx="50" cy="50" r="3.5" fill="#777" />
  </g>
</svg>

<style>
  .indicator {
    width: 100%;
    height: 100%;
    transition: opacity 0.4s;
  }

  .indicator.uncalibrated {
    opacity: 0.2;
  }
</style>
