import { useState } from "react";
import { ethers } from "ethers";
import MyTokens from "../components/MyTokens";
import styles from "./InspectorView.module.css";

const NFT_ABI = [
  "function updateEstado(uint256 tokenId, uint8 nuevoEstado)",
];

const ESTADOS = ["UNKNOWN","POOR","PLAYED","GOOD","NEAR_MINT","MINT","GRADED"];

export default function InspectorView({ provider, account, nftAddress, marketAddress, onStatus }) {
  const [tokenId, setTokenId] = useState("1");
  const [estado, setEstado] = useState("3");

  async function update() {
    try {
      if (!provider) return;

      const signer = await provider.getSigner();
      const nft = new ethers.Contract(nftAddress, NFT_ABI, signer);

      onStatus?.(`Actualizando estado token ${tokenId}...`);
      const tx = await nft.updateEstado(BigInt(tokenId), Number(estado));
      await tx.wait();

      onStatus?.("✅ Estado actualizado");
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ updateEstado falló: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  const canAct = Number(tokenId) > 0;

  return (
    <div className={styles.page}>
      <MyTokens
        provider={provider}
        account={account}
        nftAddress={nftAddress}
        marketAddress={marketAddress}
        onStatus={onStatus}
      />

      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Inspector Panel</h2>
            <p className={styles.subtitle}>
              Como inspector puedes actualizar el estado de cualquier token (aunque no seas el owner).
            </p>
          </div>

          <div className={styles.me}>
            <div className={styles.meLabel}>Cuenta</div>
            <div className={styles.meValue}>
              <code>{account || "-"}</code>
            </div>
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.fieldSmall}>
            <label className={styles.label}>TokenId</label>
            <input
              className={styles.input}
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              placeholder="1"
            />
            <div className={styles.hint}>Debe existir en la colección.</div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Nuevo estado</label>
            <select className={styles.select} value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ESTADOS.map((x, i) => (
                <option key={i} value={i}>
                  {i} - {x}
                </option>
              ))}
            </select>
            <div className={styles.hint}>Esto llamará a <code>updateEstado(tokenId, estado)</code>.</div>
          </div>

          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={update} disabled={!canAct}>
              Actualizar estado
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
