type PageBackgroundProps = { stage: "input" | "chart" | "interpreting" | "report" };

export function PageBackground({ stage }: PageBackgroundProps) {
  return (
    <div className="paper-atmosphere" data-stage={stage} aria-hidden="true">
      <svg className="atmosphere-drawing" viewBox="0 0 800 800" fill="none">
        <circle cx="400" cy="400" r="310" stroke="currentColor" />
        <circle cx="400" cy="400" r="282" stroke="currentColor" strokeDasharray="1 12" />
        <circle cx="400" cy="400" r="215" stroke="currentColor" />
        <path d="M90 400h620M400 90v620M181 181l438 438M181 619l438-438" stroke="currentColor" />
        <path d="M181 181L710 400 181 619 400 90 619 619 90 400 619 181 400 710Z" stroke="currentColor" />
        {[90, 181, 400, 619, 710].map((position) => <circle key={position} cx={position} cy="400" r="4" fill="currentColor" />)}
      </svg>
    </div>
  );
}
