import type { ReactNode } from "react";

type GamesLayoutProps = {
  children: ReactNode;
  modal: ReactNode;
};

export default function GamesLayout({ children, modal }: GamesLayoutProps) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
