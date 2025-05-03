
import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Custom hook to determine if the current viewport width is considered mobile.
 * Returns `undefined` during server-side rendering and initial client hydration,
 * then `true` or `false` after mounting.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // This effect runs only on the client after hydration
    const checkDevice = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Initial check
    checkDevice();

    // Listener for window resize
    window.addEventListener("resize", checkDevice);

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener("resize", checkDevice);
    };
  }, []); // Empty dependency array ensures this runs once on mount

  return isMobile;
}
