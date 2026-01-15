import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import styles from "./MarketTab.module.css";

const ESTADOS = ["UNKNOWN", "POOR", "PLAYED", "GOOD", "NEAR_MINT", "MINT", "GRADED"];

function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function normalizeExpansion(x) {
  return (x || "").trim().toUpperCase();
}

// Acepta "1", "001", "0001" -> 1
function normalizeNumber(x) {
  const s = (x || "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export default function MarketTab({ provider, account, nftAddress, marketAddress, onStatus }) {
  const [loading, setLoading] = useState(false);

  // Filtros de búsqueda
  const [expansion, setExpansion] = useState("OP09");
  const [cardNumber, setCardNumber] = useState(""); // opcional (ej: 1 o 001)
  const [onlyListed, setOnlyListed] = useState(true);

  // Resultados
  const [results, setResults] = useState([]);

  function setStatus(msg) {
    onStatus?.(msg);
  }

  const NFT_ABI = useMemo(
    () => [
      // Enumerable
      "function totalSupply() view returns (uint256)",
      "function tokenByIndex(uint256 index) view returns (uint256)",
      // Metadata custom
      "function getCard(uint256 tokenId) view returns (address owner,string juego,string expansion,uint256 numero,string rareza,uint8 estado,uint64 updatedAt)",
      // Ownership (por si acaso)
      "function ownerOf(uint256 tokenId) view returns (address)",
    ],
    []
  );

  const MARKET_ABI = useMemo(
    () => [
      "function listings(uint256 tokenId) view returns (address seller, uint256 price)",
      "function buy(uint256 tokenId) payable",
    ],
    []
  );

  const nftRead = useMemo(() => {
    if (!provider || !nftAddress) return null;
    return new ethers.Contract(nftAddress, NFT_ABI, provider);
  }, [provider, nftAddress, NFT_ABI]);

  const marketRead = useMemo(() => {
    if (!provider || !marketAddress) return null;
    return new ethers.Contract(marketAddress, MARKET_ABI, provider);
  }, [provider, marketAddress, MARKET_ABI]);

  async function buy(tokenId, priceWei) {
    try {
      if (!provider) return;
      const signer = await provider.getSigner();
      const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);

      setStatus(`📝 Comprando token ${tokenId}...`);
      const tx = await market.buy(BigInt(tokenId), { value: BigInt(priceWei) });
      setStatus("⏳ Buy enviado, esperando confirmación...");
      await tx.wait();
      setStatus(`✅ Compra confirmada: token ${tokenId}`);

      // refrescar resultados
      await search();
    } catch (e) {
      console.error(e);
      setStatus(`❌ Buy falló: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function search() {
    try {
      if (!nftRead || !marketRead) {
        setStatus("❌ Provider/contratos no listos.");
        return;
      }

      const exp = normalizeExpansion(expansion);
      if (!exp) {
        setStatus("⚠️ Escribe una expansión (ej: OP09).");
        return;
      }

      const num = normalizeNumber(cardNumber); // null si vacío
      setLoading(true);
      setResults([]);
      setStatus("Buscando tokens...");

      const supply = await nftRead.totalSupply();
      const total = Number(supply);

      // 🔧 Para demos va perfecto. Si crece mucho, luego optimizamos por batches/índices on-chain.
      const rows = [];
      for (let i = 0; i < total; i++) {
        const tokenId = await nftRead.tokenByIndex(i);
        const idStr = tokenId.toString();

        // Leer card
        const data = await nftRead.getCard(tokenId);

        const cardExp = normalizeExpansion(data[2]);
        const cardNum = Number(data[3]);

        // Filtro por expansión/número
        if (cardExp !== exp) continue;
        if (num !== null && cardNum !== num) continue;

        // Listing info
        let listing = { seller: ethers.ZeroAddress, price: 0n };
        try {
          listing = await marketRead.listings(tokenId);
        } catch {
          // ignore
        }

        const isListed = listing?.seller && listing.seller !== ethers.ZeroAddress;

        if (onlyListed && !isListed) continue;

        rows.push({
          tokenId: idStr,
          owner: data[0],
          juego: data[1],
          expansion: data[2],
          numero: data[3].toString(),
          rareza: data[4],
          estado: Number(data[5]),
          updatedAt: Number(data[6]),
          listingSeller: listing?.seller ?? ethers.ZeroAddress,
          listingPrice: listing?.price ?? 0n,
          isListed,
        });
      }

      setResults(rows);
      setStatus(`✅ Encontrados ${rows.length} token(s) para ${exp}${num !== null ? `-${String(num).padStart(3, "0")}` : ""}${onlyListed ? " (solo listados)" : ""}.`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Error buscando: ${e?.shortMessage ?? e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  // Auto-buscar cuando entras (opcional)
  useEffect(() => {
    if (nftRead && marketRead) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nftRead, marketRead]);

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>Ventas</h2>

      <div className={styles.addrGrid}>
        <div className={styles.addrRow}>
          <b>NFT:</b> <span className={styles.code}>{nftAddress || "-"}</span>
        </div>
        <div className={styles.addrRow}>
          <b>Market:</b> <span className={styles.code}>{marketAddress || "-"}</span>
        </div>
      </div>

      <div className={styles.searchRow}>
        <div className={styles.field}>
          <div className={styles.label}>Expansión</div>
          <input
            className={styles.input}
            value={expansion}
            onChange={(e) => setExpansion(e.target.value)}
            placeholder="OP09"
          />
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Número (opcional)</div>
          <input
            className={styles.input}
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder="001 (o vacío)"
          />
        </div>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={onlyListed}
            onChange={(e) => setOnlyListed(e.target.checked)}
          />
          <span>Solo listados</span>
        </label>

        <div className={styles.actionsInline}>
          <button className={styles.btn} onClick={search} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
      </div>

      <hr className={styles.hr} />

      {!account ? (
        <div className={styles.hint}>Conecta MetaMask para comprar.</div>
      ) : results.length === 0 ? (
        <div className={styles.hint}>
          No hay resultados para esos filtros{onlyListed ? " (o no hay ventas)" : ""}.
        </div>
      ) : (
        <div className={styles.resultsGrid}>
          {results.map((t) => {
            const priceEth = t.isListed ? ethers.formatEther(t.listingPrice) : "";

            return (
              <div key={t.tokenId} className={styles.tokenCard}>
                <div className={styles.top}>
                  <div>
                    <div className={styles.tokenId}>Token #{t.tokenId}</div>
                    <div className={styles.metaLine}>
                      {t.juego} · {t.expansion} · #{t.numero} · {t.rareza}
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <span className={styles.estado}>
                        {ESTADOS[t.estado] ?? "?"}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div className={styles.small}>Owner</div>
                    <div className={styles.mono}>{shortAddr(t.owner)}</div>
                  </div>
                </div>

                {t.isListed ? (
                  <div className={styles.actions}>
                    <div className={styles.listedPill}>
                      Precio: <b>{priceEth} ETH</b>
                    </div>

                    <button
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => buy(t.tokenId, t.listingPrice)}
                      disabled={loading}
                      title="Comprar (envía ETH nativo)"
                    >
                      Comprar
                    </button>
                  </div>
                ) : (
                  <div className={styles.warning}>
                    ⚠️ Este token no está listado ahora mismo.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
