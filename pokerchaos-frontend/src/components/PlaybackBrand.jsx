import bug from "../assets/brand/playback-poker-bug-v1.png";
import compactLockup from "../assets/brand/playback-poker-lockup-compact-v1.png";
import primaryLockup from "../assets/brand/playback-poker-lockup-primary-v1.png";
import mark from "../assets/brand/playback-poker-mark-v1.png";

const BRAND_ASSETS = Object.freeze({
  primary: primaryLockup,
  compact: compactLockup,
  mark,
  bug,
});

const VARIANT_ALIASES = Object.freeze({ wordmark: "compact" });

export default function PlaybackBrand({
  variant = "mark",
  className = "",
  alt = "",
  ...imageProps
}) {
  const requestedVariant = VARIANT_ALIASES[variant] || variant;
  const resolvedVariant = BRAND_ASSETS[requestedVariant] ? requestedVariant : "mark";
  return (
    <img
      {...imageProps}
      src={BRAND_ASSETS[resolvedVariant]}
      alt={alt}
      className={className}
      data-brand-logo={resolvedVariant}
      data-brand-asset-generation="v1"
    />
  );
}
