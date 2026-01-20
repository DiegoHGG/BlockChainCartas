import { useEffect, useState } from "react";
import { ethers } from "ethers";
import MyTokens from "../components/MyTokens";
import styles from "./UserView.module.css";

const NFT_ABI = [
  "function mintCard(address to,string juego,string expansion,uint256 numero,string rareza,uint8 estadoInicial) returns (uint256)",
];

const ESTADOS = ["UNKNOWN","POOR","PLAYED","GOOD","NEAR_MINT","MINT","GRADED"];

export default function UserView({ provider, account, nftAddress, marketAddress, canMint, onStatus }) {
  const [mintTo, setMintTo] = useState(account || "");
  const [juego, setJuego] = useState("One Piece TCG");
  const [expansion, setExpansion] = useState("OP09");
  const [numero, setNumero] = useState("1");
  const [rareza, setRareza] = useState("SR");
  const [estado, setEstado] = useState("4");
  const [minting, setMinting] = useState(false);

  // ✅ Si cambia la cuenta conectada, actualiza el To por defecto
  useEffect(() => {
    setMintTo(account || "");
  }, [account]);

  async function mint() {
    try {
      if (!provider) return;

      const to = (mintTo || account || "").trim();
      if (!ethers.isAddress(to)) {
        onStatus?.("⚠️ Dirección 'To' inválida.");
        return;
      }

      if (!numero || Number(numero) < 0) {
        onStatus?.("⚠️ 'Número' inválido.");
        return;
      }

      setMinting(true);
      const signer = await provider.getSigner();
      const nft = new ethers.Contract(nftAddress, NFT_ABI, signer);

      onStatus?.("Minteando...");
      const tx = await nft.mintCard(
        to,
        juego,
        expansion,
        BigInt(numero),
        rareza,
         0
      );
      await tx.wait();

      onStatus?.("✅ Mint OK");
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ Mint falló: ${e?.shortMessage ?? e?.message ?? e}`);
    } finally {
      setMinting(false);
    }
  }

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
            <h2 className={styles.title}>User / Minter</h2>
            <p className={styles.subtitle}>
              Aquí gestionas tus tokens. Si tienes <code>MINTER_ROLE</code>, también puedes mintear.
            </p>
          </div>

          <div className={styles.me}>
            <div className={styles.meLabel}>Cuenta</div>
            <div className={styles.meValue}>
              <code>{account || "-"}</code>
            </div>
          </div>
        </div>

        {!canMint ? (
          <div className={styles.notice}>
            No tienes <code>MINTER_ROLE</code>, así que la sección de mint está oculta.
          </div>
        ) : (
          <>
            <div className={styles.sectionTitleRow}>
              <h3 className={styles.sectionTitle}>Mint</h3>
              <span className={styles.badge}>MINTER</span>
            </div>

            <div className={styles.grid}>
              <div className={styles.field}>
                <label className={styles.label}>To</label>
                <input
                  className={styles.input}
                  value={mintTo}
                  onChange={(e) => setMintTo(e.target.value)}
                  placeholder={account || "0x..."}
                />
                <div className={styles.hint}>Por defecto es tu wallet conectada.</div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Estado inicial</label>
                <select
                  className={styles.select}
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                >
                  {ESTADOS.map((x, i) => (
                    <option key={i} value={i}>
                      {i} - {x}
                    </option>
                  ))}
                </select>
                <div className={styles.hint}>Se guarda también el timestamp.</div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Juego</label>
                <input className={styles.input} value={juego} onChange={(e) => setJuego(e.target.value)} />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Expansión</label>
                <input className={styles.input} value={expansion} onChange={(e) => setExpansion(e.target.value)} />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Número</label>
                <input
                  className={styles.input}
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="1"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Rareza</label>
                <input className={styles.input} value={rareza} onChange={(e) => setRareza(e.target.value)} />
              </div>
            </div>

            <div className={styles.actions}>
              <button
                onClick={mint}
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={minting}
              >
                {minting ? "Minteando..." : "Mint"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
