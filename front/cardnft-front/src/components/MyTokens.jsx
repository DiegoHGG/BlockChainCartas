import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import styles from "./MyTokens.module.css";
import { HoloCard } from "react-holo-card-effect";

// ABI mínimo del NFT (Enumerable + approve + getCard)
const NFT_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function approve(address to, uint256 tokenId)",
  "function setApprovalForAll(address operator, bool approved)",
  "function getCard(uint256 tokenId) view returns (address owner,string juego,string expansion,uint256 numero,string rareza,uint8 estado,uint64 updatedAt)",

];

// ABI mínimo del Market (list/cancel + lectura listing)
const MARKET_ABI = [
  "function list(uint256 tokenId, uint256 price)",
  "function cancel(uint256 tokenId)",
  "function listings(uint256 tokenId) view returns (address seller, uint256 price)",
  "function pendingListings(uint256 tokenId) view returns (address seller, uint256 price, uint64 requestedAt)",
  "function finalizeListing(uint256 tokenId)",

];

const ESTADOS = ["UNKNOWN", "POOR", "PLAYED", "GOOD", "NEAR_MINT", "MINT", "GRADED"];

function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}
function pad3(n) {
  return String(n).padStart(3, "0");
}

function buildImageCandidates(expansion, numero) {
  const id = `${expansion}-${pad3(numero)}`; // OP09-001
  return [
    `/cards/${id}.webp`,
    `/cards/${id}.png`,
    `/cards/${id}.jpg`,
    `/cards/${id}.jpeg`,
  ];
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
      <HoloCard url={resolvedUrl} width={190} height={260} showSparkles />
    </div>
  );
}

export default function MyTokens({ provider, account, nftAddress, marketAddress, onStatus }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState({}); // { [tokenId]: "0.01" }

  const nftRead = useMemo(() => {
    if (!provider || !nftAddress) return null;
    return new ethers.Contract(nftAddress, NFT_ABI, provider);
  }, [provider, nftAddress]);

  const marketRead = useMemo(() => {
    if (!provider || !marketAddress) return null;
    return new ethers.Contract(marketAddress, MARKET_ABI, provider);
  }, [provider, marketAddress]);

  async function loadMyTokens() {
    try {
      if (!nftRead || !account) return;
      setLoading(true);
      onStatus?.("Cargando tus tokens...");

      const bal = await nftRead.balanceOf(account);
      const n = Number(bal);

      const ids = [];
      for (let i = 0; i < n; i++) {
        const tokenId = await nftRead.tokenOfOwnerByIndex(account, i);
        ids.push(tokenId.toString());
      }

      const rows = [];
      for (const idStr of ids) {
        const data = await nftRead.getCard(BigInt(idStr));

        // listing info
        let listing = { seller: ethers.ZeroAddress, price: 0n };
        if (marketRead) {
          try {
            listing = await marketRead.listings(BigInt(idStr));
          } catch {
            // ignore
          }
        }

        // >>> AGGIUNGI QUI: pending info (en revisión)
let pending = { seller: ethers.ZeroAddress, price: 0n, requestedAt: 0 };
if (marketRead) {
  try {
    pending = await marketRead.pendingListings(BigInt(idStr));
  } catch {
    // ignore
  }
}
// <<< FINE


        // approval
        const approved = await nftRead.getApproved(BigInt(idStr));
        const isForAll = await nftRead.isApprovedForAll(account, marketAddress);

        rows.push({
          tokenId: idStr,
          owner: data[0],
          juego: data[1],
          expansion: data[2],
          numero: data[3].toString(),
          rareza: data[4],
          estado: Number(data[5]),
          updatedAt: Number(data[6]),
          listingSeller: listing?.seller,
          listingPrice: listing?.price ?? 0n,
          pendingSeller: pending?.seller,
          pendingPrice: pending?.price ?? 0n,
          pendingRequestedAt: Number(pending?.requestedAt ?? 0),
          approved,
          isForAll,

        });
      }

      setTokens(rows);
      onStatus?.(`✅ Tienes ${rows.length} token(s).`);
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ Error cargando tokens: ${e?.shortMessage ?? e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

async function approveMarket(tokenId) {
  try {
    if (!provider) return;
    const signer = await provider.getSigner();
    const nft = new ethers.Contract(nftAddress, NFT_ABI, signer);

    onStatus?.(`Aprobando market y enviando a inspección el token ${tokenId}...`);

    // >>> 1) Approve GLOBAL al market (consigliato)
    const tx1 = await nft.setApprovalForAll(marketAddress, true);
    await tx1.wait();
    // <<<


    onStatus?.(`✅ Market aprobado + inspección solicitada para token ${tokenId}`);
    await loadMyTokens();
  } catch (e) {
    console.error(e);
    onStatus?.(`❌ Approve/inspección falló: ${e?.shortMessage ?? e?.message ?? e}`);
  }
}


  async function listToken(tokenId) {
    try {
      if (!provider) return;
      const priceEth = prices[tokenId] ?? "";
      if (!priceEth || Number(priceEth) <= 0) {
        onStatus?.("⚠️ Pon un precio válido en ETH (ej: 0.01)");
        return;
      }

      const signer = await provider.getSigner();
      const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);

      const wei = ethers.parseEther(priceEth);
      onStatus?.(`Listando token ${tokenId} por ${priceEth} ETH...`);

      const tx = await market.list(BigInt(tokenId), wei);
      await tx.wait();

      onStatus?.(`✅ Solicitud enviada. Token ${tokenId} está en revisión del inspector.`);
      await loadMyTokens();
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ Listar falló: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function cancelListing(tokenId) {
    try {
      if (!provider) return;
      const signer = await provider.getSigner();
      const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);

      onStatus?.(`Cancelando listing de token ${tokenId}...`);
      const tx = await market.cancel(BigInt(tokenId));
      await tx.wait();

      onStatus?.(`✅ Listing cancelado para token ${tokenId}`);
      await loadMyTokens();
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ Cancelar falló: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  useEffect(() => {
    if (account && nftRead) loadMyTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, nftRead]);

  return (
    <section className={`card ${styles.wrapper}`}>
      <div className={styles.headerRow}>
        <div>
          <h2 className="cardTitle" style={{ margin: 0 }}>Mis Tokens</h2>
          <div className="cardSubtitle" style={{ margin: "6px 0 0 0" }}>
            Gestiona approvals y ventas de forma rápida.
          </div>
        </div>

        <button className="btn" onClick={loadMyTokens} disabled={loading}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      {!account ? (
        <div className="help">Conecta MetaMask para ver tus tokens.</div>
      ) : tokens.length === 0 ? (
        <div className="help">No tienes tokens todavía.</div>
      ) : (
        <div className={styles.grid}>
          {tokens.map((t) => {
            const listed = t.listingSeller && t.listingSeller !== ethers.ZeroAddress;
            const priceEth = listed ? ethers.formatEther(t.listingPrice) : "";
            const pending = t.pendingSeller && t.pendingSeller !== ethers.ZeroAddress;
            const pendingPriceEth = pending ? ethers.formatEther(t.pendingPrice) : "";
            const approvedOk =
              t.isForAll || (t.approved?.toLowerCase?.() === marketAddress?.toLowerCase?.());

            return (
              <div key={t.tokenId} className={styles.tokenCard}>
                <div className={styles.top}>
                  <div className={styles.leftBlock}>
                    <CardPreview
                      expansion={t.expansion}
                      numero={t.numero}
                      className={styles.previewWrap}
                    />

                    <div className={styles.infoBlock}>
                      <div className={styles.tokenId}>Token #{t.tokenId}</div>
                      <div className="subtle" style={{ marginTop: 4 }}>
                        {t.juego} · {t.expansion} · #{t.numero} · {t.rareza}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <span className={styles.estado}>{ESTADOS[t.estado] ?? "?"}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div className="small">Owner</div>
                    <div className="mono">{shortAddr(t.owner)}</div>
                  </div>
                </div>


                <div className={styles.actions}>
                  <button
                    className={`btn ${approvedOk ? "" : "btnPrimary"}`}
                    onClick={() => approveMarket(t.tokenId)}
                    disabled={approvedOk}
                    title={approvedOk ? "Ya aprobado" : "Aprobar el market para vender"}
                  >
                    {approvedOk ? "✅ Approved" : "Approve Market"}
                  </button>

                  {pending ? (
  <>
    <div className={styles.listedPill}>
      En revisión: <b>{pendingPriceEth} ETH</b>
    </div>
    <button
      className="btn btnDanger"
      onClick={() => cancelListing(t.tokenId)}
    >
      Cancelar solicitud
    </button>
  </>
) : !listed ? (
  <>
    <input
      className="input"
      placeholder="Precio (ETH) e.g. 0.01"
      value={prices[t.tokenId] ?? ""}
      onChange={(e) =>
        setPrices((p) => ({ ...p, [t.tokenId]: e.target.value }))
      }
      style={{ maxWidth: 180 }}
    />
    <button
      className="btn"
      onClick={() => listToken(t.tokenId)}
      disabled={!approvedOk}
      title={
        !approvedOk
          ? "Primero aprueba el market"
          : "Enviar a revisión del inspector"
      }
    >
      Poner en venta
    </button>
  </>
) : (
  <>
    <div className={styles.listedPill}>
      Listado: <b>{priceEth} ETH</b>
    </div>
    <button
      className="btn btnDanger"
      onClick={() => cancelListing(t.tokenId)}
    >
      Cancelar venta
    </button>
  </>
)}

                </div>

                {!approvedOk && (
                  <div className={styles.warning}>
                    ⚠️ Para vender, primero necesitas <b>Approve Market</b>.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
