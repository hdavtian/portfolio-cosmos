interface HoloImageProps {
  src: string;
  className?: string;
}

/** An image with a holographic sheen and scanlines; reveal/hide is driven by CSS. */
export function HoloImage({ src, className = "" }: HoloImageProps) {
  return (
    <span className={`showcase-holo-image ${className}`}>
      <img src={src} alt="" loading="lazy" decoding="async" />
    </span>
  );
}
