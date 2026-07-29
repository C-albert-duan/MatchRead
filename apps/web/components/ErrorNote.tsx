type Props = {
  children: React.ReactNode;
};

/** Generic alert for critical routes (founder, etc.). */
export function ErrorNote({ children }: Props) {
  return (
    <p className="form-error" role="alert">
      {children}
    </p>
  );
}
