import React, { useState } from "react";
import { IconX } from "./Icons";

export function TokenModal(props: {
  open: boolean;
  onClose: () => void;
  onSave: (token: string) => void;
}) {
  const [draft, setDraft] = useState<string>(localStorage.getItem("admin_token") || "");

  if (!props.open) return null;

  return (
    <div className="modalOverlay" onMouseDown={props.onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <div className="modalTitle">Admin token</div>
            <div className="modalSub">Stored locally in this browser</div>
          </div>
          <button className="iconBtn" onClick={props.onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        <div className="modalBody">
          <label className="label">Bearer token</label>
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="dev-admin-token"
            autoFocus
          />
          <div className="modalHint">Tip: leave empty in dev if your backend allows it.</div>
        </div>

        <div className="modalFoot">
          <button className="btn ghost" onClick={props.onClose}>Cancel</button>
          <button className="btn" onClick={() => props.onSave(draft.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}