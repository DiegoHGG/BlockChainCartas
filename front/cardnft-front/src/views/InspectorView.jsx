import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { HoloCard } from "react-holo-card-effect";
import MyTokens from "../components/MyTokens";
import styles from "./InspectorView.module.css";

const NFT_ABI = [
  "function updateEstado(uint256 tokenId, uint8 nuevoEstado)",
  "function totalSupply() view returns (uint256)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "function getCard(uint256 tokenId) view returns (address owner,string juego,string expansion,uint256 numero,string rareza,uint8 estado,uint64 updatedAt)",
];

const MARKET_ABI = [
  "function pendingListings(uint256 tokenId) view returns (address seller, uint256 price, uint64 requestedAt)",
  "function finalizeListing(uint256 tokenId)",
];

const ESTADOS = ["UNKNOWN", "POOR", "PLAYED", "GOOD", "NEAR_MINT", "MINT", "GRADED"];

// ====== PREVIEW IMMAGINE (copiata da MyTokens) ======
function pad3(n) {
  return String(n).padStart(3, "0");
}

function buildImageCandidates(expansion, numero) {
  const id = `${expansion}-${pad3(numero)}`;
  return [`/cards/${id}.webp`, `/cards/${id}.png`, `/cards/${id}.jpg`, `/cards/${id}.jpeg`];
}

function CardPreview({ expansion, numero, className }) {
  const [resolvedUrl, setResolvedUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveUrl() {
      setResolvedUrl(null);
      const candidates = buildImageCandidates(expansion, numero);

      for (const url of candidates) {
        const ok = await new Promise((r) => {
          const img = new Image();
          img.onload = () => r(true);
          img.onerror = () => r(false);
          img.src = url;
        });

        if (!cancelled && ok) {
          setResolvedUrl(url);
          return;
        }
      }
    }

    resolveUrl();
    return () => {
      cancelled = true;
    };
  }, [expansion, numero]);

  if (!resolvedUrl) return null;

  return (
    <div className={className}>
      <HoloCard url={resolvedUrl} width={140} height={190} showSparkles />
    </div>
  );
}
// ====================================================

export default function InspectorView({ provider, account, nftAddress, marketAddress, onStatus }) {
  const [tokenId, setTokenId] = useState("1");
  const [estado, setEstado] = useState("3");

  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const nftRead = useMemo(() => {
    if (!provider || !nftAddress) return null;
    return new ethers.Contract(nftAddress, NFT_ABI, provider);
  }, [provider, nftAddress]);

  const marketRead = useMemo(() => {
    if (!provider || !marketAddress) return null;
    return new ethers.Contract(marketAddress, MARKET_ABI, provider);
  }, [provider, marketAddress]);

  async function loadPending() {
    try {
      if (!nftRead || !marketRead) return;
      setLoadingPending(true);
      onStatus?.("Cargando tokens en revisión...");

      const supply = await nftRead.totalSupply();
      const total = Number(supply);

      const items = [];
      for (let i = 0; i < total; i++) {
        const tid = await nftRead.tokenByIndex(i);

        let p;
        try {
          p = await marketRead.pendingListings(tid);
        } catch {
          continue;
        }

        if (!p?.seller || p.seller === ethers.ZeroAddress) continue;

        const card = await nftRead.getCard(tid);

        items.push({
          tokenId: tid.toString(),
          seller: p.seller,
          price: p.price ?? 0n,
          requestedAt: Number(p.requestedAt ?? 0),
          juego: card[1],
          expansion: card[2],
          numero: card[3].toString(),
          rareza: card[4],
          estadoActual: Number(card[5]),
        });
      }

      setPending(items);
      onStatus?.(`✅ En revisión: ${items.length}`);
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ Error cargando revisión: ${e?.shortMessage ?? e?.message ?? e}`);
    } finally {
      setLoadingPending(false);
    }
  }

  useEffect(() => {
    if (nftRead && marketRead) loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nftRead, marketRead]);

  async function update() {
    try {
      if (!provider) return;

      const signer = await provider.getSigner();
      const nft = new ethers.Contract(nftAddress, NFT_ABI, signer);
      const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);

      onStatus?.(`1/2 Calificando token ${tokenId}...`);
      const tx1 = await nft.updateEstado(BigInt(tokenId), Number(estado));
      await tx1.wait();

      onStatus?.(`2/2 Publicando token ${tokenId} en el market...`);
      const tx2 = await market.finalizeListing(BigInt(tokenId));
      await tx2.wait();

      onStatus?.("✅ Estado actualizado y token publicado");
      await loadPending();
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ Calificar/Publicar falló: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  const canAct = Number(tokenId) > 0;

  return (
    <div className={styles.page}>
      <MyTokens provider={provider} account={account} nftAddress={nftAddress} marketAddress={marketAddress} onStatus={onStatus} />

      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Inspector Panel</h2>
            <p className={styles.subtitle}>
              Aquí ves los tokens enviados a revisión. Califica y publica para que aparezcan en el market.
            </p>
          </div>

          <div className={styles.me}>
            <div className={styles.meLabel}>Cuenta</div>
            <div className={styles.meValue}>
              <code>{account || "-"}</code>
            </div>
          </div>
        </div>

        {/* ===== SECCIÓN: TOKENS EN REVISIÓN ===== */}
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={loadPending} disabled={loadingPending}>
            {loadingPending ? "Cargando..." : "Refrescar revisión"}
          </button>
          <div className={styles.hint}>
            Tokens con <code>pendingListings[tokenId].seller != 0x0</code>
          </div>
        </div>

        {pending.length === 0 ? (
          <div className={styles.hint} style={{ marginTop: 12 }}>
            No hay tokens en revisión.
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {pending.map((p) => (
              <div key={p.tokenId} className={styles.formRow} style={{ alignItems: "end" }}>
                <div className={styles.fieldSmall}>
                  <label className={styles.label}>Token</label>
                  <div className={styles.input}>#{p.tokenId}</div>
                  <div className={styles.hint}>
                    Seller: <code>{p.seller}</code>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Carta</label>

                  <div className={styles.input} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {/* IMMAGINE */}
                    <CardPreview expansion={p.expansion} numero={p.numero} />

                    {/* INFO */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div>
                        {p.juego} · {p.expansion} · #{p.numero} · {p.rareza}
                      </div>
                      <div className={styles.hint}>
                        Precio solicitado: <b>{ethers.formatEther(p.price)} ETH</b>
                      </div>
                      <div className={styles.hint}>
                        Estado actual: <b>{ESTADOS[p.estadoActual] ?? "?"}</b>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.actions}>
                  <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={() => {
                      setTokenId(p.tokenId);
                      setEstado("3");
                    }}
                  >
                    Cargar en formulario
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* ===== FIN SECCIÓN ===== */}

        {/* ===== FORMULARIO MANUAL ===== */}
        <div className={styles.formRow} style={{ marginTop: 16 }}>
          <div className={styles.fieldSmall}>
            <label className={styles.label}>TokenId</label>
            <input className={styles.input} value={tokenId} onChange={(e) => setTokenId(e.target.value)} placeholder="1" />
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
            <div className={styles.hint}>
              Esto llamará a <code>updateEstado</code> y luego a <code>finalizeListing</code>.
            </div>
          </div>

          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={update} disabled={!canAct}>
              Calificar y publicar
            </button>
          </div>
        </div>
        {/* ===== FIN FORMULARIO ===== */}
      </section>
    </div>
  );
}
