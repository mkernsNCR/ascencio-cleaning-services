/** Field label with a visual required marker; the control itself carries aria-required. */
export function RequiredLabel({ children }: { children: string }) {
  return (
    <>
      {children}
      <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
    </>
  );
}
