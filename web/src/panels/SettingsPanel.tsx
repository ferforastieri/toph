import { LogOut, Server, UserRound } from "lucide-react";
import { api } from "../api";
import { useApp } from "../store";

interface Props {
  version: string;
}

export default function SettingsPanel({ version }: Props) {
  const user = useApp((state) => state.user);
  const setUser = useApp((state) => state.setUser);

  async function logout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-heading">
        <span>Settings</span>
      </div>
      <div className="settings-block">
        <div className="settings-label">Account</div>
        <div className="settings-row">
          <UserRound size={15} />
          <span>{user?.username ?? "unknown"}</span>
        </div>
        <button className="ghost small" onClick={() => void logout()}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
      <div className="settings-block">
        <div className="settings-label">Server</div>
        <div className="settings-row">
          <Server size={15} />
          <span>Toph {version}</span>
        </div>
        <p className="muted small">
          Self-hosted workbench. Sessions, repositories and credentials stay on this server.
        </p>
      </div>
    </div>
  );
}
