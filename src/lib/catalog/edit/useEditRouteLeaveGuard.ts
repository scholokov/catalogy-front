"use client";

import { useCallback, useEffect, useRef } from "react";

const LEAVE_CONFIRMATION_MESSAGE = "Є незбережені зміни. Закрити форму?";

type UseEditRouteLeaveGuardParams = {
  isDirty: boolean;
  onCloseNavigation: () => void;
};

export const useEditRouteLeaveGuard = ({
  isDirty,
  onCloseNavigation,
}: UseEditRouteLeaveGuardParams) => {
  const isDirtyRef = useRef(isDirty);
  const onCloseNavigationRef = useRef(onCloseNavigation);
  const isRevertingPopRef = useRef(false);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    onCloseNavigationRef.current = onCloseNavigation;
  }, [onCloseNavigation]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = () => {
      if (isRevertingPopRef.current) {
        isRevertingPopRef.current = false;
        return;
      }

      if (isDirtyRef.current && !window.confirm(LEAVE_CONFIRMATION_MESSAGE)) {
        isRevertingPopRef.current = true;
        window.history.forward();
        return;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const requestClose = useCallback(() => {
    if (typeof window === "undefined") {
      onCloseNavigationRef.current();
      return;
    }
    onCloseNavigationRef.current();
  }, []);

  return {
    requestClose,
  };
};
