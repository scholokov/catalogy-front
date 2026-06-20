import type { ReactNode } from "react";

type FilmsLayoutProps = {
  children: ReactNode;
  modal: ReactNode;
};

export default function FilmsLayout({ children, modal }: FilmsLayoutProps) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
