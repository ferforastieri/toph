import { useEffect } from "react";
import { api, ApiError } from "./api";
import { useApp } from "./store";
import Login from "./components/Login";
import Workbench from "./components/Workbench";

export default function App() {
  const user = useApp((state) => state.user);
  const authReady = useApp((state) => state.authReady);
  const setUser = useApp((state) => state.setUser);
  const setAuthReady = useApp((state) => state.setAuthReady);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error(error);
        }
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setAuthReady, setUser]);

  if (!authReady) {
    return (
      <div className="boot">
        <div className="boot-mark">T</div>
        <p>Loading Toph...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <Workbench />;
}
