import { useMemo, useState } from "react";
import { ethers } from "ethers";
import MyTokens from "../components/MyTokens";

// ABI AccessControl mínimo
const ACCESS_ABI = [
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
];

export default function AdminView({ provider, account, nftAddress, marketAddress, onStatus }) {
  const [target, setTarget] = useState("");
  const [role, setRole] = useState("MINTER_ROLE"); // MINTER_ROLE / INSPECTOR_ROLE

  const roleHash = useMemo(() => ethers.id(role), [role]);

  const nftRead = useMemo(() => {
    if (!provider) return null;
    return new ethers.Contract(nftAddress, ACCESS_ABI, provider);
  }, [provider, nftAddress]);

  async function grant() {
    try {
      if (!provider) return;
      const signer = await provider.getSigner();
      const nft = new ethers.Contract(nftAddress, ACCESS_ABI, signer);

      onStatus?.(`Dando ${role} a ${target}...`);
      const tx = await nft.grantRole(roleHash, target);
      await tx.wait();
      onStatus?.(`✅ Role ${role} concedido a ${target}`);
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ grantRole falló: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function revoke() {
    try {
      if (!provider) return;
      const signer = await provider.getSigner();
      const nft = new ethers.Contract(nftAddress, ACCESS_ABI, signer);

      onStatus?.(`Quitando ${role} a ${target}...`);
      const tx = await nft.revokeRole(roleHash, target);
      await tx.wait();
      onStatus?.(`✅ Role ${role} revocado a ${target}`);
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ revokeRole falló: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function check() {
    try {
      if (!nftRead) return;
      const ok = await nftRead.hasRole(roleHash, target);
      onStatus?.(ok ? `✅ ${target} TIENE ${role}` : `❌ ${target} NO tiene ${role}`);
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ hasRole falló: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
        <h2 style={{ marginTop: 0 }}>Admin Panel</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Address objetivo (0x...)"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ padding: 8, width: 380, maxWidth: "100%" }}
          />

          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: 8 }}>
            <option value="MINTER_ROLE">MINTER_ROLE</option>
            <option value="INSPECTOR_ROLE">INSPECTOR_ROLE</option>
          </select>

          <button onClick={check} style={{ padding: "8px 12px", cursor: "pointer" }}>Check</button>
          <button onClick={grant} style={{ padding: "8px 12px", cursor: "pointer" }}>Grant</button>
          <button onClick={revoke} style={{ padding: "8px 12px", cursor: "pointer" }}>Revoke</button>
        </div>

        <div style={{ marginTop: 10, opacity: 0.75 }}>
          Tu cuenta admin actual: <code>{account || "-"}</code>
        </div>
      </div>

      {/* Admin también ve sus tokens y puede vender */}
      <MyTokens
        provider={provider}
        account={account}
        nftAddress={nftAddress}
        marketAddress={marketAddress}
        onStatus={onStatus}
      />
    </div>
  );
}
