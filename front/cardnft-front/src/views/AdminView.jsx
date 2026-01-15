import { useMemo, useState } from "react";
import { ethers } from "ethers";
import MyTokens from "../components/MyTokens";
import styles from "./AdminView.module.css";

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

  const canAct = target?.startsWith("0x") && target.length >= 42;

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Admin Panel</h2>
            <p className={styles.subtitle}>Gestiona roles de usuarios (MINTER / INSPECTOR) desde tu cuenta admin.</p>
          </div>
          <div className={styles.me}>
            <div className={styles.meLabel}>Admin actual</div>
            <div className={styles.meValue}>
              <code>{account || "-"}</code>
            </div>
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label}>Address objetivo</label>
            <input
              className={styles.input}
              placeholder="0x..."
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <div className={styles.hint}>Pega una address EVM válida (0x...).</div>
          </div>

          <div className={styles.fieldSmall}>
            <label className={styles.label}>Rol</label>
            <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="MINTER_ROLE">MINTER_ROLE</option>
              <option value="INSPECTOR_ROLE">INSPECTOR_ROLE</option>
            </select>
            <div className={styles.hint}>Se convierte internamente a keccak256.</div>
          </div>

          <div className={styles.actions}>
            <button className={styles.btn} onClick={check} disabled={!canAct}>
              Check
            </button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={grant} disabled={!canAct}>
              Grant
            </button>
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={revoke} disabled={!canAct}>
              Revoke
            </button>
          </div>
        </div>
      </section>

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
